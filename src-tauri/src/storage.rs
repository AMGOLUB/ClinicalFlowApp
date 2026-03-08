use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use serde::Serialize;

use crate::auth::AppState;
use crate::crypto;

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

/// Sanitize a filename to prevent path traversal attacks.
/// Strips directory separators, "..", and null bytes. Returns error if result is empty.
fn sanitize_filename(name: &str) -> Result<String, String> {
    let sanitized: String = name
        .replace(['/', '\\', '\0'], "")
        .replace("..", "")
        .trim()
        .to_string();
    if sanitized.is_empty() {
        return Err("Invalid filename".to_string());
    }
    Ok(sanitized)
}

#[tauri::command]
pub async fn init_storage(app: AppHandle) -> Result<(), String> {
    let base = app_data_dir(&app)?;
    let dirs = [
        base.clone(),
        base.join("sessions"),
        base.join("sessions").join("archive"),
        base.join("exports"),
        base.join("logs"),
    ];
    for dir in &dirs {
        fs::create_dir_all(dir)
            .map_err(|e| format!("Failed to create {}: {}", dir.display(), e))?;
    }

    // Copy bundled corrections.json to app data if it doesn't exist yet
    let corrections_dest = base.join("corrections.json");
    if !corrections_dest.exists() {
        let resource_path = app
            .path()
            .resource_dir()
            .map_err(|e| e.to_string())?
            .join("resources")
            .join("corrections.json");
        if resource_path.exists() {
            fs::copy(&resource_path, &corrections_dest)
                .map_err(|e| format!("Failed to copy corrections.json: {}", e))?;
        }
    }
    Ok(())
}

// ============================================================
// CONFIG (single file for all settings)
// ============================================================

#[tauri::command]
pub async fn load_config(app: AppHandle) -> Result<String, String> {
    let path = app_data_dir(&app)?.join("config.json");
    let contents = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Ok("{}".to_string()),
    };
    match serde_json::from_str::<serde_json::Value>(&contents) {
        Ok(_) => Ok(contents),
        Err(e) => {
            tracing::error!("Corrupted config file: {}. Resetting to defaults.", e);
            let backup_path = path.with_extension(format!(
                "corrupted.{}", chrono::Local::now().format("%Y%m%d_%H%M%S")
            ));
            let _ = fs::rename(&path, &backup_path);
            Ok("{}".to_string())
        }
    }
}

#[tauri::command]
pub async fn save_config(app: AppHandle, config_json: String) -> Result<(), String> {
    let path = app_data_dir(&app)?.join("config.json");
    let tmp_path = path.with_extension("json.tmp");
    fs::write(&tmp_path, &config_json)
        .map_err(|e| { tracing::error!("Failed to write config: {}", e); format!("Failed to write config: {}", e) })?;
    fs::rename(&tmp_path, &path)
        .map_err(|e| format!("Failed to rename config: {}", e))?;
    tracing::debug!("Config saved");
    Ok(())
}

// ============================================================
// ACTIVE SESSION
// ============================================================

#[tauri::command]
pub async fn save_session(app: AppHandle, session_json: String) -> Result<(), String> {
    let path = app_data_dir(&app)?
        .join("sessions")
        .join("active.json");
    let tmp_path = path.with_extension("json.tmp");
    fs::write(&tmp_path, &session_json)
        .map_err(|e| { tracing::error!("Failed to write session: {}", e); format!("Failed to write session: {}", e) })?;
    fs::rename(&tmp_path, &path)
        .map_err(|e| format!("Failed to rename session: {}", e))?;
    tracing::debug!("Session saved: {} bytes", session_json.len());
    Ok(())
}

#[tauri::command]
pub async fn load_session(app: AppHandle) -> Result<String, String> {
    let path = app_data_dir(&app)?
        .join("sessions")
        .join("active.json");
    let contents = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Ok("".to_string()),
    };
    match serde_json::from_str::<serde_json::Value>(&contents) {
        Ok(_) => Ok(contents),
        Err(e) => {
            tracing::error!("Corrupted session file: {}. Backing up.", e);
            let backup_path = path.with_extension(format!(
                "corrupted.{}", chrono::Local::now().format("%Y%m%d_%H%M%S")
            ));
            let _ = fs::rename(&path, &backup_path);
            tracing::info!("Corrupted session backed up to: {}", backup_path.display());
            Ok("".to_string())
        }
    }
}

