# ClinicalFlow — Phase 9: HIPAA Hardening + Welcome Screen

## Overview

Two goals in this phase:

**A. Welcome Screen** — First-launch setup wizard that gets new users configured and recording in under 2 minutes. Shows once, never again.

**B. HIPAA Hardening** — Encrypt data at rest, add authentication, auto-lock, sanitize logs, and document data handling. This doesn't make the app "HIPAA certified" (that's a legal/organizational process), but it implements the technical safeguards required for HIPAA compliance.

**Prerequisites:** Phases 1-8 complete. App is built, polished, and distributable.

---

# PART A: WELCOME SCREEN

## A1. When It Appears

- On first launch (no `config.json` exists, or `config.welcomeCompleted` is not `true`)
- Covers the entire app — user can't interact with the main UI until they finish or skip
- After completion, sets `welcomeCompleted: true` in config and never appears again
- User can access the same setup flows later through Settings if they need to change things

## A2. Welcome Screen Structure

### Screen 1: Welcome

Full-screen centered content, clean and minimal.

```html
<div class="welcome-screen" id="welcomeScreen">
  <div class="welcome-content">
    <div class="welcome-logo">
      <!-- App icon here -->
    </div>
    <h1 class="welcome-title">Welcome to ClinicalFlow</h1>
    <p class="welcome-subtitle">
      AI-powered clinical documentation that transcribes your encounters 
      and generates structured notes in real time.
    </p>
    <button class="btn btn-primary btn-lg" id="welcomeGetStarted">Get Started</button>
    <button class="btn btn-ghost btn-sm" id="welcomeSkip">Skip setup — I'll configure later</button>
  </div>
</div>
```

**Design:**
- Background: app's dark theme background (`#0B0F14`)
- Logo: the ClinicalFlow icon, large (128px)
- Title: DM Sans, 32px, bold, white
- Subtitle: 16px, `#94A3B8` (slate), max-width 480px, centered
- Get Started button: teal gradient, large
- Skip link: subtle, ghost style, below the button

### Screen 2: Choose Your Mode

Two cards side by side (stack vertically on narrow windows).

```html
<div class="welcome-step" id="welcomeStep2">
  <h2 class="welcome-step-title">How do you want to use ClinicalFlow?</h2>
  <p class="welcome-step-desc">You can use both modes — switch anytime in Settings.</p>
  
  <div class="welcome-cards">
    <div class="welcome-card" id="setupOnline">
      <div class="welcome-card-icon">☁️</div>
      <h3>Online Mode</h3>
      <ul>
        <li>Best transcription accuracy</li>
        <li>Speaker identification</li>
        <li>AI notes via Claude (~$0.01/note)</li>
        <li>Requires internet + API keys</li>
      </ul>
      <button class="btn btn-primary btn-md">Set Up Online</button>
    </div>
    
    <div class="welcome-card" id="setupOffline">
      <div class="welcome-card-icon">💻</div>
      <h3>Offline Mode</h3>
      <ul>
        <li>No internet required</li>
        <li>All data stays on your computer</li>
        <li>AI notes via Ollama (free)</li>
        <li>Requires ~6GB disk space</li>
      </ul>
      <button class="btn btn-outline btn-md">Set Up Offline</button>
    </div>
  </div>
  
  <button class="btn btn-ghost btn-sm" id="welcomeSkip2">Skip — I'll configure in Settings</button>
</div>
```

**Design:**
- Cards: dark surface (`#1E293B`), rounded corners (16px), subtle teal glow on hover
- Card with focus/selected: teal border
- Lists: checkmark or bullet, `#CBD5E1` text
- Side-by-side on desktop, stacked on windows < 800px wide

### Screen 3a: Online Setup

Shown if user clicked "Set Up Online."

