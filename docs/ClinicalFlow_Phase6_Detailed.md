# ClinicalFlow — Phase 6: Production Hardening

## Overview

Make the app crash-proof and debuggable. This phase adds structured logging, audio recording safeguards, data integrity validation, memory monitoring, and global error handling. Nothing changes about how the app looks or what it does — it just becomes reliable enough for a real clinic.

**Prerequisites:** Phases 1-5 complete. App runs in Tauri, transcription works, note generation works, exports work, file persistence works.

**Philosophy:** A doctor recording a patient encounter cannot afford to lose data. Every safeguard in this phase protects against that scenario.

---

## 1. Structured Logging (Rust)

### 1.1 Create `src-tauri/src/logging.rs`

```rust
use std::path::PathBuf;
use tracing_appender::rolling;
use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

pub fn init_logging(log_dir: PathBuf) -> Result<(), String> {
    std::fs::create_dir_all(&log_dir)
        .map_err(|e| format!("Failed to create log dir: {}", e))?;

    // Daily rotating log file: clinicalflow-YYYY-MM-DD.log
    let file_appender = rolling::daily(&log_dir, "clinicalflow");

    // File layer: all logs go to file, no ANSI colors
    let file_layer = fmt::layer()
        .with_writer(file_appender)
        .with_ansi(false)
        .with_target(true)
        .with_thread_ids(false)
        .with_level(true);

    // Stdout layer: for dev mode only
    let stdout_layer = fmt::layer()
        .with_writer(std::io::stdout)
        .with_target(true);

    // Filter: DEBUG in dev, INFO in production
    let filter = if cfg!(debug_assertions) {
        EnvFilter::new("debug")
    } else {
        EnvFilter::new("info,hyper=warn,reqwest=warn,tao=warn,wry=warn")
    };

    tracing_subscriber::registry()
        .with(filter)
        .with(file_layer)
        .with(stdout_layer)
        .init();

    tracing::info!("ClinicalFlow v{} logging initialized", env!("CARGO_PKG_VERSION"));
    tracing::info!("Log directory: {}", log_dir.display());

    Ok(())
}
```

### 1.2 Add Dependencies to Cargo.toml

```toml
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
tracing-appender = "0.2"
sysinfo = "0.31"
```

### 1.3 Register Module and Initialize in lib.rs

Add at the top of `lib.rs`:
```rust
mod logging;
```