#[tauri::command]
pub async fn clear_session(app: AppHandle) -> Result<(), String> {
    let path = app_data_dir(&app)?
        .join("sessions")
        .join("active.json");
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Failed to clear session: {}", e))?;
    }
    Ok(())
}

// ============================================================
// SESSION ARCHIVE
// ============================================================

#[tauri::command]
pub async fn archive_session(
    app: AppHandle,
    session_json: String,
    patient_name: Option<String>,
    audio_source_path: Option<String>,
) -> Result<String, String> {
    let base = app_data_dir(&app)?;
    let archive_dir = base.join("sessions").join("archive");

    let now = chrono::Local::now();
    let name_part = patient_name.unwrap_or_else(|| "Session".to_string());
    let safe_name: String = name_part
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '_' })
        .collect();
    let filename = format!("{}_{}", now.format("%Y-%m-%d_%H-%M"), safe_name);

    let json_path = archive_dir.join(format!("{}.json", filename));
    fs::write(&json_path, &session_json)
        .map_err(|e| format!("Failed to archive session: {}", e))?;
    tracing::info!("Session archived: {} chars filename", filename.len());

    if let Some(audio_src) = audio_source_path {
        let audio_src_path = PathBuf::from(&audio_src);
        let sessions_dir = base.join("sessions");
        // Reject traversal attempts; path is app-constructed so string check is sufficient
        let src_str = audio_src_path.to_string_lossy();
        if src_str.contains("..") {
            tracing::warn!("Audio source path rejected: contains ..");
        } else if audio_src_path.starts_with(&sessions_dir) && audio_src_path.exists() {
            let wav_path = archive_dir.join(format!("{}.wav", filename));
            fs::rename(&audio_src_path, &wav_path)
                .map_err(|e| format!("Failed to move audio: {}", e))?;
        } else if audio_src_path.exists() {
            tracing::warn!("Audio source path rejected: outside sessions directory");
        }
    }

    // Clear active session
    let active_path = base.join("sessions").join("active.json");
    if active_path.exists() {
        let _ = fs::remove_file(&active_path);
    }

    Ok(json_path.to_string_lossy().to_string())
}

#[derive(Serialize)]
pub struct ArchivedSession {
    filename: String,
    path: String,
    size_bytes: u64,
    has_audio: bool,
}

#[tauri::command]
pub async fn list_archived_sessions(app: AppHandle) -> Result<Vec<ArchivedSession>, String> {
    let archive_dir = app_data_dir(&app)?
        .join("sessions")
        .join("archive");
    let mut sessions = Vec::new();

    if let Ok(entries) = fs::read_dir(&archive_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "json") {
                let filename = path
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_default();
                let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                let has_audio = path.with_extension("wav").exists();

                sessions.push(ArchivedSession {
                    filename,
                    path: path.to_string_lossy().to_string(),
                    size_bytes: size,
                    has_audio,
                });
            }
        }
    }

    sessions.sort_by(|a, b| b.filename.cmp(&a.filename));
    Ok(sessions)
}

#[tauri::command]
pub async fn load_archived_session(app: AppHandle, filename: String) -> Result<String, String> {
    let safe_name = sanitize_filename(&filename)?;
    let path = app_data_dir(&app)?
        .join("sessions")
        .join("archive")
        .join(format!("{}.json", safe_name));
    fs::read_to_string(&path).map_err(|e| format!("Failed to load archive: {}", e))
}

#[tauri::command]
pub async fn delete_archived_session(app: AppHandle, filename: String) -> Result<(), String> {
    let safe_name = sanitize_filename(&filename)?;
    let archive_dir = app_data_dir(&app)?
        .join("sessions")
        .join("archive");
    let json_path = archive_dir.join(format!("{}.json", safe_name));
    let wav_path = archive_dir.join(format!("{}.wav", safe_name));

    if json_path.exists() {
        fs::remove_file(&json_path).map_err(|e| format!("Failed to delete: {}", e))?;
    }
    if wav_path.exists() {
        fs::remove_file(&wav_path).map_err(|e| format!("Failed to delete audio: {}", e))?;
    }
    Ok(())
}