```html
<div class="welcome-step" id="welcomeStep3Online">
  <h2 class="welcome-step-title">Online Mode Setup</h2>
  
  <div class="welcome-setup-section">
    <h4>1. Transcription API Key</h4>
    <p>Sign up at <a href="https://deepgram.com" target="_blank">deepgram.com</a> and paste your API key below.</p>
    <div class="welcome-input-group">
      <input type="password" id="welcomeDgKey" placeholder="Enter Deepgram API key..." class="input">
      <button class="btn btn-sm btn-primary" id="welcomeTestDg">Test</button>
      <span class="welcome-status" id="welcomeDgStatus"></span>
    </div>
  </div>
  
  <div class="welcome-setup-section">
    <h4>2. AI Note Generation Key</h4>
    <p>Sign up at <a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a> and paste your API key below.</p>
    <div class="welcome-input-group">
      <input type="password" id="welcomeClaudeKey" placeholder="Enter Claude API key (sk-ant-...)" class="input">
      <button class="btn btn-sm btn-primary" id="welcomeTestClaude">Test</button>
      <span class="welcome-status" id="welcomeClaudeStatus"></span>
    </div>
  </div>
  
  <div class="welcome-nav">
    <button class="btn btn-ghost" id="welcomeBack3">Back</button>
    <button class="btn btn-primary" id="welcomeDone3">Done — Start Using ClinicalFlow</button>
  </div>
</div>
```

**Test button behavior:**
- Deepgram: Send a quick WebSocket connect to verify the key works. Show ✓ green or ✗ red.
- Claude: Send a tiny API request (`messages: [{role: "user", content: "ping"}]`, max_tokens: 1). Show ✓ green or ✗ red.
- Both are optional — user can skip and add later.

### Screen 3b: Offline Setup

Shown if user clicked "Set Up Offline."

```html
<div class="welcome-step" id="welcomeStep3Offline">
  <h2 class="welcome-step-title">Offline Mode Setup</h2>
  
  <div class="welcome-setup-section">
    <h4>1. Whisper Transcription Model</h4>
    <p>ClinicalFlow uses Whisper AI for offline transcription.</p>
    <div class="welcome-model-status" id="welcomeWhisperStatus">
      <!-- Dynamically show: model found / model needs download / downloading -->
    </div>
    <button class="btn btn-sm btn-primary" id="welcomeDownloadWhisper" style="display:none;">Download Model (1.5GB)</button>
  </div>
  
  <div class="welcome-setup-section">
    <h4>2. Ollama for AI Notes (Optional)</h4>
    <p>Install <a href="https://ollama.com/download" target="_blank">Ollama</a>, then run <code>ollama pull llama3.1:8b</code> in Terminal.</p>
    <div class="welcome-input-group">
      <button class="btn btn-sm btn-primary" id="welcomeTestOllama">Test Connection</button>
      <span class="welcome-status" id="welcomeOllamaStatus"></span>
    </div>
    <p class="welcome-hint">Without Ollama, notes will use the rule-based generator or Cloud AI if configured.</p>
  </div>
  
  <div class="welcome-nav">
    <button class="btn btn-ghost" id="welcomeBack3b">Back</button>
    <button class="btn btn-primary" id="welcomeDone3b">Done — Start Using ClinicalFlow</button>
  </div>
</div>
```

### Screen 4: Ready (Optional — Could Skip This)

Quick confirmation screen after setup:

```html
<div class="welcome-step" id="welcomeStep4">
  <div class="welcome-ready-icon">✓</div>
  <h2 class="welcome-step-title">You're all set!</h2>
  <p class="welcome-step-desc">
    Add speakers in the sidebar, hit record, and start your encounter.
    ClinicalFlow will handle the rest.
  </p>
  <div class="welcome-tips">
    <div class="welcome-tip">💡 Try the demo first — click "Load Demo" in the sidebar</div>
    <div class="welcome-tip">⌨️ Press Cmd+R to start recording, Cmd+G to generate a note</div>
  </div>
  <button class="btn btn-primary btn-lg" id="welcomeFinish">Open ClinicalFlow</button>
</div>
```

## A3. Implementation Notes

**State management:**
```javascript
// In app.js init():
async function checkWelcome() {
  if (window.__TAURI__) {
    const config = await tauriInvoke('load_config');
    const parsed = config ? JSON.parse(config) : {};
    if (!parsed.welcomeCompleted) {
      showWelcome();
      return;
    }
  } else {
    // Browser dev mode: check localStorage
    if (!localStorage.getItem('ms-welcome-done')) {
      showWelcome();
      return;
    }
  }
  // No welcome needed — init normally
}
```

**CSS approach:**
```css
.welcome-screen {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.3s ease;
}

/* Steps slide in from the right */
.welcome-step {
  animation: slideInRight 0.3s ease;
}

@keyframes slideInRight {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}
```

