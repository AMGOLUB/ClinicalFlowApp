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
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            pin: Mutex::new(None),
            authenticated: Mutex::new(false),
            last_activity: Mutex::new(std::time::Instant::now()),
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
) -> Result<bool, String> {
    let auth = load_auth(&app)?;
    let hash = auth.pin_hash.ok_or("No PIN set")?;

    if verify_pin(&pin, &hash)? {
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
        Ok(true)
    } else {
        tracing::warn!("Failed authentication attempt");
        Ok(false)
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
