// ────────────────────────────────────────────────────────────
// download-release — Returns a time-limited presigned URL for
// the ClinicalFlow .dmg hosted on Cloudflare R2.
// Requires an authenticated user who has selected a plan.
// ────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { getServiceClient, corsHeaders, jsonResponse } from '../_shared/supabase-admin.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── S3 presigned URL generation (lightweight, no SDK needed) ──

async function generatePresignedUrl(
  endpoint: string,
  bucket: string,
  key: string,
  accessKeyId: string,
  secretAccessKey: string,
  expiresIn = 900, // 15 minutes
): Promise<string> {
  const region = 'auto';
  const service = 's3';
  const host = endpoint.replace('https://', '');
  const now = new Date();
  const dateStamp = now.toISOString().replace(/[-:]/g, '').slice(0, 8);
  const amzDate = dateStamp + 'T' + now.toISOString().replace(/[-:]/g, '').slice(9, 15) + 'Z';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const credential = `${accessKeyId}/${credentialScope}`;

  const canonicalQueryString = [
    `X-Amz-Algorithm=AWS4-HMAC-SHA256`,
    `X-Amz-Credential=${encodeURIComponent(credential)}`,
    `X-Amz-Date=${amzDate}`,
    `X-Amz-Expires=${expiresIn}`,
    `X-Amz-SignedHeaders=host`,
  ].sort().join('&');

  const canonicalRequest = [
    'GET',
    `/${bucket}/${key}`,
    canonicalQueryString,
    `host:${host}`,
    '',
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  // Derive signing key
  const kDate = await hmacSha256(new TextEncoder().encode('AWS4' + secretAccessKey), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, 'aws4_request');

  const signature = await hmacSha256Hex(kSigning, stringToSign);

  return `${endpoint}/${bucket}/${key}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

async function hmacSha256(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

async function hmacSha256Hex(key: ArrayBuffer | Uint8Array, data: string): Promise<string> {
  const sig = await hmacSha256(key, data);
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(data: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Main handler ──

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify the user is authenticated via their JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Authentication required' }, 401);
    }

    const token = authHeader.slice(7);
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: 'Invalid or expired session' }, 401);
    }

    // Check user has selected a plan (completed signup flow)
    const admin = getServiceClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('selected_plan, status')
      .eq('id', user.id)
      .single();

    if (!profile?.selected_plan) {
      return jsonResponse({ error: 'Please select a plan before downloading' }, 403);
    }

    // Generate presigned URL for the installer
    const endpoint = Deno.env.get('R2_ENDPOINT')!;
    const bucket = Deno.env.get('R2_BUCKET') || 'clinicalflow-releases';
    const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')!;
    const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')!;

    // Determine platform from ?os= param or User-Agent header
    const url_params = new URL(req.url).searchParams;
    const osParam = url_params.get('os');
    const userAgent = req.headers.get('user-agent') || '';
    const isWindows = osParam === 'windows' || (!osParam && userAgent.includes('Windows'));
    const fileKey = isWindows
      ? 'ClinicalFlow_1.0.0_x64-setup.exe'
      : 'ClinicalFlow_1.0.0_aarch64.dmg';

    const url = await generatePresignedUrl(
      endpoint,
      bucket,
      fileKey,
      accessKeyId,
      secretAccessKey,
      900, // 15 min expiry
    );

    return jsonResponse({ url, expires_in: 900 });
  } catch (err) {
    console.error('download-release error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