// ============================================================
// CORRECTIONS DICTIONARY
// ============================================================

#[tauri::command]
pub async fn load_corrections(app: AppHandle, language: Option<String>) -> Result<String, String> {
    let lang = language.unwrap_or_else(|| "en".to_string());
    let filename = if lang == "en" || lang.starts_with("en-") {
        "corrections.json".to_string()
    } else {
        let base = lang.split('-').next().unwrap_or("en");
        format!("corrections-{}.json", base)
    };

    // Check user data dir first (custom corrections)
    let user_path = app_data_dir(&app)?.join(&filename);
    if user_path.exists() {
        return fs::read_to_string(&user_path)
            .map_err(|e| format!("Failed to load corrections: {}", e));
    }

    // Check bundled resources
    let resource_path = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("resources")
        .join(&filename);
    if resource_path.exists() {
        return fs::read_to_string(&resource_path)
            .map_err(|e| format!("Failed to load corrections: {}", e));
    }

    // Fallback to English corrections
    if filename != "corrections.json" {
        let fallback = app.path().resource_dir()
            .map_err(|e| e.to_string())?
            .join("resources")
            .join("corrections.json");
        if fallback.exists() {
            return fs::read_to_string(&fallback)
                .map_err(|e| format!("Failed to load corrections: {}", e));
        }
        let user_fallback = app_data_dir(&app)?.join("corrections.json");
        if user_fallback.exists() {
            return fs::read_to_string(&user_fallback)
                .map_err(|e| format!("Failed to load corrections: {}", e));
        }
    }

    Err("No corrections dictionary found".to_string())
}

// ============================================================
// DICTIONARY FILES
// ============================================================

#[tauri::command]
pub async fn load_dictionary(app: AppHandle, name: String) -> Result<String, String> {
    // Reject path traversal and invalid characters
    if name.contains("..") || name.contains('/') || name.contains('\\') || name.is_empty() {
        return Err("Invalid dictionary name".into());
    }
    let filename = format!("{}.json", name);
    let resource_path = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("resources")
        .join(&filename);
    if resource_path.exists() {
        return fs::read_to_string(&resource_path)
            .map_err(|e| format!("Failed to load dictionary: {}", e));
    }
    Err(format!("Dictionary '{}' not found", name))
}

// ============================================================
// PDF / HTML EXPORT
// ============================================================

#[tauri::command]
pub async fn get_export_path(app: AppHandle, filename: String) -> Result<String, String> {
    let safe_name = sanitize_filename(&filename)?;
    let path = app_data_dir(&app)?.join("exports").join(safe_name);
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn export_and_open_html(
    app: AppHandle,
    html: String,
    filename: String,
) -> Result<String, String> {
    let safe_name = sanitize_filename(&filename)?;
    let path = app_data_dir(&app)?.join("exports").join(&safe_name);
    fs::write(&path, &html)
        .map_err(|e| format!("Failed to write export: {}", e))?;

    let path_str = path.to_string_lossy().to_string();

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&path_str)
        .spawn()
        .map_err(|e| format!("Failed to open: {}", e))?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/c", "start", "", &path_str])
        .spawn()
        .map_err(|e| format!("Failed to open: {}", e))?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&path_str)
        .spawn()
        .map_err(|e| format!("Failed to open: {}", e))?;

    Ok(path_str)
}