In the `.setup()` hook (add one if it doesn't exist):
```rust
.setup(|app| {
    // Initialize logging
    let log_dir = app.path().app_data_dir()
        .expect("Failed to get app data dir")
        .join("logs");
    if let Err(e) = logging::init_logging(log_dir) {
        eprintln!("Logging init failed: {}", e);
    }

    // Initialize storage directories (from Phase 3)
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = init_storage(handle).await {
            tracing::error!("Storage init failed: {}", e);
        }
    });

    Ok(())
})
```

### 1.4 Add Tracing to Existing Code

Sprinkle `tracing` calls into the code that already exists. These are one-line additions at key points:

**In audio.rs:**
```rust
// When recording starts:
tracing::info!("Recording started");

// When recording stops:
tracing::info!("Recording stopped. Duration: {}s, samples: {}", duration, total_samples);

// When Whisper processes a chunk:
tracing::debug!("Whisper processing chunk: {}s of audio", chunk_duration);

// When Whisper returns text:
tracing::info!("Whisper transcribed: {} chars", text.len());

// When Whisper is slow:
if processing_time > chunk_duration * 1.5 {
    tracing::warn!("Whisper falling behind: {}s to process {}s chunk", processing_time, chunk_duration);
}

// When Whisper fails:
tracing::error!("Whisper sidecar failed: {}", error);
```

**In storage.rs:**
```rust
// Session save:
tracing::debug!("Session saved: {} bytes", session_json.len());

// Session archive:
tracing::info!("Session archived: {}", filename);

// Config save:
tracing::debug!("Config saved");

// Corrupted file detection:
tracing::error!("Corrupted file detected: {}. Backed up to .corrupted", path.display());

// File write failure:
tracing::error!("Failed to write {}: {}", path.display(), error);
```

**In lib.rs (command handlers):**
```rust
// App startup complete:
tracing::info!("ClinicalFlow app ready");
```

---

## 2. Log Cleanup

Old logs should not fill the disk. Clean up logs older than 30 days on startup.

### 2.1 Add Cleanup Command to storage.rs

```rust
#[tauri::command]
async fn cleanup_old_logs(app: AppHandle) -> Result<u32, String> {
    let log_dir = app_data_dir(&app)?.join("logs");
    if !log_dir.exists() { return Ok(0); }

    let cutoff = std::time::SystemTime::now()
        - std::time::Duration::from_secs(30 * 24 * 60 * 60); // 30 days

    let mut deleted = 0u32;

    if let Ok(entries) = std::fs::read_dir(&log_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            // Only delete .log files, not other things
            if path.extension().map_or(true, |ext| ext != "log") { continue; }

            if let Ok(meta) = std::fs::metadata(&path) {
                if let Ok(modified) = meta.modified() {
                    if modified < cutoff {
                        if std::fs::remove_file(&path).is_ok() {
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
```

### 2.2 Call on Startup

In the `.setup()` hook, after storage init:

```rust
// Clean up old logs (non-blocking)
let handle2 = app.handle().clone();
tauri::async_runtime::spawn(async move {
    let _ = cleanup_old_logs(handle2).await;
});
```

Register the command:
```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands ...
    cleanup_old_logs,
])
```

---

## 3. Audio Recording Safeguards

### 3.1 Continuous WAV Save

**Problem:** Currently, if the app crashes mid-recording, the audio buffer in memory is lost.

**Fix:** Open a WAV file the moment recording starts and write audio samples to it incrementally. If the app crashes, the file on disk has everything up to the last write.

In `audio.rs`, modify the recording state and audio callback:

```rust
use hound::{WavWriter, WavSpec};
use std::io::BufWriter;
use std::sync::{Arc, Mutex};

struct RecordingState {
    wav_writer: Option<WavWriter<BufWriter<std::fs::File>>>,
    wav_path: Option<String>,
    chunk_buffer: Vec<f32>,
    total_samples: u64,
    is_recording: bool,
}

impl RecordingState {
    fn new() -> Self {
        Self {
            wav_writer: None,
            wav_path: None,
            chunk_buffer: Vec::new(),
            total_samples: 0,
            is_recording: false,
        }
    }
}

fn start_wav_writer(output_path: &str, sample_rate: u32) -> Result<WavWriter<BufWriter<std::fs::File>>, String> {
    let spec = WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let file = std::fs::File::create(output_path)
        .map_err(|e| format!("Failed to create WAV file: {}", e))?;
    let buf_writer = BufWriter::new(file);
    WavWriter::new(buf_writer, spec)
        .map_err(|e| format!("Failed to create WAV writer: {}", e))
}
```

In the `start_recording` command:
```rust
#[tauri::command]
async fn start_recording(app: AppHandle, state: tauri::State<'_, Arc<Mutex<RecordingState>>>) -> Result<String, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let sessions_dir = data_dir.join("sessions");
    std::fs::create_dir_all(&sessions_dir).map_err(|e| e.to_string())?;

    let wav_path = sessions_dir
        .join(format!("recording_{}.wav", chrono::Local::now().format("%Y%m%d_%H%M%S")))
        .to_string_lossy()
        .to_string();

    let writer = start_wav_writer(&wav_path, 16000)?;

    {
        let mut rec = state.lock().map_err(|e| e.to_string())?;
        rec.wav_writer = Some(writer);
        rec.wav_path = Some(wav_path.clone());
        rec.chunk_buffer.clear();
        rec.total_samples = 0;
        rec.is_recording = true;
    }

    tracing::info!("Recording started, saving to: {}", wav_path);

    // ... start cpal audio capture ...
    // In the audio callback, write samples immediately:
    // state.wav_writer.write_sample((sample * 32767.0) as i16);

    Ok(wav_path)
}
```

In the audio data callback (called by cpal):
```rust
fn on_audio_data(state: &Arc<Mutex<RecordingState>>, samples: &[f32]) {
    if let Ok(mut rec) = state.lock() {
        if !rec.is_recording { return; }

        // Write to WAV file IMMEDIATELY (crash-safe)
        if let Some(ref mut writer) = rec.wav_writer {
            for &sample in samples {
                let pcm = (sample.clamp(-1.0, 1.0) * 32767.0) as i16;
                if writer.write_sample(pcm).is_err() {
                    tracing::error!("Failed to write audio sample to WAV");
                    break;
                }
            }
            // Flush periodically for crash safety
            rec.total_samples += samples.len() as u64;
            if rec.total_samples % 160000 == 0 { // Every 10 seconds at 16kHz
                let _ = writer.flush();
                tracing::debug!("WAV flushed at {}s", rec.total_samples / 16000);
            }
        }

        // Also buffer for Whisper chunk processing
        rec.chunk_buffer.extend_from_slice(samples);
    }
}
```

In `stop_recording`:
```rust
#[tauri::command]
async fn stop_recording(state: tauri::State<'_, Arc<Mutex<RecordingState>>>) -> Result<String, String> {
    let wav_path;
    {
        let mut rec = state.lock().map_err(|e| e.to_string())?;
        rec.is_recording = false;

        // Finalize the WAV file (writes header with correct length)
        if let Some(writer) = rec.wav_writer.take() {
            writer.finalize().map_err(|e| format!("Failed to finalize WAV: {}", e))?;
        }

        wav_path = rec.wav_path.clone().unwrap_or_default();
        tracing::info!("Recording stopped. Total samples: {}, file: {}", rec.total_samples, wav_path);
    }

    Ok(wav_path)
}
```

### 3.2 Maximum Session Duration

Prevent runaway recordings from filling the disk (4 hours = ~1.1GB at 16kHz 16-bit mono).

In the audio capture loop or callback:

```rust
const MAX_SESSION_SAMPLES: u64 = 16000 * 60 * 60 * 4; // 4 hours at 16kHz

fn on_audio_data(state: &Arc<Mutex<RecordingState>>, app: &AppHandle, samples: &[f32]) {
    if let Ok(mut rec) = state.lock() {
        if !rec.is_recording { return; }

        // Check max duration
        if rec.total_samples >= MAX_SESSION_SAMPLES {
            tracing::warn!("Max session duration reached (4 hours), auto-stopping");
            rec.is_recording = false;

            // Finalize WAV
            if let Some(writer) = rec.wav_writer.take() {
                let _ = writer.finalize();
            }

            // Notify frontend
            let _ = app.emit("recording_max_duration", ());
            return;
        }

        // ... rest of audio processing ...
    }
}
```

**Frontend handler (app.js):**

Add to `init()` or wherever Tauri event listeners are set up:

```javascript
if (window.__TAURI__) {
  tauriListen('recording_max_duration', () => {
    toast('Recording stopped — 4 hour maximum reached. Save your session.', 'warning', 10000);
    // Trigger the normal stop recording flow
    if (App.isRecording) {
      stopRecording();
    }
  });
}
```

### 3.3 Whisper Crash Recovery

If whisper.cpp crashes on one chunk, the recording should continue. Only that chunk's transcription is lost.

In the Whisper processing loop in `audio.rs`:

```rust
// Process each chunk through Whisper
fn process_chunk(app: &AppHandle, chunk_path: &str, model_path: &str, threads: u32) {
    match run_whisper(chunk_path, model_path, threads) {
        Ok(text) => {
            if !text.trim().is_empty() {
                let _ = app.emit("transcription", serde_json::json!({
                    "text": text.trim(),
                    "is_partial": false
                }));
                tracing::info!("Transcribed chunk: {} chars", text.len());
            }
        }
        Err(e) => {
            tracing::error!("Whisper failed on chunk {}: {}. Recording continues.", chunk_path, e);
            let _ = app.emit("whisper_error", format!(
                "Transcription error on last segment. Recording continues."
            ));
            // Do NOT stop recording. Next chunk will be processed normally.
        }
    }

    // Clean up temp chunk file
    let _ = std::fs::remove_file(chunk_path);
}
```

**Frontend handler (app.js):**

```javascript
if (window.__TAURI__) {
  tauriListen('whisper_error', (event) => {
    toast(event.payload, 'warning', 4000);
    // Recording continues — just this chunk's text was lost
  });
}
```

---

## 4. Data Integrity

### 4.1 JSON Validation on Session Load

If `active.json` is corrupted (power loss, crash mid-write), detect it, back it up, and start fresh instead of crashing.

Update `load_session` in `storage.rs`:

```rust
#[tauri::command]
async fn load_session(app: AppHandle) -> Result<String, String> {
    let path = app_data_dir(&app)?.join("sessions").join("active.json");

    let contents = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Ok("".to_string()), // No file = no session
    };

    // Validate JSON
    match serde_json::from_str::<serde_json::Value>(&contents) {
        Ok(_) => Ok(contents),
        Err(e) => {
            tracing::error!("Corrupted session file: {}. Backing up.", e);

            // Backup the corrupted file for debugging
            let backup_path = path.with_extension(format!(
                "corrupted.{}",
                chrono::Local::now().format("%Y%m%d_%H%M%S")
            ));
            let _ = std::fs::rename(&path, &backup_path);
            tracing::info!("Corrupted session backed up to: {}", backup_path.display());

            Ok("".to_string()) // Return empty = no session to restore
        }
    }
}
```

### 4.2 JSON Validation on Config Load

Same pattern for `config.json`:

```rust
#[tauri::command]
async fn load_config(app: AppHandle) -> Result<String, String> {
    let path = app_data_dir(&app)?.join("config.json");

    let contents = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Ok("{}".to_string()), // No file = empty config
    };

    match serde_json::from_str::<serde_json::Value>(&contents) {
        Ok(_) => Ok(contents),
        Err(e) => {
            tracing::error!("Corrupted config file: {}. Resetting to defaults.", e);

            let backup_path = path.with_extension(format!(
                "corrupted.{}",
                chrono::Local::now().format("%Y%m%d_%H%M%S")
            ));
            let _ = std::fs::rename(&path, &backup_path);

            Ok("{}".to_string()) // Return empty = default config
        }
    }
}
```

### 4.3 Verify Atomic Writes Are in Place

Double-check that Phase 3's `save_session` and `save_config` use the write-to-temp-then-rename pattern. If they don't, update them:

```rust
// CORRECT — atomic write:
let tmp_path = path.with_extension("json.tmp");
std::fs::write(&tmp_path, &data)?;
std::fs::rename(&tmp_path, &path)?;

// WRONG — direct write (can corrupt if app crashes mid-write):
std::fs::write(&path, &data)?;
```

---

## 5. Memory Monitoring

### 5.1 Rust Command

Add to `storage.rs`:

```rust
use sysinfo::System;

#[derive(serde::Serialize)]
pub struct MemoryInfo {
    total_gb: f64,
    available_gb: f64,
    used_percent: f64,
}

#[tauri::command]
async fn check_system_memory() -> Result<MemoryInfo, String> {
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
```

Register in `lib.rs`:
```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands ...
    check_system_memory,
])
```

### 5.2 Frontend: Check on Startup and Before Heavy Operations

Add this function to app.js:

```javascript
async function checkMemory() {
  if (!window.__TAURI__) return;
  try {
    const mem = await tauriInvoke('check_system_memory');
    console.log(`[ClinicalFlow] Memory: ${mem.available_gb.toFixed(1)}GB free / ${mem.total_gb.toFixed(1)}GB total (${mem.used_percent.toFixed(0)}% used)`);

    if (mem.available_gb < 1.0) {
      toast('Very low memory! Close other apps to avoid crashes.', 'error', 10000);
    } else if (mem.available_gb < 2.0) {
      toast(`Low memory (${mem.available_gb.toFixed(1)}GB free). Performance may be affected.`, 'warning', 6000);
    }
  } catch (e) {
    // Non-critical — log and move on
    console.warn('[ClinicalFlow] Memory check failed:', e);
  }
}
```

Call it in two places:

```javascript
// 1. On startup, in init():
await checkMemory();

// 2. Before starting offline Whisper recording (it uses a lot of RAM):
async function startWhisperRecording() {
  await checkMemory(); // Warn before allocating Whisper memory
  // ... existing code ...
}
```

---

## 6. Global Error Handlers (Frontend)

Catch unhandled errors so they don't silently disappear. Add near the top of app.js, before everything else:

```javascript
/* Global error handlers — catch anything that slips through */
window.addEventListener('unhandledrejection', (event) => {
  console.error('[ClinicalFlow] Unhandled promise rejection:', event.reason);
  // Log to Rust backend if available
  if (window.__TAURI__ && tauriInvoke) {
    tauriInvoke('log_frontend_error', {
      message: `Unhandled rejection: ${event.reason?.message || event.reason || 'Unknown'}`,
      stack: event.reason?.stack || ''
    }).catch(() => {});
  }
});

window.addEventListener('error', (event) => {
  console.error('[ClinicalFlow] Uncaught error:', event.error);
  if (window.__TAURI__ && tauriInvoke) {
    tauriInvoke('log_frontend_error', {
      message: `Uncaught error: ${event.error?.message || event.message || 'Unknown'}`,
      stack: event.error?.stack || ''
    }).catch(() => {});
  }
});
```

**Rust command to receive frontend errors:**

Add to `storage.rs`:

```rust
#[tauri::command]
async fn log_frontend_error(message: String, stack: String) -> Result<(), String> {
    if stack.is_empty() {
        tracing::error!("[Frontend] {}", message);
    } else {
        tracing::error!("[Frontend] {}\n{}", message, stack);
    }
    Ok(())
}
```

Register in `lib.rs`:
```rust
.invoke_handler(tauri::generate_handler![
    // ... existing commands ...
    log_frontend_error,
])
```

This means frontend errors show up in the same log files as Rust errors — one place to look when debugging issues.

---

## 7. Startup Health Report

When the app launches in dev mode, log a summary of the system state. Useful for debugging user-reported issues.

Add a command in `storage.rs`:

```rust
#[tauri::command]
async fn log_startup_info(app: AppHandle) -> Result<(), String> {
    let mut sys = System::new();
    sys.refresh_all();

    let data_dir = app_data_dir(&app)?;
    let active_session = data_dir.join("sessions").join("active.json").exists();
    let config_exists = data_dir.join("config.json").exists();

    // Count archived sessions
    let archive_count = std::fs::read_dir(data_dir.join("sessions").join("archive"))
        .map(|entries| entries.filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map_or(false, |ext| ext == "json"))
            .count())
        .unwrap_or(0);

    // Count log files
    let log_count = std::fs::read_dir(data_dir.join("logs"))
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
```

Call in the `.setup()` hook:

```rust
let handle3 = app.handle().clone();
tauri::async_runtime::spawn(async move {
    let _ = log_startup_info(handle3).await;
});
```

---

## 8. Testing Checklist

### Logging
- [ ] Launch app with `npm run tauri dev`
- [ ] Check `$APPDATA/com.clinicalflow.app/logs/` — a log file exists for today
- [ ] Open the log file — contains "ClinicalFlow logging initialized" and startup health report
- [ ] Record a short transcript — log shows recording start/stop events
- [ ] Generate a note — no errors in log
- [ ] Close and reopen the app — previous log file still exists, new entries added to today's file

### Log Cleanup
- [ ] Manually create a fake log file with an old date: `touch -t 202501010000 $APPDATA/com.clinicalflow.app/logs/clinicalflow.2025-01-01`
- [ ] Restart the app
- [ ] Verify the old fake log file was deleted
- [ ] Verify today's log file was NOT deleted

### Audio Safeguards
- [ ] Start a recording
- [ ] Check `$APPDATA/com.clinicalflow.app/sessions/` — a .wav file appears immediately (not just after stopping)
- [ ] Force-quit the app while recording (Cmd+Q or kill the process)
- [ ] Check the .wav file — it should contain audio up to the point of the crash
- [ ] Reopen the app — it should not crash on startup from the interrupted recording

### Max Session Duration
- [ ] (Temporarily change MAX_SESSION_SAMPLES to a small number like 160000 (10 seconds) for testing)
- [ ] Start recording
- [ ] Wait 10 seconds
- [ ] Verify: toast appears about max duration, recording stops automatically
- [ ] Verify: WAV file is saved and valid
- [ ] (Revert MAX_SESSION_SAMPLES back to 4 hours after testing)

### Data Integrity
- [ ] Generate a session with some transcript entries
- [ ] Close the app
- [ ] Open `$APPDATA/com.clinicalflow.app/sessions/active.json` in a text editor
- [ ] Add garbage text to corrupt it (e.g., add "XXXXX" at the beginning)
- [ ] Reopen the app
- [ ] Verify: app starts without crashing
- [ ] Verify: no "restore session?" prompt (corrupted session was discarded)
- [ ] Verify: a `.corrupted.*` backup file exists in the sessions directory
- [ ] Same test for `config.json` — corrupt it, reopen app, verify defaults are used

### Memory Monitoring
- [ ] Launch app — console shows memory info line
- [ ] (If on a machine with plenty of RAM, no warning toast should appear)
- [ ] Verify no errors in console related to memory check

### Frontend Error Logging
- [ ] Open browser console in Tauri (right-click → Inspect → Console)
- [ ] Type: `throw new Error('test error')` in the console
- [ ] Check the log file — should contain "[Frontend] Uncaught error: test error"

---

## 9. Files Modified Summary

| File | Changes |
|------|---------|
| `src-tauri/src/logging.rs` | **New file** — structured logging with daily rotation |
| `src-tauri/src/storage.rs` | JSON validation in `load_session` and `load_config`, `cleanup_old_logs`, `check_system_memory`, `log_frontend_error`, `log_startup_info` |
| `src-tauri/src/audio.rs` | Continuous WAV save (write-on-receive), WAV flush every 10s, max session duration check, Whisper crash recovery |
| `src-tauri/src/lib.rs` | Register `logging` module, init logging in setup hook, register new commands: `cleanup_old_logs`, `check_system_memory`, `log_frontend_error`, `log_startup_info` |
| `src-tauri/Cargo.toml` | Add `tracing`, `tracing-subscriber`, `tracing-appender`, `sysinfo` |
| `src/app.js` | Global error handlers (unhandledrejection, error), `checkMemory()` function, `recording_max_duration` event listener, `whisper_error` event listener |
| `src/styles.css` | No changes |
| `src/index.html` | No changes |

---

## 10. What NOT To Touch

- Note generation pipeline (prompts, verification, post-processing)
- Transcription pipeline logic (Deepgram, Whisper command structure)
- UI layout and styling
- Export functions (Phase 5)
- Session data structure or config schema
- Anything that is currently working correctly

The goal of this phase is to add safety nets AROUND existing code, not to change how existing code works.

---

## 11. After Phase 6

All functional phases are complete. Phase 7 is build and distribution:
- `npm run tauri build` for .dmg (macOS) and .msi (Windows)
- Code signing and notarization
- Bundling whisper.cpp sidecar and model files
- Auto-updater configuration