**On completion:**
```javascript
function completeWelcome() {
  // Save keys if entered
  if (welcomeDgKey) saveApiKey(welcomeDgKey);
  if (welcomeClaudeKey) saveClaudeKey(welcomeClaudeKey);
  
  // Mark welcome as done
  if (window.__TAURI__) {
    tauriInvoke('save_config', { key: 'welcomeCompleted', value: true });
  } else {
    localStorage.setItem('ms-welcome-done', 'true');
  }
  
  // Remove welcome screen
  document.getElementById('welcomeScreen').remove();
  
  // Init the app normally
  initApp();
}
```

## A4. Welcome Screen Testing

- [ ] First launch: welcome screen appears
- [ ] Click "Skip" — welcome closes, app loads, main UI works
- [ ] Close app, reopen — welcome does NOT appear again
- [ ] Delete config.json, reopen — welcome appears again
- [ ] "Set Up Online" → enter keys → Test buttons work → Done
- [ ] "Set Up Offline" → Whisper status detected → Ollama test works → Done
- [ ] After completing welcome, keys are actually saved in Settings
- [ ] Back buttons work on each step
- [ ] Window resize doesn't break the layout

---

# PART B: HIPAA HARDENING

## B1. Encryption at Rest

All files containing PHI must be encrypted on disk. PHI includes: session transcripts, generated notes, archived sessions, and WAV recordings.

### B1.1 Add Encryption Dependencies

In `Cargo.toml`:
```toml
aes-gcm = "0.10"
rand = "0.8"
sha2 = "0.10"
pbkdf2 = { version = "0.12", features = ["simple"] }
base64 = "0.22"
```

### B1.2 Create `src-tauri/src/crypto.rs`

```rust
use aes_gcm::{
    aead::{Aead, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use rand::RngCore;
use sha2::Sha256;
use pbkdf2::pbkdf2_hmac;
use std::path::PathBuf;

const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;
const PBKDF2_ITERATIONS: u32 = 100_000;

/// Derive a 256-bit encryption key from a password/PIN
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

    let ciphertext = cipher.encrypt(nonce, plaintext)
        .map_err(|e| format!("Encryption failed: {}", e))?;

    // Prepend salt + nonce to ciphertext
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

    cipher.decrypt(nonce, ciphertext)
        .map_err(|_| "Decryption failed — wrong password or corrupted data".to_string())
}

/// Encrypt and write a file
pub fn encrypt_file(path: &PathBuf, data: &[u8], password: &[u8]) -> Result<(), String> {
    let encrypted = encrypt(data, password)?;
    let tmp = path.with_extension("enc.tmp");
    std::fs::write(&tmp, &encrypted).map_err(|e| format!("Write failed: {}", e))?;
    std::fs::rename(&tmp, path).map_err(|e| format!("Rename failed: {}", e))?;
    Ok(())
}

/// Read and decrypt a file
pub fn decrypt_file(path: &PathBuf, password: &[u8]) -> Result<Vec<u8>, String> {
    let encrypted = std::fs::read(path)
        .map_err(|e| format!("Read failed: {}", e))?;
    decrypt(&encrypted, password)
}
```

### B1.3 What Gets Encrypted

| File | Contains PHI? | Encrypt? |
|------|--------------|----------|
| `sessions/active.json` | Yes — transcript, speaker names | ✅ Yes |
| `sessions/archive/*.json` | Yes — full encounter data | ✅ Yes |
| `sessions/*.wav` | Yes — patient voice recording | ✅ Yes |
| `config.json` | Yes — API keys | ✅ Yes |
| `corrections.json` | No — generic medical terms | ❌ No |
| `logs/*.log` | Should not (see B4) | ❌ No (sanitize instead) |

### B1.4 Encryption Key Source

The encryption key derives from the user's PIN/password (see B2). The flow:

1. User sets a PIN on first launch (or in welcome screen)
2. PIN → PBKDF2 → 256-bit AES key
3. All PHI files encrypted with this key
4. On app launch, user enters PIN → key derived → files decrypted into memory
5. Files stay encrypted on disk at all times

**What if the user forgets their PIN?** Data is unrecoverable. This is by design for HIPAA — if someone steals the laptop, they can't read patient data. Show a clear warning when setting the PIN:

> "This PIN protects patient data with encryption. If you forget it, your data cannot be recovered. Write it down and store it securely."