#[tauri::command]
pub async fn save_text_file(app: AppHandle, path: String, content: String) -> Result<(), String> {
    let target = std::path::Path::new(&path);

    // Block obvious traversal attempts
    let path_str = target.to_string_lossy();
    if path_str.contains("..") {
        return Err("Invalid path: directory traversal not allowed".into());
    }

    // Canonicalize parent to resolve symlinks
    let parent = target.parent().ok_or("Invalid path: no parent directory")?;
    let canon_parent = parent.canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;

    // Allow: app data dir, user home (Desktop, Documents, Downloads, etc.)
    let app_data = app_data_dir(&app)?;
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;

    let allowed = canon_parent.starts_with(&app_data)
        || canon_parent.starts_with(&home);

    if !allowed {
        return Err("Save rejected: path must be within your home directory or app data".into());
    }

    // Block writing to dotfiles/config directories within home
    let rel = canon_parent.strip_prefix(&home).unwrap_or(&canon_parent);
    let first_component = rel.components().next()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .unwrap_or_default();
    if first_component.starts_with('.') && !canon_parent.starts_with(&app_data) {
        return Err("Save rejected: cannot write to hidden/config directories".into());
    }

    fs::write(&path, &content)
        .map_err(|e| format!("Failed to save file: {}", e))
}

#[tauri::command]
pub async fn generate_pdf(
    app: AppHandle,
    html: String,
) -> Result<String, String> {
    let base = app_data_dir(&app)?;
    let exports_dir = base.join("exports");
    fs::create_dir_all(&exports_dir).map_err(|e| e.to_string())?;

    let filename = format!("ClinicalFlow_Note_{}.pdf",
        chrono::Local::now().format("%Y-%m-%d_%H-%M"));
    let pdf_path = exports_dir.join(&filename);

    // Generate PDF using headless Chrome/Edge (cross-platform)
    crate::pdf::html_to_pdf(&html, &pdf_path)?;

    // Open the PDF in the default viewer
    let pdf_str = pdf_path.to_string_lossy().to_string();
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&pdf_str)
        .spawn()
        .map_err(|e| format!("Failed to open PDF: {}", e))?;

    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/c", "start", "", &pdf_str])
        .spawn()
        .map_err(|e| format!("Failed to open PDF: {}", e))?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&pdf_str)
        .spawn()
        .map_err(|e| format!("Failed to open PDF: {}", e))?;

    Ok(pdf_str)
}

// ============================================================
// ENCRYPTED STORAGE — Phase 9 (HIPAA)
// ============================================================

fn get_pin(state: &tauri::State<'_, AppState>) -> Result<String, String> {
    let guard = state.pin.lock().map_err(|e| e.to_string())?;
    guard.clone().ok_or_else(|| "Not authenticated".to_string())
}

#[tauri::command]
pub async fn save_config_encrypted(
    app: AppHandle,
    config_json: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pin = get_pin(&state)?;
    let path = app_data_dir(&app)?.join("config.json");
    crypto::encrypt_file(&path, config_json.as_bytes(), pin.as_bytes())?;
    tracing::debug!("Encrypted config saved");
    Ok(())
}

#[tauri::command]
pub async fn load_config_encrypted(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let path = app_data_dir(&app)?.join("config.json");
    if !path.exists() {
        return Ok("{}".to_string());
    }

    let pin = get_pin(&state)?;

    match crypto::decrypt_file(&path, pin.as_bytes()) {
        Ok(bytes) => {
            let contents = String::from_utf8(bytes)
                .map_err(|e| format!("UTF-8 decode failed: {}", e))?;
            match serde_json::from_str::<serde_json::Value>(&contents) {
                Ok(_) => Ok(contents),
                Err(e) => {
                    tracing::error!("Decrypted config is invalid JSON: {}", e);
                    let backup = path.with_extension(format!(
                        "corrupted.{}",
                        chrono::Local::now().format("%Y%m%d_%H%M%S")
                    ));
                    let _ = fs::rename(&path, &backup);
                    Ok("{}".to_string())
                }
            }
        }
        Err(_) => {
            // Migration: try reading as plaintext JSON (pre-Phase 9 data)
            match fs::read_to_string(&path) {
                Ok(contents)
                    if serde_json::from_str::<serde_json::Value>(&contents).is_ok() =>
                {
                    tracing::info!("Config was unencrypted, migrating to encrypted format");
                    let _ = crypto::encrypt_file(&path, contents.as_bytes(), pin.as_bytes());
                    Ok(contents)
                }
                _ => {
                    tracing::error!("Config decryption failed. Resetting.");
                    let backup = path.with_extension(format!(
                        "corrupted.{}",
                        chrono::Local::now().format("%Y%m%d_%H%M%S")
                    ));
                    let _ = fs::rename(&path, &backup);
                    Ok("{}".to_string())
                }
            }
        }
    }
}

