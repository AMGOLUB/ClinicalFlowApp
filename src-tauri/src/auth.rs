use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use argon2::{
    password_hash::SaltString,
    Argon2, PasswordHasher, PasswordVerifier,
};
use rand::rngs::OsRng;

// ============================================================
// APP STATE
// ============================================================

pub struct AppState {
    pub pin: Mutex<Option<String>>,
    pub authenticated: Mutex<bool>,
    pub last_activity: Mutex<std::time::Instant>,
    /// Consecutive failed PIN attempts (resets on success or app restart)
    pub failed_attempts: Mutex<u32>,
    /// When lockout expires (None = not locked out)
    pub lockout_until: Mutex<Option<std::time::Instant>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            pin: Mutex::new(None),
            authenticated: Mutex::new(false),
            last_activity: Mutex::new(std::time::Instant::now()),
            failed_attempts: Mutex::new(0),
            lockout_until: Mutex::new(None),
        }
    }
}

// ============================================================
// AUTH DATA (stored in auth.json — NEVER encrypted)
// ============================================================

#[derive(Serialize, Deserialize, Default)]
pub struct AuthData {
    #[serde(rename = "pinHash", skip_serializing_if = "Option::is_none")]
    pub pin_hash: Option<String>,
    #[serde(rename = "welcomeCompleted", default)]
    pub welcome_completed: bool,
}

fn app_data_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

pub fn load_auth(app: &AppHandle) -> Result<AuthData, String> {
    let path = app_data_dir(app)?.join("auth.json");
    if !path.exists() {
        return Ok(AuthData::default());
    }
    let contents = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read auth.json: {}", e))?;
    serde_json::from_str(&contents).map_err(|e| {
        tracing::warn!("Corrupted auth.json: {}. Resetting.", e);
        format!("Corrupted auth.json: {}", e)
    })
}

pub fn save_auth(app: &AppHandle, auth: &AuthData) -> Result<(), String> {
    let path = app_data_dir(app)?.join("auth.json");
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(auth)
        .map_err(|e| format!("Serialize failed: {}", e))?;
    std::fs::write(&tmp, &json).map_err(|e| format!("Write failed: {}", e))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("Rename failed: {}", e))?;
    Ok(())
}

// ============================================================
// PIN HASHING (Argon2)
// ============================================================

pub fn hash_pin(pin: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(pin.as_bytes(), &salt)
        .map_err(|e| format!("Hash failed: {}", e))?;
    Ok(hash.to_string())
}

pub fn verify_pin(pin: &str, hash: &str) -> Result<bool, String> {
    let parsed = argon2::PasswordHash::new(hash)
        .map_err(|e| format!("Invalid hash: {}", e))?;
    Ok(Argon2::default()
        .verify_password(pin.as_bytes(), &parsed)
        .is_ok())
}

// ============================================================
// TAURI COMMANDS
// ============================================================

#[tauri::command]
pub async fn check_has_pin(app: AppHandle) -> Result<bool, String> {
    let auth = load_auth(&app)?;
    Ok(auth.pin_hash.is_some())
}

#[tauri::command]
pub async fn check_welcome_completed(app: AppHandle) -> Result<bool, String> {
    let auth = load_auth(&app)?;
    Ok(auth.welcome_completed)
}

#[tauri::command]
pub async fn set_welcome_completed(app: AppHandle) -> Result<(), String> {
    let mut auth = load_auth(&app)?;
    auth.welcome_completed = true;
    save_auth(&app, &auth)?;
    tracing::info!("Welcome wizard completed");
    Ok(())
}

#[tauri::command]
pub async fn create_pin(
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

    let mut auth = load_auth(&app)?;
    auth.pin_hash = Some(hash);
    save_auth(&app, &auth)?;

    {
        *state.pin.lock().map_err(|e| e.to_string())? = Some(pin);
    }
    {
        *state.authenticated.lock().map_err(|e| e.to_string())? = true;
    }
    {
        *state.last_activity.lock().map_err(|e| e.to_string())? = std::time::Instant::now();
    }

    tracing::info!("PIN created successfully");
    Ok(())
}

