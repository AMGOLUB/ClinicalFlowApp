// ════════════════════════════════════════════════════════════
// license.rs — Pre-PIN license caching & validation
//
// SECURITY: session.json stores ONLY auth tokens + license
// blob.  NEVER store PHI (transcripts, patient data, clinical
// notes, dental chart data) in this file.  session.json is
// encrypted with a compiled-in app key — it provides at-rest
// protection against casual disk reads but is NOT equivalent
// to the PIN-based AES-256-GCM encryption used for config.json.
//
// All PHI MUST go through config.json / session storage which
// is encrypted with the user's PIN via PBKDF2 + AES-256-GCM.
//
// v1: Symmetric AES-256 shared key (acceptable for desktop).
// v2 TODO: Switch to Ed25519 asymmetric signatures so that
//     extracting the public key from the binary cannot forge
//     license blobs.
// ════════════════════════════════════════════════════════════

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

// ── Compiled-in keys (replace before production builds) ──
// SESSION_KEY encrypts session.json on disk (auth tokens, NOT PHI).
const SESSION_KEY: &[u8; 32] = b"\x57\x07\xbe\xdb\x00\x38\xe5\x51\
\xa7\x5b\x8a\xb4\xbf\x0f\xcf\xb6\
\xb4\x57\x7c\x7e\xfc\x6e\xa0\x88\
\xbb\x79\xd0\x90\xfe\x79\xb3\x96";

// LICENSE_KEY decrypts the server-issued license blob.
// MUST match the LICENSE_ENCRYPTION_KEY env var on the Supabase server.
const LICENSE_KEY: &[u8; 32] = b"\x6c\xaa\x76\xa3\xb2\x7b\x54\xe6\
\x29\x2b\xbe\xb9\xc8\xe5\x09\x03\
\xc6\x4c\x62\xcc\xdf\x4b\x8a\xb8\
\x45\x44\x85\x44\x11\xde\x07\xa9";

// ════════════════════════════════════════════════════════════
// DATA STRUCTURES
// ════════════════════════════════════════════════════════════

/// Pre-PIN session data — stored in session.json.
/// SECURITY: Contains ONLY auth tokens + license metadata. NO PHI.
#[derive(Serialize, Deserialize, Default, Clone, Debug)]
pub struct SessionData {
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: String,
    #[serde(default)]
    pub license_key: String,
    /// Base64-encoded AES-256-GCM encrypted license from the server
    #[serde(default)]
    pub license_blob: String,
    /// ISO timestamp of last successful verification
    #[serde(default)]
    pub last_verified: String,
    #[serde(default)]
    pub cached_status: String,
    #[serde(default)]
    pub cached_tier: String,
    #[serde(default)]
    pub trial_ends: String,
    #[serde(default)]
    pub sub_ends: String,
    #[serde(default)]
    pub seats: u32,
    #[serde(default)]
    pub days_left: i32,
}

/// Decrypted license payload from the server.
#[derive(Serialize, Deserialize, Debug)]
pub struct LicensePayload {
    pub user_id: String,
    pub email: String,
    pub tier: String,
    pub status: String,
    pub seats: u32,
    pub seats_used: u32,
    pub valid_until: String,
    pub issued_at: String,
    pub license_key: String,
    #[serde(default)]
    pub trial_ends_at: Option<String>,
    #[serde(default)]
    pub subscription_ends_at: Option<String>,
}

// ════════════════════════════════════════════════════════════
// FILE I/O — session.json
// ════════════════════════════════════════════════════════════

fn session_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("session.json"))
}

fn encrypt_with_key(data: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, String> {
    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|e| format!("Cipher init: {}", e))?;
    let mut nonce_bytes = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ct = cipher
        .encrypt(nonce, data)
        .map_err(|e| format!("Encrypt failed: {}", e))?;
    let mut out = Vec::with_capacity(12 + ct.len());
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ct);
    Ok(out)
}