### B1.5 Update Storage Commands

Wrap existing `save_session` and `load_session` with encryption:

```rust
#[tauri::command]
async fn save_session_encrypted(
    app: AppHandle,
    data: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let path = app_data_dir(&app)?.join("sessions").join("active.json");
    let pin = state.pin.lock().map_err(|e| e.to_string())?;
    let pin = pin.as_ref().ok_or("Not authenticated")?;

    crypto::encrypt_file(&path, data.as_bytes(), pin.as_bytes())
}

#[tauri::command]
async fn load_session_encrypted(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let path = app_data_dir(&app)?.join("sessions").join("active.json");
    if !path.exists() { return Ok("".to_string()); }

    let pin = state.pin.lock().map_err(|e| e.to_string())?;
    let pin = pin.as_ref().ok_or("Not authenticated")?;

    let decrypted = crypto::decrypt_file(&path, pin.as_bytes())?;
    String::from_utf8(decrypted).map_err(|e| format!("UTF-8 decode failed: {}", e))
}
```

---

## B2. PIN/Password Lock Screen

### B2.1 Lock Screen UI

Appears before the main app (and before the welcome screen) whenever authentication is required.

```html
<div class="lock-screen" id="lockScreen">
  <div class="lock-content">
    <div class="lock-icon">
      <!-- Lock or shield icon -->
    </div>
    <h2 class="lock-title">ClinicalFlow</h2>
    <p class="lock-subtitle" id="lockSubtitle">Enter your PIN to unlock</p>
    
    <!-- PIN input: 4-8 digit numeric PIN -->
    <div class="pin-input-group" id="pinInputGroup">
      <input type="password" class="pin-input" id="pinInput" 
             maxlength="8" inputmode="numeric" pattern="[0-9]*"
             placeholder="Enter PIN" autocomplete="off" autofocus>
      <button class="btn btn-primary" id="pinSubmit">Unlock</button>
    </div>
    
    <!-- Error message -->
    <p class="lock-error" id="lockError" style="display:none;">Incorrect PIN. Try again.</p>
    
    <!-- First-time: PIN creation mode -->
    <div class="pin-create" id="pinCreate" style="display:none;">
      <input type="password" class="pin-input" id="pinNew" 
             maxlength="8" inputmode="numeric" pattern="[0-9]*"
             placeholder="Choose a PIN (4-8 digits)" autocomplete="off">
      <input type="password" class="pin-input" id="pinConfirm" 
             maxlength="8" inputmode="numeric" pattern="[0-9]*"
             placeholder="Confirm PIN" autocomplete="off">
      <p class="lock-warning">⚠ This PIN encrypts patient data. If forgotten, data cannot be recovered.</p>
      <button class="btn btn-primary" id="pinCreateBtn">Set PIN & Continue</button>
    </div>
  </div>
</div>
```

### B2.2 PIN Storage

The PIN itself is NEVER stored. Instead, store a verification hash:

```rust
use argon2::{Argon2, PasswordHasher, PasswordVerifier, password_hash::SaltString};

/// Hash the PIN for verification (stored in config)
pub fn hash_pin(pin: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2.hash_password(pin.as_bytes(), &salt)
        .map_err(|e| format!("Hash failed: {}", e))?;
    Ok(hash.to_string())
}

/// Verify a PIN against the stored hash
pub fn verify_pin(pin: &str, hash: &str) -> Result<bool, String> {
    let parsed = argon2::PasswordHash::new(hash)
        .map_err(|e| format!("Invalid hash: {}", e))?;
    Ok(Argon2::default().verify_password(pin.as_bytes(), &parsed).is_ok())
}
```

Add `argon2` to Cargo.toml:
```toml
argon2 = "0.5"
```

**Flow:**
1. First launch: no PIN hash exists → show PIN creation screen
2. User creates PIN → hash stored in config (unencrypted, just the hash)
3. Subsequent launches: show PIN entry → verify against hash → derive encryption key → unlock

### B2.3 App State

```rust
use std::sync::Mutex;

pub struct AppState {
    pub pin: Mutex<Option<String>>,       // Current PIN (in memory only, for key derivation)
    pub authenticated: Mutex<bool>,       // Whether user has unlocked
    pub last_activity: Mutex<std::time::Instant>, // For auto-lock
}
```