#[tauri::command]
pub async fn authenticate(
    pin: String,
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    // Check lockout
    {
        let lockout = state.lockout_until.lock().map_err(|e| e.to_string())?;
        if let Some(until) = *lockout {
            if std::time::Instant::now() < until {
                let remaining = until.duration_since(std::time::Instant::now()).as_secs();
                return Ok(serde_json::json!({
                    "success": false,
                    "locked": true,
                    "lockout_seconds": remaining
                }));
            }
        }
    }

    let auth = load_auth(&app)?;
    let hash = auth.pin_hash.ok_or("No PIN set")?;

    if verify_pin(&pin, &hash)? {
        // Reset brute-force counters on success
        {
            *state.failed_attempts.lock().map_err(|e| e.to_string())? = 0;
        }
        {
            *state.lockout_until.lock().map_err(|e| e.to_string())? = None;
        }
        {
            *state.pin.lock().map_err(|e| e.to_string())? = Some(pin);
        }
        {
            *state.authenticated.lock().map_err(|e| e.to_string())? = true;
        }
        {
            *state.last_activity.lock().map_err(|e| e.to_string())? = std::time::Instant::now();
        }
        tracing::info!("User authenticated successfully");
        Ok(serde_json::json!({ "success": true }))
    } else {
        let attempts = {
            let mut a = state.failed_attempts.lock().map_err(|e| e.to_string())?;
            *a += 1;
            *a
        };

        tracing::warn!("Failed authentication attempt #{}", attempts);

        if attempts >= 5 {
            // Lock out for 15 minutes after 5 failures
            let lockout_duration = std::time::Duration::from_secs(15 * 60);
            *state.lockout_until.lock().map_err(|e| e.to_string())? =
                Some(std::time::Instant::now() + lockout_duration);
            tracing::warn!("Account locked for 15 minutes after {} failed attempts", attempts);
            Ok(serde_json::json!({
                "success": false,
                "locked": true,
                "lockout_seconds": 900
            }))
        } else {
            // Exponential delay: 1s, 2s, 4s, 8s
            let delay_secs = 1u64 << (attempts - 1); // 2^(n-1)
            tokio::time::sleep(std::time::Duration::from_secs(delay_secs)).await;
            Ok(serde_json::json!({
                "success": false,
                "locked": false,
                "delay_seconds": delay_secs
            }))
        }
    }
}

#[tauri::command]
pub async fn update_activity(state: tauri::State<'_, AppState>) -> Result<(), String> {
    *state.last_activity.lock().map_err(|e| e.to_string())? = std::time::Instant::now();
    Ok(())
}

#[tauri::command]
pub async fn lock_app(state: tauri::State<'_, AppState>) -> Result<(), String> {
    {
        *state.pin.lock().map_err(|e| e.to_string())? = None;
    }
    {
        *state.authenticated.lock().map_err(|e| e.to_string())? = false;
    }
    tracing::info!("App locked");
    Ok(())
}

#[tauri::command]
pub async fn reset_pin(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let dir = app_data_dir(&app)?;

    let _ = std::fs::remove_file(dir.join("auth.json"));
    let _ = std::fs::remove_file(dir.join("config.json"));
    let _ = std::fs::remove_file(dir.join("session.json")); // pre-PIN auth tokens + license
    let _ = std::fs::remove_file(dir.join("sessions/active.json"));
    let _ = std::fs::remove_dir_all(dir.join("sessions/archive"));

    {
        *state.pin.lock().map_err(|e| e.to_string())? = None;
    }
    {
        *state.authenticated.lock().map_err(|e| e.to_string())? = false;
    }

    tracing::info!("PIN reset — all user data wiped");
    Ok(())
}
