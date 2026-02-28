use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::RngCore;
use rand::rngs::OsRng;
use sha2::Sha256;
use pbkdf2::pbkdf2_hmac;
use std::path::PathBuf;

const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;
const PBKDF2_ITERATIONS: u32 = 100_000;

/// Derive a 256-bit encryption key from a PIN using PBKDF2-HMAC-SHA256
fn derive_key(password: &[u8], salt: &[u8]) -> [u8; KEY_LEN] {
    let mut key = [0u8; KEY_LEN];
    pbkdf2_hmac::<Sha256>(password, salt, PBKDF2_ITERATIONS, &mut key);
    key
}

/// Encrypt data. Returns: salt (16) + nonce (12) + ciphertext
pub fn encrypt(plaintext: &[u8], password: &[u8]) -> Result<Vec<u8>, String> {
    let mut salt = [0u8; SALT_LEN];
    OsRng.fill_bytes(&mut salt);

    let key = derive_key(password, &salt);
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("Cipher init failed: {}", e))?;

    let mut nonce_bytes = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| format!("Encryption failed: {}", e))?;

    let mut output = Vec::with_capacity(SALT_LEN + NONCE_LEN + ciphertext.len());
    output.extend_from_slice(&salt);
    output.extend_from_slice(&nonce_bytes);
    output.extend_from_slice(&ciphertext);

    Ok(output)
}

/// Decrypt data. Input: salt (16) + nonce (12) + ciphertext
pub fn decrypt(encrypted: &[u8], password: &[u8]) -> Result<Vec<u8>, String> {
    if encrypted.len() < SALT_LEN + NONCE_LEN + 16 {
        return Err("Data too short to be encrypted".to_string());
    }

    let salt = &encrypted[..SALT_LEN];
    let nonce_bytes = &encrypted[SALT_LEN..SALT_LEN + NONCE_LEN];
    let ciphertext = &encrypted[SALT_LEN + NONCE_LEN..];

    let key = derive_key(password, salt);
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| format!("Cipher init failed: {}", e))?;

    let nonce = Nonce::from_slice(nonce_bytes);

    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Decryption failed — wrong PIN or corrupted data".to_string())
}

/// Encrypt data and write to file atomically (tmp + rename)
pub fn encrypt_file(path: &PathBuf, data: &[u8], password: &[u8]) -> Result<(), String> {
    let encrypted = encrypt(data, password)?;
    let tmp = path.with_extension("enc.tmp");
    std::fs::write(&tmp, &encrypted).map_err(|e| format!("Write failed: {}", e))?;
    std::fs::rename(&tmp, path).map_err(|e| format!("Rename failed: {}", e))?;
    Ok(())
}

/// Read and decrypt a file
pub fn decrypt_file(path: &PathBuf, password: &[u8]) -> Result<Vec<u8>, String> {
    let encrypted =
        std::fs::read(path).map_err(|e| format!("Read failed: {}", e))?;
    decrypt(&encrypted, password)
}