Register as Tauri state:
```rust
.manage(AppState {
    pin: Mutex::new(None),
    authenticated: Mutex::new(false),
    last_activity: Mutex::new(std::time::Instant::now()),
})
```

### B2.4 Authentication Commands

```rust
#[tauri::command]
async fn authenticate(
    pin: String,
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<bool, String> {
    let config_path = app_data_dir(&app)?.join("config.json");
    let config: serde_json::Value = if config_path.exists() {
        let raw = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
        serde_json::from_str(&raw).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    if let Some(hash) = config.get("pinHash").and_then(|v| v.as_str()) {
        // Existing PIN — verify
        if verify_pin(&pin, hash)? {
            *state.pin.lock().map_err(|e| e.to_string())? = Some(pin);
            *state.authenticated.lock().map_err(|e| e.to_string())? = true;
            *state.last_activity.lock().map_err(|e| e.to_string())? = std::time::Instant::now();
            tracing::info!("User authenticated successfully");
            Ok(true)
        } else {
            tracing::warn!("Failed authentication attempt");
            Ok(false)
        }
    } else {
        Err("No PIN set".to_string())
    }
}

#[tauri::command]
async fn create_pin(
    pin: String,
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    if pin.len() < 4 || pin.len() > 8 {
        return Err("PIN must be 4-8 digits".to_string());
    }
    if !pin.chars().all(|c| c.is_ascii_digit()) {
        return Err("PIN must contain only numbers".to_string());
    }

    let hash = hash_pin(&pin)?;

    // Save hash to config
    let config_path = app_data_dir(&app)?.join("config.json");
    let mut config: serde_json::Value = if config_path.exists() {
        let raw = std::fs::read_to_string(&config_path).unwrap_or_default();
        serde_json::from_str(&raw).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    config["pinHash"] = serde_json::Value::String(hash);
    let tmp = config_path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(&config).unwrap())
        .map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &config_path).map_err(|e| e.to_string())?;

    // Set state
    *state.pin.lock().map_err(|e| e.to_string())? = Some(pin);
    *state.authenticated.lock().map_err(|e| e.to_string())? = true;
    *state.last_activity.lock().map_err(|e| e.to_string())? = std::time::Instant::now();

    tracing::info!("PIN created successfully");
    Ok(())
}

#[tauri::command]
async fn check_has_pin(app: AppHandle) -> Result<bool, String> {
    let config_path = app_data_dir(&app)?.join("config.json");
    if !config_path.exists() { return Ok(false); }
    let raw = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let config: serde_json::Value = serde_json::from_str(&raw).unwrap_or(serde_json::json!({}));
    Ok(config.get("pinHash").is_some())
}
```

---

## B3. Auto-Lock on Inactivity

### B3.1 Frontend Timer

```javascript
const AUTO_LOCK_MINUTES = 5;
let autoLockTimer = null;

function resetAutoLock() {
  if (!window.__TAURI__) return;
  clearTimeout(autoLockTimer);
  autoLockTimer = setTimeout(() => {
    lockApp();
  }, AUTO_LOCK_MINUTES * 60 * 1000);
  
  // Also update Rust state
  tauriInvoke('update_activity').catch(() => {});
}

function lockApp() {
  // If recording, don't lock — but DO lock when recording stops
  if (App.isRecording) {
    // Defer lock until recording stops
    App.lockAfterRecording = true;
    return;
  }
  
  // Show lock screen
  document.getElementById('lockScreen').style.display = 'flex';
  document.getElementById('pinInput').value = '';
  document.getElementById('pinInput').focus();
  
  // Clear sensitive data from DOM (optional extra safety)
  // Don't clear App state — just hide the UI
}

// Reset timer on any user interaction
['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll'].forEach(event => {
  document.addEventListener(event, resetAutoLock, { passive: true });
});
```

### B3.2 Rust Activity Tracking

```rust
#[tauri::command]
async fn update_activity(state: tauri::State<'_, AppState>) -> Result<(), String> {
    *state.last_activity.lock().map_err(|e| e.to_string())? = std::time::Instant::now();
    Ok(())
}
```

### B3.3 Lock on Window Close / Sleep

```javascript
// Lock when the app loses focus for an extended period
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Start a shorter timer when app is hidden
    autoLockTimer = setTimeout(() => {
      lockApp();
    }, 2 * 60 * 1000); // 2 minutes when hidden
  } else {
    resetAutoLock();
  }
});
```

