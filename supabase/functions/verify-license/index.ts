// ────────────────────────────────────────────────────────────
// verify-license — Returns an AES-256-GCM encrypted license
// blob for valid subscribers.  Called by the Tauri app on
// every launch (24-hour re-validation interval).
// ────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getServiceClient, corsHeaders, jsonResponse } from '../_shared/supabase-admin.ts';
import { encryptLicense, type LicensePayload } from '../_shared/license-crypto.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { license_key, device_hash, device_name } = await req.json();
    if (!license_key) {
      return jsonResponse({ error: 'license_key required' }, 400);
    }

    const supabase = getServiceClient();

    // ── Look up profile by license_key ──
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('license_key', license_key)
      .single();

    if (error || !profile) {
      return jsonResponse({ valid: false, status: 'none', reason: 'License not found' });
    }

    // ── Email verification gate ──
    if (profile.status === 'pending_verification') {
      return jsonResponse({
        valid: false,
        status: 'pending_verification',
        reason: 'Please verify your email address to activate your trial.',
      });
    }

    // ── Determine effective status ──
    let effectiveStatus = profile.status as string;
    let reason = '';
    let daysRemaining: number | null = null;

    if (profile.status === 'trial') {
      const trialEnd = new Date(profile.trial_ends_at);
      if (trialEnd < new Date()) {
        effectiveStatus = 'expired';
        reason = 'Trial expired';
        await supabase.from('profiles')
          .update({ status: 'expired' })
          .eq('id', profile.id);
      } else {
        daysRemaining = Math.ceil((trialEnd.getTime() - Date.now()) / 86_400_000);
        reason = `Trial active (${daysRemaining} days remaining)`;
      }
    } else if (profile.status === 'active') {
      if (profile.subscription_ends_at) {
        const subEnd = new Date(profile.subscription_ends_at);
        daysRemaining = Math.ceil((subEnd.getTime() - Date.now()) / 86_400_000);
      }
      reason = 'Subscription active';
    } else if (profile.status === 'past_due') {
      reason = 'Payment overdue — please update your payment method';
    } else if (profile.status === 'canceled') {
      if (profile.subscription_ends_at && new Date(profile.subscription_ends_at) > new Date()) {
        effectiveStatus = 'active'; // still in paid period
        daysRemaining = Math.ceil(
          (new Date(profile.subscription_ends_at).getTime() - Date.now()) / 86_400_000
        );
        reason = `Canceled — access until ${new Date(profile.subscription_ends_at).toLocaleDateString()}`;
      } else {
        effectiveStatus = 'expired';
        reason = 'Subscription canceled';
      }
    } else if (profile.status === 'expired') {
      reason = 'Subscription expired';
    }

    // ── Device activation tracking ──
    let seatsUsed = 0;
    if (device_hash) {
      // Upsert device with human-readable name
      await supabase.from('device_activations').upsert(
        {
          user_id: profile.id,
          device_hash,
          device_name: device_name || 'Unknown device',
          last_seen: new Date().toISOString(),
        },
        { onConflict: 'user_id,device_hash' }
      );

      // Count active devices (seen in last 30 days)
      const { count } = await supabase
        .from('device_activations')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .gte('last_seen', new Date(Date.now() - 30 * 86_400_000).toISOString());

      seatsUsed = count || 0;

      // Enforce seat limit for team tier
      if (profile.tier === 'team' && seatsUsed > profile.seats) {
        return jsonResponse({
          valid: false,
          status: 'seat_limit',
          reason: `All ${profile.seats} seat(s) are in use. Remove a device or upgrade seats.`,
          seats_used: seatsUsed,
          seats_allowed: profile.seats,
        });
      }
    }

    // ── Build response ──
    const isValid =
      ['trial', 'active'].includes(effectiveStatus) ||
      effectiveStatus === 'past_due'; // past_due gets grace

    const validUntil = new Date(Date.now() + 24 * 3_600_000).toISOString(); // 24h from now

    const licensePayload: LicensePayload = {
      user_id: profile.id,
      email: profile.email,
      tier: profile.tier,
      status: effectiveStatus,
      seats: profile.seats,
      seats_used: seatsUsed,
      valid_until: validUntil,
      issued_at: new Date().toISOString(),
      license_key: profile.license_key,
      trial_ends_at: profile.trial_ends_at,
      subscription_ends_at: profile.subscription_ends_at,
    };

    const licenseBlob = await encryptLicense(licensePayload);

    return jsonResponse({
      valid: isValid,
      status: effectiveStatus,
      tier: profile.tier,
      reason,
      days_remaining: daysRemaining,
      trial_ends_at: profile.trial_ends_at,
      subscription_ends_at: profile.subscription_ends_at,
      seats: profile.seats,
      seats_used: seatsUsed,
      license_blob: licenseBlob,
    });
  } catch (err) {
    console.error('[verify-license]', err);
    return jsonResponse({ error: 'Internal error', details: (err as Error).message }, 500);
  }
});