fn decrypt_with_key(encrypted: &[u8], key: &[u8; 32]) -> Result<Vec<u8>, String> {
    if encrypted.len() < 28 {
        return Err("Encrypted data too short".into());
    }
    let cipher =
        Aes256Gcm::new_from_slice(key).map_err(|e| format!("Cipher init: {}", e))?;
    let nonce = Nonce::from_slice(&encrypted[..12]);
    cipher
        .decrypt(nonce, &encrypted[12..])
        .map_err(|_| "Session decrypt failed — file may be corrupted".into())
}

fn load_session_from_disk(app: &AppHandle) -> Result<SessionData, String> {
    let path = session_path(app)?;
    if !path.exists() {
        return Ok(SessionData::default());
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let plain = decrypt_with_key(&bytes, SESSION_KEY)?;
    let s = String::from_utf8(plain).map_err(|e| e.to_string())?;
    serde_json::from_str(&s).map_err(|e| e.to_string())
}

fn save_session_to_disk(app: &AppHandle, data: &SessionData) -> Result<(), String> {
    let path = session_path(app)?;
    let json = serde_json::to_string(data).map_err(|e| e.to_string())?;
    let encrypted = encrypt_with_key(json.as_bytes(), SESSION_KEY)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, &encrypted).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn delete_session_file(app: &AppHandle) -> Result<(), String> {
    let path = session_path(app)?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ════════════════════════════════════════════════════════════
// LICENSE BLOB DECRYPTION
// ════════════════════════════════════════════════════════════

/// Decrypt a license blob received from the verify-license Edge Function.
/// The blob is base64-encoded: nonce (12) + ciphertext + GCM tag (16).
fn decrypt_license_blob_inner(blob_b64: &str) -> Result<LicensePayload, String> {
    use base64::Engine;
    let raw = base64::engine::general_purpose::STANDARD
        .decode(blob_b64)
        .map_err(|e| format!("Base64 decode: {}", e))?;
    if raw.len() < 28 {
        return Err("License blob too short".into());
    }
    let plain = decrypt_with_key(&raw, LICENSE_KEY)?;
    let s = String::from_utf8(plain).map_err(|e| e.to_string())?;
    serde_json::from_str(&s).map_err(|e| e.to_string())
}

// ════════════════════════════════════════════════════════════
// DEVICE IDENTIFICATION
// ════════════════════════════════════════════════════════════

/// SHA-256 hash of hostname:username — used for seat tracking.
fn compute_device_hash() -> String {
    let host = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "unknown".to_string());
    let user = whoami::username();
    let input = format!("{}:{}", host, user);
    let hash = Sha256::digest(input.as_bytes());
    hex::encode(hash)
}

/// Human-readable device name, e.g. "MacBook-Pro — drpatel"
fn compute_device_name() -> String {
    let host = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "Unknown".to_string());
    let user = whoami::username();
    format!("{} — {}", host, user)
}

// ════════════════════════════════════════════════════════════
// TAURI COMMANDS
// ════════════════════════════════════════════════════════════

/// Load the pre-PIN session (Supabase auth tokens + cached license).
/// Returns a default (empty) SessionData if no session exists yet.
#[tauri::command]
pub async fn load_pre_pin_session(app: AppHandle) -> Result<SessionData, String> {
    load_session_from_disk(&app)
}

/// Save the pre-PIN session. Called after login/signup and after
/// each successful license verification.
/// SECURITY: Only auth tokens + license blob. NEVER PHI.
#[tauri::command]
pub async fn save_pre_pin_session(
    app: AppHandle,
    session: SessionData,
) -> Result<(), String> {
    save_session_to_disk(&app, &session)
}

/// Delete session.json (called on logout or PIN reset).
#[tauri::command]
pub async fn clear_pre_pin_session(app: AppHandle) -> Result<(), String> {
    delete_session_file(&app)
}

/// Return this device's SHA-256 hash for seat tracking.
#[tauri::command]
pub async fn get_device_info() -> Result<(String, String), String> {
    Ok((compute_device_hash(), compute_device_name()))
}

/// Decrypt a server-issued license blob and return the payload.
/// Used for offline license validation.
#[tauri::command]
pub async fn decrypt_license(blob: String) -> Result<LicensePayload, String> {
    decrypt_license_blob_inner(&blob)
}