### B3.4 Settings: Auto-Lock Duration

Add to the Settings drawer:

```html
<div class="settings-row">
  <div class="settings-row-info">
    <div class="settings-row-label">Auto-lock</div>
    <div class="settings-row-desc">Lock ClinicalFlow after inactivity</div>
  </div>
  <select class="select" id="autoLockSelect" style="width: 140px;">
    <option value="2">2 minutes</option>
    <option value="5" selected>5 minutes</option>
    <option value="10">10 minutes</option>
    <option value="15">15 minutes</option>
    <option value="30">30 minutes</option>
    <option value="0">Never (not recommended)</option>
  </select>
</div>
```

---

## B4. Log Sanitization

### B4.1 The Rule

**Log files must NEVER contain PHI.** This means:
- No transcript text
- No patient names or speaker names
- No note content
- No API responses containing clinical data

Logs CAN contain:
- Timestamps
- Operation names ("session saved", "note generated")
- Byte counts and durations
- Error messages (without clinical content)
- System info (OS, memory, model names)

### B4.2 Audit All Tracing Calls

Tell Claude Code:
> "Search every `tracing::info!`, `tracing::warn!`, `tracing::error!`, and `tracing::debug!` call in the Rust codebase. For each one, verify it does NOT log any of these: transcript text, patient names, speaker names, note content, or API responses containing clinical data. If any do, replace the sensitive content with a length or hash. For example, change `tracing::info!('Transcribed: {}', text)` to `tracing::info!('Transcribed: {} chars', text.len())`."

### B4.3 Frontend Console Logs

Same rule applies to `console.log` / `console.error` in app.js:

```javascript
// BAD — logs patient data:
console.log('Transcript entry:', entry.text);
console.log('Generated note:', noteContent);

// GOOD — logs metadata only:
console.log('[ClinicalFlow] Transcript entry added, length:', entry.text.length);
console.log('[ClinicalFlow] Note generated, sections:', sections.length);
```

---

## B5. API Key Security

### B5.1 Current State

API keys (Deepgram, Claude) are currently stored in `config.json` as plain text. After encryption (B1), the entire config file is encrypted, so the keys are protected at rest.

### B5.2 In-Memory Security

- API keys should be held in JavaScript variables only while the app is running
- On lock (B3), keys remain in memory (since the user will unlock again)
- On quit, JavaScript context is destroyed — keys gone
- Never log API key values

### B5.3 Key Rotation Reminder (Optional)

If you want to be thorough, show a subtle reminder every 90 days:
```javascript
if (daysSinceKeySet > 90) {
  toast('Consider rotating your API keys for security.', 'info', 5000);
}
```

---

## B6. Network Request Documentation

### B6.1 What Data Leaves the Device

