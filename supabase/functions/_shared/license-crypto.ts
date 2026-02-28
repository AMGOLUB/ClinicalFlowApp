// ────────────────────────────────────────────────────────────
// license-crypto.ts — AES-256-GCM encryption for license payloads
// Uses the Deno Web Crypto API (no npm dependencies).
// ────────────────────────────────────────────────────────────

const LICENSE_KEY_HEX = Deno.env.get('LICENSE_ENCRYPTION_KEY')!;

export interface LicensePayload {
  user_id: string;
  email: string;
  tier: string;
  status: string;
  seats: number;
  seats_used: number;
  valid_until: string;   // ISO — 24h from issuance
  issued_at: string;     // ISO
  license_key: string;
  trial_ends_at?: string | null;
  subscription_ends_at?: string | null;
}

/**
 * Encrypt a license payload with AES-256-GCM.
 * Returns a base64 string: nonce (12 bytes) + ciphertext + GCM tag (16 bytes).
 */
export async function encryptLicense(payload: LicensePayload): Promise<string> {
  const keyBytes = hexToBytes(LICENSE_KEY_HEX);
  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']
  );

  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext)
  );

  // Combine: nonce (12) + ciphertext+tag
  const result = new Uint8Array(12 + ciphertext.byteLength);
  result.set(nonce, 0);
  result.set(ciphertext, 12);

  return btoa(String.fromCharCode(...result));
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