#[tauri::command]
pub async fn save_session_encrypted(
    app: AppHandle,
    session_json: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let pin = get_pin(&state)?;
    let path = app_data_dir(&app)?.join("sessions").join("active.json");
    crypto::encrypt_file(&path, session_json.as_bytes(), pin.as_bytes())?;
    tracing::debug!("Encrypted session saved: {} bytes", session_json.len());
    Ok(())
}

#[tauri::command]
pub async fn load_session_encrypted(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let path = app_data_dir(&app)?.join("sessions").join("active.json");
    if !path.exists() {
        return Ok("".to_string());
    }

    let pin = get_pin(&state)?;

    match crypto::decrypt_file(&path, pin.as_bytes()) {
        Ok(bytes) => {
            let contents = String::from_utf8(bytes)
                .map_err(|e| format!("UTF-8 decode failed: {}", e))?;
            match serde_json::from_str::<serde_json::Value>(&contents) {
                Ok(_) => Ok(contents),
                Err(e) => {
                    tracing::error!("Decrypted session is invalid JSON: {}", e);
                    let backup = path.with_extension(format!(
                        "corrupted.{}",
                        chrono::Local::now().format("%Y%m%d_%H%M%S")
                    ));
                    let _ = fs::rename(&path, &backup);
                    Ok("".to_string())
                }
            }
        }
        Err(_) => {
            // Migration fallback
            match fs::read_to_string(&path) {
                Ok(contents)
                    if serde_json::from_str::<serde_json::Value>(&contents).is_ok() =>
                {
                    tracing::info!("Session was unencrypted, migrating");
                    let _ = crypto::encrypt_file(&path, contents.as_bytes(), pin.as_bytes());
                    Ok(contents)
                }
                _ => {
                    let backup = path.with_extension(format!(
                        "corrupted.{}",
                        chrono::Local::now().format("%Y%m%d_%H%M%S")
                    ));
                    let _ = fs::rename(&path, &backup);
                    Ok("".to_string())
                }
            }
        }
    }
}

#[tauri::command]
pub async fn archive_session_encrypted(
    app: AppHandle,
    session_json: String,
    patient_name: Option<String>,
    audio_source_path: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let pin = get_pin(&state)?;
    let base = app_data_dir(&app)?;
    let archive_dir = base.join("sessions").join("archive");

    let now = chrono::Local::now();
    let name_part = patient_name.unwrap_or_else(|| "Session".to_string());
    let safe_name: String = name_part
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '_' })
        .collect();
    let filename = format!("{}_{}", now.format("%Y-%m-%d_%H-%M"), safe_name);

    let json_path = archive_dir.join(format!("{}.json", filename));
    crypto::encrypt_file(&json_path, session_json.as_bytes(), pin.as_bytes())?;
    tracing::info!("Session archived (encrypted): {} chars filename", filename.len());

    if let Some(audio_src) = audio_source_path {
        let audio_src_path = PathBuf::from(&audio_src);
        let sessions_dir = base.join("sessions");
        let src_str = audio_src_path.to_string_lossy();
        if src_str.contains("..") {
            tracing::warn!("Audio source path rejected: contains ..");
        } else if audio_src_path.starts_with(&sessions_dir) && audio_src_path.exists() {
            let wav_path = archive_dir.join(format!("{}.wav", filename));
            fs::rename(&audio_src_path, &wav_path)
                .map_err(|e| format!("Failed to move audio: {}", e))?;
        } else if audio_src_path.exists() {
            tracing::warn!("Audio source path rejected: outside sessions directory");
        }
    }

    // Clear active session
    let active_path = base.join("sessions").join("active.json");
    if active_path.exists() {
        let _ = fs::remove_file(&active_path);
    }

    Ok(json_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn load_archived_session_encrypted(
    app: AppHandle,
    filename: String,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let pin = get_pin(&state)?;
    let safe_name = sanitize_filename(&filename)?;
    let path = app_data_dir(&app)?
        .join("sessions")
        .join("archive")
        .join(format!("{}.json", safe_name));

    match crypto::decrypt_file(&path, pin.as_bytes()) {
        Ok(bytes) => String::from_utf8(bytes)
            .map_err(|e| format!("UTF-8 decode failed: {}", e)),
        Err(_) => {
            // Migration fallback: try plaintext
            match fs::read_to_string(&path) {
                Ok(contents)
                    if serde_json::from_str::<serde_json::Value>(&contents).is_ok() =>
                {
                    tracing::info!("Archived session was unencrypted, migrating");
                    let _ = crypto::encrypt_file(&path, contents.as_bytes(), pin.as_bytes());
                    Ok(contents)
                }
                Ok(_) | Err(_) => Err(format!("Failed to load archive: {}", filename)),
            }
        }
    }
}

// ============================================================
// PRODUCTION HARDENING — Phase 6
// ============================================================

#[tauri::command]
pub async fn cleanup_old_logs(app: AppHandle) -> Result<u32, String> {
    let log_dir = app_data_dir(&app)?.join("logs");
    if !log_dir.exists() { return Ok(0); }

    let cutoff = std::time::SystemTime::now()
        - std::time::Duration::from_secs(30 * 24 * 60 * 60); // 30 days

    let mut deleted = 0u32;

    if let Ok(entries) = fs::read_dir(&log_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.extension().map_or(true, |ext| ext != "log") { continue; }

            if let Ok(meta) = fs::metadata(&path) {
                if let Ok(modified) = meta.modified() {
                    if modified < cutoff {
                        if fs::remove_file(&path).is_ok() {
                            deleted += 1;
                        }
                    }
                }
            }
        }
    }

    if deleted > 0 {
        tracing::info!("Cleaned up {} old log files", deleted);
    }
    Ok(deleted)
}

