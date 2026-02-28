// ────────────────────────────────────────────────────────────
// stripe-webhook — Handles Stripe subscription lifecycle
// events.  Includes idempotency checks: before writing to
// the profiles table, verifies the current state differs
// from the target state to avoid redundant updates from
// duplicate webhook deliveries.
// ────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { getServiceClient } from '../_shared/supabase-admin.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
});
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

const TEAM_PRICE_IDS = new Set([
  Deno.env.get('STRIPE_PRICE_TEAM_MONTHLY'),
  Deno.env.get('STRIPE_PRICE_TEAM_ANNUAL'),
].filter(Boolean));

serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('No signature', { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', (err as Error).message);
    return new Response(`Webhook error: ${(err as Error).message}`, { status: 400 });
  }

  const supabase = getServiceClient();

  // ── Log event (idempotent via UNIQUE on stripe_event_id) ──
  const { error: logError } = await supabase.from('subscription_events').insert({
    stripe_event_id: event.id,
    event_type: event.type,
    payload: event.data.object,
  });

  // Duplicate event — already processed
  if (logError?.code === '23505') {
    return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
  }

  try {
    switch (event.type) {
      // ─────────────────────────────────────────────
      // Checkout completed — new subscription created
      // ─────────────────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        if (!userId || !session.subscription) break;

        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string
        );
        const item = subscription.items.data[0];
        const priceId = item?.price.id;
        const quantity = item?.quantity || 1;

        const tier = TEAM_PRICE_IDS.has(priceId) ? 'team' : 'pro';
        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

        // Idempotency: skip if already active with this subscription ID
        const { data: existing } = await supabase
          .from('profiles')
          .select('status, stripe_subscription_id')
          .eq('id', userId)
          .single();

        if (existing?.status === 'active' && existing?.stripe_subscription_id === subscription.id) {
          break; // already processed
        }

        await supabase.from('profiles').update({
          status: 'active',
          tier,
          seats: tier === 'team' ? quantity : 1,
          stripe_subscription_id: subscription.id,
          stripe_price_id: priceId,
          subscription_ends_at: periodEnd,
          trial_ends_at: null, // clear trial
        }).eq('id', userId);

        // Tag the event with user_id for audit
        await supabase.from('subscription_events')
          .update({ user_id: userId })
          .eq('stripe_event_id', event.id);

        break;
      }

      // ──────────────────────────────────
      // Invoice paid — renewal succeeded
      // ──────────────────────────────────
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string;
        if (!subId) break;

        const { data: profile } = await supabase
          .from('profiles')
          .select('id, status, subscription_ends_at')
          .eq('stripe_subscription_id', subId)
          .single();

        if (!profile) break;

        const subscription = await stripe.subscriptions.retrieve(subId);
        const newPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();

        // Idempotency: skip if already active with the same period end
        if (profile.status === 'active' && profile.subscription_ends_at === newPeriodEnd) {
          break;
        }

        await supabase.from('profiles').update({
          status: 'active',
          subscription_ends_at: newPeriodEnd,
        }).eq('id', profile.id);

        await supabase.from('subscription_events')
          .update({ user_id: profile.id })
          .eq('stripe_event_id', event.id);

        break;
      }

      // ──────────────────────────────────
      // Invoice payment failed
      // ──────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = invoice.subscription as string;
        if (!subId) break;

        const { data: profile } = await supabase
          .from('profiles')
          .select('id, status')
          .eq('stripe_subscription_id', subId)
          .single();

        if (!profile) break;

        // Idempotency: skip if already past_due
        if (profile.status === 'past_due') break;

        await supabase.from('profiles')
          .update({ status: 'past_due' })
          .eq('id', profile.id);

        await supabase.from('subscription_events')
          .update({ user_id: profile.id })
          .eq('stripe_event_id', event.id);

        break;
      }

      // ──────────────────────────────────────────
      // Subscription updated (cancel, seat change)
      // ──────────────────────────────────────────
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;

        const { data: profile } = await supabase
          .from('profiles')
          .select('id, status, seats, subscription_ends_at')
          .eq('stripe_subscription_id', subscription.id)
          .single();

        if (!profile) break;

        const item = subscription.items.data[0];
        const quantity = item?.quantity || 1;
        const priceId = item?.price.id;
        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

        const updates: Record<string, unknown> = {
          subscription_ends_at: periodEnd,
        };

        if (subscription.cancel_at_period_end) {
          updates.status = 'canceled';
        } else if (subscription.status === 'active') {
          updates.status = 'active';
        } else if (subscription.status === 'past_due') {
          updates.status = 'past_due';
        }

        // Update seats if team plan
        if (TEAM_PRICE_IDS.has(priceId)) {
          updates.seats = quantity;
        }

        // Idempotency: only write if something actually changed
        const hasChanges =
          (updates.status && updates.status !== profile.status) ||
          (updates.seats && updates.seats !== profile.seats) ||
          periodEnd !== profile.subscription_ends_at;

        if (!hasChanges) break;

        await supabase.from('profiles').update(updates).eq('id', profile.id);

        await supabase.from('subscription_events')
          .update({ user_id: profile.id })
          .eq('stripe_event_id', event.id);

        break;
      }

      // ──────────────────────────────────
      // Subscription deleted (fully ended)
      // ──────────────────────────────────
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;

        const { data: profile } = await supabase
          .from('profiles')
          .select('id, status')
          .eq('stripe_subscription_id', subscription.id)
          .single();

        if (!profile) break;

        // Idempotency: skip if already expired
        if (profile.status === 'expired') break;

        await supabase.from('profiles').update({
          status: 'expired',
          stripe_subscription_id: null,
        }).eq('id', profile.id);

        await supabase.from('subscription_events')
          .update({ user_id: profile.id })
          .eq('stripe_event_id', event.id);

        break;
      }
    }
  } catch (err) {
    console.error(`[stripe-webhook] Error processing ${event.type}:`, err);
    // Return 200 to avoid Stripe retries for processing errors
    // (the event is logged, we can investigate)
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
