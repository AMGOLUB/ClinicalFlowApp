mod audio;
mod auth;
mod crypto;
mod license;
mod logging;
mod pms;
mod storage;

use tauri::{Manager, Emitter};
use tauri_plugin_deep_link::DeepLinkExt;
use std::sync::{Arc, Mutex};

/// Buffers deep-link URLs that arrive before the JS frontend is ready (cold-start race condition).
#[derive(Default, Clone)]
struct PendingDeepLink(Arc<Mutex<Option<String>>>);

/// Returns (and consumes) any deep-link URL that arrived before the JS listener was set up.
#[tauri::command]
fn get_pending_deep_link(state: tauri::State<PendingDeepLink>) -> Option<String> {
    state.0.lock().unwrap().take()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .manage(PendingDeepLink::default())
        .manage(audio::RecordingState::default())
        .manage(auth::AppState::default())
        .manage(pms::PmsState::default())
        .invoke_handler(tauri::generate_handler![
            audio::start_recording,
            audio::stop_recording,
            audio::pause_recording,
            audio::resume_recording,
            audio::get_audio_devices,
            storage::init_storage,
            storage::load_config,
            storage::save_config,
            storage::save_session,
            storage::load_session,
            storage::clear_session,
            storage::archive_session,
            storage::list_archived_sessions,
            storage::load_archived_session,
            storage::delete_archived_session,
            storage::load_corrections,
            storage::get_export_path,
            storage::export_and_open_html,
            storage::save_text_file,
            storage::generate_pdf,
            storage::cleanup_old_logs,
            storage::check_system_memory,
            storage::log_frontend_error,
            storage::log_startup_info,
            storage::save_config_encrypted,
            storage::load_config_encrypted,
            storage::save_session_encrypted,
            storage::load_session_encrypted,
            storage::archive_session_encrypted,
            storage::load_archived_session_encrypted,
            auth::check_has_pin,
            auth::check_welcome_completed,
            auth::set_welcome_completed,
            auth::create_pin,
            auth::authenticate,
            auth::update_activity,
            auth::lock_app,
            auth::reset_pin,
            pms::pms_test_connection,
            pms::pms_sync_perio,
            pms::pms_sync_procedures,
            pms::pms_sync_note,
            pms::pms_sync_all,
            pms::pms_status,
            license::load_pre_pin_session,
            license::save_pre_pin_session,
            license::clear_pre_pin_session,
            license::get_device_info,
            license::decrypt_license,
            get_pending_deep_link,
        ])
        .setup(|app| {
            // Initialize logging first
            let log_dir = app.path().app_data_dir()
                .expect("Failed to get app data dir")
                .join("logs");
            if let Err(e) = logging::init_logging(log_dir) {
                eprintln!("Logging init failed: {}", e);
            }

            tracing::info!("ClinicalFlow app ready");

            // Register deep-link handler for clinicalflow:// URLs
            let dl_handle = app.handle().clone();
            let dl_pending = app.state::<PendingDeepLink>().inner().clone();
            app.deep_link().on_open_url(move |event| {
                if let Some(url) = event.urls().first() {
                    let s = url.to_string();
                    tracing::info!("Deep link received: {}", s);
                    *dl_pending.0.lock().unwrap() = Some(s.clone());
                    let _ = dl_handle.emit("deep-link-received", &s);
                }
            });

            // Initialize storage directory structure on startup
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = storage::init_storage(handle).await {
                    tracing::error!("Storage init failed: {}", e);
                }
            });

            // Clean up old logs (non-blocking)
            let handle2 = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = storage::cleanup_old_logs(handle2).await;
            });

            // Log startup health info (non-blocking)
            let handle3 = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = storage::log_startup_info(handle3).await;
            });

            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.open_devtools();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running ClinicalFlow");
}