#[derive(serde::Serialize)]
pub struct MemoryInfo {
    total_gb: f64,
    available_gb: f64,
    used_percent: f64,
}

#[tauri::command]
pub async fn check_system_memory() -> Result<MemoryInfo, String> {
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_memory();

    let total = sys.total_memory() as f64;
    let available = sys.available_memory() as f64;
    let bytes_per_gb = 1_073_741_824.0;

    Ok(MemoryInfo {
        total_gb: total / bytes_per_gb,
        available_gb: available / bytes_per_gb,
        used_percent: ((total - available) / total) * 100.0,
    })
}

#[tauri::command]
pub async fn log_frontend_error(message: String, stack: String) -> Result<(), String> {
    // Log only message length to avoid writing PHI to disk
    tracing::error!("[Frontend] error: {} chars, stack: {} chars", message.len(), stack.len());
    Ok(())
}

#[tauri::command]
pub async fn log_startup_info(app: AppHandle) -> Result<(), String> {
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_all();

    let data_dir = app_data_dir(&app)?;
    let active_session = data_dir.join("sessions").join("active.json").exists();
    let config_exists = data_dir.join("config.json").exists();

    let archive_count = fs::read_dir(data_dir.join("sessions").join("archive"))
        .map(|entries| entries.filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map_or(false, |ext| ext == "json"))
            .count())
        .unwrap_or(0);

    let log_count = fs::read_dir(data_dir.join("logs"))
        .map(|entries| entries.filter_map(|e| e.ok()).count())
        .unwrap_or(0);

    tracing::info!("=== STARTUP HEALTH REPORT ===");
    tracing::info!("OS: {} {}", System::name().unwrap_or_default(), System::os_version().unwrap_or_default());
    tracing::info!("Memory: {:.1}GB total, {:.1}GB available",
        sys.total_memory() as f64 / 1_073_741_824.0,
        sys.available_memory() as f64 / 1_073_741_824.0);
    tracing::info!("Data dir: {}", data_dir.display());
    tracing::info!("Config exists: {}", config_exists);
    tracing::info!("Active session: {}", active_session);
    tracing::info!("Archived sessions: {}", archive_count);
    tracing::info!("Log files: {}", log_count);
    tracing::info!("=============================");

    Ok(())
}