Create a clear reference (for your own security documentation and for the website's security page):

| Destination | Data Sent | When | Encryption |
|-------------|-----------|------|------------|
| `wss://api.deepgram.com` | Raw audio stream | During online recording only | WSS (TLS) |
| `https://api.anthropic.com` | Transcript text + prompt | During Cloud AI note generation | HTTPS (TLS) |
| `http://localhost:11434` | Transcript text + prompt | During Ollama note generation | None (localhost only) |
| Nothing | Everything else | Always | N/A — stays on device |

### B6.2 Offline Mode Verification

When both transcription and note generation are set to offline mode, **zero network requests** should be made. Verify:

```javascript
// In a future test/debug mode:
if (App.transcriptionMode === 'offline' && App.aiEngine === 'ollama') {
  console.log('[ClinicalFlow] Full offline mode — no data leaves this device');
}
```

---

## B7. Data Handling Documentation

Create a document (for the website and for clinics) that explains:

1. **What data ClinicalFlow collects** — audio, transcript, generated notes, settings
2. **Where it's stored** — local filesystem only, encrypted with AES-256
3. **What leaves the device** — only when user explicitly enables online features
4. **Who has access** — only the authenticated user on this device
5. **How long it's retained** — user controls archiving and deletion
6. **How it's deleted** — New Session clears active data; archived sessions can be individually deleted; uninstalling removes all data

This becomes the `/docs/security` page on the website and can be included in the app's Help section.

---

## B8. BAA Guidance

### B8.1 Deepgram

Deepgram offers HIPAA-eligible plans with BAAs. The user (clinic) needs to:
1. Sign up for Deepgram's Enterprise or Healthcare plan
2. Execute a BAA with Deepgram
3. Use the same API key in ClinicalFlow

Documentation: [deepgram.com/hipaa](https://deepgram.com) (check their current offerings)

### B8.2 Anthropic

Anthropic offers HIPAA-eligible API access. The user needs to:
1. Contact Anthropic's sales team for a HIPAA-eligible API agreement
2. Execute a BAA with Anthropic
3. Use the API key from the HIPAA-eligible account

ClinicalFlow's role: provide the technical safeguards. The clinic's role: sign the legal agreements.

### B8.3 In-App Guidance

Add a note in Settings under each API key:

```
For HIPAA compliance, ensure your API key is from a HIPAA-eligible 
account with a signed Business Associate Agreement (BAA).
```

---

## B9. Testing Checklist

### PIN / Lock Screen
- [ ] First launch: PIN creation screen appears
- [ ] PIN must be 4-8 digits (reject shorter, longer, or non-numeric)
- [ ] Confirm PIN must match
- [ ] Warning about unrecoverable data is displayed
- [ ] After setting PIN, app unlocks and works normally
- [ ] Close app, reopen — PIN entry screen appears
- [ ] Wrong PIN — error message, stays on lock screen
- [ ] Correct PIN — app unlocks, data loads
- [ ] Three wrong PINs — no lockout (just keep trying, HIPAA doesn't require lockout for desktop apps)

### Auto-Lock
- [ ] Leave app idle for 5 minutes — lock screen appears
- [ ] During recording, idle timeout does NOT lock (would lose recording)
- [ ] After recording stops with pending lock, lock screen appears
- [ ] Changing auto-lock duration in Settings takes effect immediately
- [ ] "Never" option works (no auto-lock, shows warning)

### Encryption
- [ ] Open `sessions/active.json` in a text editor while the app is running — file is encrypted (binary/gibberish, not readable JSON)
- [ ] Same for archived sessions
- [ ] Same for config.json (API keys not visible as plain text)
- [ ] Change PIN: old data should be re-encrypted with new PIN (or: implement PIN change by decrypt-all-with-old, encrypt-all-with-new)
- [ ] Corrupt an encrypted file — app detects it, backs up, starts fresh (same as Phase 6 integrity check)

### Log Sanitization
- [ ] Open today's log file
- [ ] Search for any patient names, transcript text, or clinical content — should find NONE
- [ ] Logs should only contain: timestamps, operation names, byte counts, error metadata

### Welcome Screen
- [ ] Run all tests from section A4

---

## B10. Files Modified / Created Summary

| File | Action |
|------|--------|
| `src-tauri/src/crypto.rs` | **New** — AES-256-GCM encryption/decryption |
| `src-tauri/src/lib.rs` | Register crypto module, add AppState, register auth commands |
| `src-tauri/src/storage.rs` | Wrap save/load with encryption, add auth commands |
| `src-tauri/Cargo.toml` | Add `aes-gcm`, `rand`, `sha2`, `pbkdf2`, `argon2`, `base64` |
| `src/index.html` | Lock screen HTML, welcome screen HTML, auto-lock setting |
| `src/app.js` | Lock/unlock logic, auto-lock timer, welcome flow, PIN management |
| `src/styles.css` | Lock screen styles, welcome screen styles |
| All tracing calls | Audit and sanitize — no PHI in logs |

---

## B11. What This Does NOT Do

- **HIPAA certification** — There is no "HIPAA certified" stamp. Compliance is an organizational process involving policies, training, and legal agreements. This phase implements the *technical safeguards*.
- **User management / RBAC** — This is a single-user desktop app. Multi-user access control is out of scope.
- **Remote wipe** — If the laptop is stolen, the data is encrypted. Remote wipe would require a server, which contradicts the offline-first design.
- **Audit trail of who accessed records** — Single-user app, so the audit trail is the log file (with login timestamps). For multi-provider clinics, a server-based EHR is the right solution.

---

## B12. After Phase 9

The app is feature-complete and HIPAA-hardened. Remaining work:

- **Website** — Landing page, download portal, comprehensive documentation
- **Marketing** — Physician outreach, demos, case studies
- **Ongoing** — Bug fixes, model updates, user feedback
