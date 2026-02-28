# ClinicalFlow — Phase 3: File System & Session Management

## Overview

Replace all `localStorage` calls in app.js with Tauri filesystem commands. After this phase, all user settings and session data persist as real files on disk, surviving app reinstalls and enabling session archiving.

**Prerequisites:** Phase 1 (Tauri wrapper) and Phase 2 (transcription) must be working. `npm run tauri dev` must launch successfully.

---

## 3.1 Rust Backend Commands

Create a new file `src-tauri/src/storage.rs` with these Tauri commands. Register all commands in `lib.rs`.

### 3.1.1 App Data Directory

All files live under the platform-appropriate app data directory:
- **macOS:** `~/Library/Application Support/com.clinicalflow.app/`
- **Windows:** `C:\Users\<user>\AppData\Roaming\com.clinicalflow.app\`
- **Linux:** `~/.config/com.clinicalflow.app/`

Use Tauri's `app.path().app_data_dir()` to get this path. On first launch, create the directory structure if it doesn't exist.

### 3.1.2 Directory Structure

On first launch, ensure this structure exists:

```
$APPDATA/com.clinicalflow.app/
├── config.json              # All user settings (single file)
├── corrections.json         # Medical term corrections (copied from bundle on first run)
├── sessions/
│   ├── active.json          # Current in-progress session
│   └── archive/             # Completed sessions
│       ├── 2026-02-21_14-30_Robinson.json
│       └── 2026-02-21_14-30_Robinson.wav
├── exports/                 # PDF exports
└── logs/                    # Error logs
```

### 3.1.3 Rust Commands to Implement

```rust
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use serde::{Deserialize, Serialize};

// Helper: get the app data directory path
fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

// Helper: ensure directory structure exists (call on startup)
#[tauri::command]
async fn init_storage(app: AppHandle) -> Result<(), String> {
    let base = app_data_dir(&app)?;
    let dirs = [
        base.clone(),
        base.join("sessions"),
        base.join("sessions").join("archive"),
        base.join("exports"),
        base.join("logs"),
    ];
    for dir in &dirs {
        fs::create_dir_all(dir).map_err(|e| format!("Failed to create {}: {}", dir.display(), e))?;
    }

    // Copy bundled corrections.json to app data if it doesn't exist yet
    let corrections_dest = base.join("corrections.json");
    if !corrections_dest.exists() {
        let resource_path = app.path().resource_dir()
            .map_err(|e| e.to_string())?
            .join("resources/corrections.json");
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
async fn load_config(app: AppHandle) -> Result<String, String> {
    let path = app_data_dir(&app)?.join("config.json");
    match fs::read_to_string(&path) {
        Ok(contents) => Ok(contents),
        Err(_) => Ok("{}".to_string()), // Return empty JSON if file doesn't exist
    }
}

#[tauri::command]
async fn save_config(app: AppHandle, config_json: String) -> Result<(), String> {
    let path = app_data_dir(&app)?.join("config.json");
    // Atomic write: write to temp file, then rename
    let tmp_path = path.with_extension("json.tmp");
    fs::write(&tmp_path, &config_json)
        .map_err(|e| format!("Failed to write config: {}", e))?;
    fs::rename(&tmp_path, &path)
        .map_err(|e| format!("Failed to rename config: {}", e))?;
    Ok(())
}

// ============================================================
// ACTIVE SESSION
// ============================================================

#[tauri::command]
async fn save_session(app: AppHandle, session_json: String) -> Result<(), String> {
    let path = app_data_dir(&app)?.join("sessions").join("active.json");
    // Atomic write: write to temp file, then rename
    let tmp_path = path.with_extension("json.tmp");
    fs::write(&tmp_path, &session_json)
        .map_err(|e| format!("Failed to write session: {}", e))?;
    fs::rename(&tmp_path, &path)
        .map_err(|e| format!("Failed to rename session: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn load_session(app: AppHandle) -> Result<String, String> {
    let path = app_data_dir(&app)?.join("sessions").join("active.json");
    match fs::read_to_string(&path) {
        Ok(contents) => Ok(contents),
        Err(_) => Ok("".to_string()), // Return empty string if no active session
    }
}

#[tauri::command]
async fn clear_session(app: AppHandle) -> Result<(), String> {
    let path = app_data_dir(&app)?.join("sessions").join("active.json");
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Failed to clear session: {}", e))?;
    }
    Ok(())
}

// ============================================================
// SESSION ARCHIVE
// ============================================================

#[tauri::command]
async fn archive_session(
    app: AppHandle,
    session_json: String,
    patient_name: Option<String>,
    audio_source_path: Option<String>,
) -> Result<String, String> {
    let base = app_data_dir(&app)?;
    let archive_dir = base.join("sessions").join("archive");

    // Generate filename: 2026-02-21_14-30_PatientName
    let now = chrono::Local::now();
    let name_part = patient_name.unwrap_or_else(|| "Session".to_string());
    let safe_name: String = name_part.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '_' })
        .collect();
    let filename = format!("{}_{}", now.format("%Y-%m-%d_%H-%M"), safe_name);

    // Save session JSON
    let json_path = archive_dir.join(format!("{}.json", filename));
    fs::write(&json_path, &session_json)
        .map_err(|e| format!("Failed to archive session: {}", e))?;

    // Move audio file if provided
    if let Some(audio_src) = audio_source_path {
        let audio_src_path = PathBuf::from(&audio_src);
        if audio_src_path.exists() {
            let wav_path = archive_dir.join(format!("{}.wav", filename));
            fs::rename(&audio_src_path, &wav_path)
                .map_err(|e| format!("Failed to move audio: {}", e))?;
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
async fn list_archived_sessions(app: AppHandle) -> Result<Vec<ArchivedSession>, String> {
    let archive_dir = app_data_dir(&app)?.join("sessions").join("archive");
    let mut sessions = Vec::new();

    if let Ok(entries) = fs::read_dir(&archive_dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "json") {
                let filename = path.file_stem()
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

    sessions.sort_by(|a, b| b.filename.cmp(&a.filename)); // Newest first
    Ok(sessions)
}

#[derive(Serialize)]
struct ArchivedSession {
    filename: String,
    path: String,
    size_bytes: u64,
    has_audio: bool,
}

#[tauri::command]
async fn load_archived_session(app: AppHandle, filename: String) -> Result<String, String> {
    let path = app_data_dir(&app)?
        .join("sessions").join("archive").join(format!("{}.json", filename));
    fs::read_to_string(&path).map_err(|e| format!("Failed to load archive: {}", e))
}

#[tauri::command]
async fn delete_archived_session(app: AppHandle, filename: String) -> Result<(), String> {
    let archive_dir = app_data_dir(&app)?.join("sessions").join("archive");
    let json_path = archive_dir.join(format!("{}.json", filename));
    let wav_path = archive_dir.join(format!("{}.wav", filename));

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
async fn load_corrections(app: AppHandle) -> Result<String, String> {
    let path = app_data_dir(&app)?.join("corrections.json");
    // Fallback to bundled version if user copy doesn't exist
    if !path.exists() {
        let resource_path = app.path().resource_dir()
            .map_err(|e| e.to_string())?
            .join("resources/corrections.json");
        return fs::read_to_string(&resource_path)
            .map_err(|e| format!("Failed to load corrections: {}", e));
    }
    fs::read_to_string(&path).map_err(|e| format!("Failed to load corrections: {}", e))
}

// ============================================================
// PDF EXPORT
// ============================================================

#[tauri::command]
async fn get_export_path(app: AppHandle, filename: String) -> Result<String, String> {
    let path = app_data_dir(&app)?.join("exports").join(filename);
    Ok(path.to_string_lossy().to_string())
}
```

### 3.1.4 Register Commands in lib.rs

Add ALL new commands to the `invoke_handler` in `lib.rs`:

```rust
.invoke_handler(tauri::generate_handler![
    // ... existing audio commands ...
    init_storage,
    load_config,
    save_config,
    save_session,
    load_session,
    clear_session,
    archive_session,
    list_archived_sessions,
    load_archived_session,
    delete_archived_session,
    load_corrections,
    get_export_path,
])
```

### 3.1.5 Call init_storage on App Startup

In `lib.rs`, add a setup hook that runs `init_storage` when the app launches:

```rust
.setup(|app| {
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = init_storage(handle).await {
            eprintln!("[ClinicalFlow] Storage init failed: {}", e);
        }
    });
    Ok(())
})
```

---

## 3.2 Frontend Changes (app.js)

### 3.2.1 Config Manager

Add a config manager near the top of app.js (after the Tauri API detection). This batches config reads/writes into a single object so we're not making 10 separate filesystem calls.

```javascript
/* Config Manager — single file for all settings */
const Config = {
  _data: {},
  _dirty: false,
  _saveTimeout: null,

  async load() {
    try {
      const raw = await tauriInvoke('load_config');
      this._data = raw ? JSON.parse(raw) : {};
    } catch(e) {
      console.warn('[ClinicalFlow] Config load failed:', e);
      this._data = {};
    }
  },

  get(key, fallback) {
    return this._data[key] !== undefined ? this._data[key] : fallback;
  },

  set(key, value) {
    this._data[key] = value;
    this._dirty = true;
    // Debounce writes — save at most once per 500ms
    clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(() => this._flush(), 500);
  },

  remove(key) {
    delete this._data[key];
    this._dirty = true;
    clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(() => this._flush(), 500);
  },

  async _flush() {
    if (!this._dirty) return;
    try {
      await tauriInvoke('save_config', { configJson: JSON.stringify(this._data) });
      this._dirty = false;
    } catch(e) {
      console.warn('[ClinicalFlow] Config save failed:', e);
    }
  }
};
```

**If NOT running in Tauri** (e.g., dev mode in browser), fall back to localStorage:

```javascript
const ConfigFallback = {
  _data: {},
  load() {
    // Load all ms- keys from localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('ms-')) {
        this._data[key] = localStorage.getItem(key);
      }
    }
  },
  get(key, fallback) {
    const val = localStorage.getItem(key);
    return val !== null ? val : fallback;
  },
  set(key, value) {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  },
  remove(key) { localStorage.removeItem(key); },
  _flush() {}
};

// Pick the right config backend
const cfg = window.__TAURI__ ? Config : ConfigFallback;
```

### 3.2.2 Replace Every localStorage Call

Here is EVERY localStorage call in the original app.js and its replacement. Use find-and-replace carefully.

**Session persistence (lines 60-87):**

```javascript
// OLD (line 73):
localStorage.setItem('ms-active-session', JSON.stringify(data));
// NEW:
if (window.__TAURI__) {
  tauriInvoke('save_session', { sessionJson: JSON.stringify(data) }).catch(e => console.warn('[ClinicalFlow] Session save failed:', e));
} else {
  localStorage.setItem('ms-active-session', JSON.stringify(data));
}

// OLD (line 77):
localStorage.removeItem('ms-active-session');
// NEW:
if (window.__TAURI__) {
  tauriInvoke('clear_session').catch(e => console.warn('[ClinicalFlow] Session clear failed:', e));
} else {
  localStorage.removeItem('ms-active-session');
}

// OLD (line 81):
const raw = localStorage.getItem('ms-active-session');
// NEW:
let raw;
if (window.__TAURI__) {
  try { raw = await tauriInvoke('load_session'); } catch(e) { raw = null; }
} else {
  raw = localStorage.getItem('ms-active-session');
}
```

**IMPORTANT: `getSavedSession()` must become async when using Tauri.** Any function that calls it also needs to await it. The call chain is: `init()` → `getSavedSession()` → shows restore prompt. Make `getSavedSession()` async and await it in `init()`.

**Theme (lines 179-180):**

```javascript
// OLD:
localStorage.setItem('ms-theme', t);
// NEW:
cfg.set('ms-theme', t);

// OLD:
setTheme(localStorage.getItem('ms-theme') || 'dark');
// NEW:
setTheme(cfg.get('ms-theme', 'dark'));
```

**Ollama settings (lines 450-471):**

```javascript
// OLD (save):
localStorage.setItem('ms-ollama-url', App.ollamaUrl);
localStorage.setItem('ms-ollama-model', App.ollamaModel);
localStorage.setItem('ms-ai-engine', App.aiEngine);
localStorage.setItem('ms-ollama-verify', App.ollamaVerify ? '1' : '0');
// NEW (save):
cfg.set('ms-ollama-url', App.ollamaUrl);
cfg.set('ms-ollama-model', App.ollamaModel);
cfg.set('ms-ai-engine', App.aiEngine);
cfg.set('ms-ollama-verify', App.ollamaVerify ? '1' : '0');

// OLD (load):
App.ollamaUrl = localStorage.getItem('ms-ollama-url') || 'http://localhost:11434';
App.ollamaModel = localStorage.getItem('ms-ollama-model') || 'llama3.1:8b';
App.aiEngine = localStorage.getItem('ms-ai-engine') || 'ollama';
App.ollamaVerify = localStorage.getItem('ms-ollama-verify') === '1';
// NEW (load):
App.ollamaUrl = cfg.get('ms-ollama-url', 'http://localhost:11434');
App.ollamaModel = cfg.get('ms-ollama-model', 'llama3.1:8b');
App.aiEngine = cfg.get('ms-ai-engine', 'ollama');
App.ollamaVerify = cfg.get('ms-ollama-verify', '0') === '1';
```

**API key (lines 1193-1194):**

```javascript
// OLD:
const key = localStorage.getItem('ms-dg-key') || '';
// NEW:
const key = cfg.get('ms-dg-key', '');

// OLD:
localStorage.setItem('ms-dg-key', key);
// NEW:
cfg.set('ms-dg-key', key);
```

**Sidebar collapse (line 1282-1304):**

```javascript
// OLD:
const saved = localStorage.getItem('ms-sidebar-collapsed');
// NEW:
const saved = cfg.get('ms-sidebar-collapsed', null);

// OLD:
localStorage.setItem('ms-sidebar-collapsed', collapsing);
// NEW:
cfg.set('ms-sidebar-collapsed', collapsing);
```

**Panel ratio (lines 1287-1437):**

```javascript
// OLD (every occurrence):
localStorage.getItem('ms-panel-ratio');
// NEW:
cfg.get('ms-panel-ratio', null);

// OLD:
localStorage.setItem('ms-panel-ratio', JSON.stringify({tx:cur.txFr, note:cur.noteFr}));
// NEW:
cfg.set('ms-panel-ratio', JSON.stringify({tx:cur.txFr, note:cur.noteFr}));

// OLD:
localStorage.removeItem('ms-panel-ratio');
// NEW:
cfg.remove('ms-panel-ratio');
```

**Transcription mode (if added in Phase 2):**

```javascript
// Any localStorage calls for ms-transcription-mode:
cfg.set('ms-transcription-mode', mode);
cfg.get('ms-transcription-mode', 'online');
```

### 3.2.3 Corrections Dictionary Loading

Replace the fetch call for corrections.json:

```javascript
// OLD (around line 108):
const r = await fetch('corrections.json');
// NEW:
let correctionsData;
if (window.__TAURI__) {
  try {
    const raw = await tauriInvoke('load_corrections');
    correctionsData = JSON.parse(raw);
  } catch(e) {
    console.warn('[ClinicalFlow] Corrections load failed:', e);
    correctionsData = [];
  }
} else {
  const r = await fetch('corrections.json');
  correctionsData = await r.json();
}
```

### 3.2.4 Init Sequence Update

The app's `init()` function needs to load config before anything else:

```javascript
async function init() {
  // 1. Init Tauri if available
  if (window.__TAURI__) await _initTauri();

  // 2. Load config FIRST (everything else depends on it)
  await cfg.load();

  // 3. Now load theme, settings, etc. (they all use cfg.get())
  loadTheme();
  loadOllamaSettings();
  loadApiKey();

  // 4. Check for saved session (now async in Tauri)
  const saved = await getSavedSession();
  if (saved) { /* show restore prompt */ }

  // ... rest of init ...
}
```

---

## 3.3 Session Archive UI (Optional but Recommended)

Add a "Past Sessions" view accessible from the sidebar. This lets the clinician browse previous encounters.

### 3.3.1 HTML Addition (sidebar)

Add below the existing speakers list in the sidebar:

```html
<div class="sidebar-section">
  <div class="section-header">
    <span class="section-title">Past Sessions</span>
    <button class="icon-btn small" id="refreshArchiveBtn" data-tooltip="Refresh">↻</button>
  </div>
  <div id="archiveList" class="archive-list">
    <!-- Populated dynamically -->
  </div>
</div>
```

### 3.3.2 JavaScript for Archive List

```javascript
async function loadArchiveList() {
  if (!window.__TAURI__) return;
  try {
    const sessions = await tauriInvoke('list_archived_sessions');
    const container = g('archiveList');
    if (!container) return;
    container.innerHTML = sessions.map(s => `
      <div class="archive-item" data-filename="${esc(s.filename)}">
        <span class="archive-name">${esc(s.filename)}</span>
        <span class="archive-meta">${s.has_audio ? '🎤 ' : ''}${(s.size_bytes/1024).toFixed(0)}KB</span>
      </div>
    `).join('') || '<div class="archive-empty">No archived sessions</div>';

    // Click to load an archived session
    container.querySelectorAll('.archive-item').forEach(el => {
      el.addEventListener('click', () => loadFromArchive(el.dataset.filename));
    });
  } catch(e) {
    console.warn('[ClinicalFlow] Archive list failed:', e);
  }
}

async function loadFromArchive(filename) {
  try {
    const raw = await tauriInvoke('load_archived_session', { filename });
    const data = JSON.parse(raw);
    restoreSession(data);
    toast('Loaded archived session: ' + filename, 'success');
  } catch(e) {
    toast('Failed to load session: ' + e, 'error');
  }
}
```

### 3.3.3 Archive on New Session

When the user clicks "New Session" (or starts a new recording with an existing session):

```javascript
async function startNewSession() {
  // Archive current session if it has entries
  if (App.entries.length > 0 && window.__TAURI__) {
    const sessionData = JSON.stringify({
      entries: App.entries,
      speakers: App.speakers,
      noteFormat: App.noteFormat,
      noteSections: App.noteSections,
      elapsed: App.elapsed,
      archivedAt: new Date().toISOString()
    });
    // Use first speaker name or "Session" as filename
    const patientName = App.speakers.length > 0 ? App.speakers[0].name : null;
    try {
      await tauriInvoke('archive_session', {
        sessionJson: sessionData,
        patientName: patientName,
        audioSourcePath: App.lastAudioPath || null
      });
      toast('Previous session archived', 'info');
    } catch(e) {
      console.warn('[ClinicalFlow] Archive failed:', e);
    }
  }

  // Reset state
  App.entries = [];
  App.speakers = [];
  App.nextEntryId = 1;
  App.nextSpkId = 1;
  App.activeSpkId = null;
  App.elapsed = 0;
  App.noteGenerated = false;
  App.noteSections = {};
  clearSavedSession();
  renderEntries();
  renderSpeakers();
  updSpkCount();
  updWordCount();
  loadArchiveList(); // Refresh the archive list
}
```

---

## 3.4 Testing Checklist

After implementing, verify EACH of these:

- [ ] App launches successfully with `npm run tauri dev`
- [ ] `$APPDATA/com.clinicalflow.app/` directory structure is created on first launch
- [ ] `corrections.json` is copied from bundle to app data on first launch
- [ ] Theme preference persists across app restart (change to light, close, reopen — should be light)
- [ ] Ollama model/URL settings persist across app restart
- [ ] API key persists across app restart (set a key, close, reopen — key should be saved)
- [ ] Sidebar collapsed state persists across app restart
- [ ] Panel resize ratio persists across app restart
- [ ] Recording a session creates entries that auto-save to `sessions/active.json`
- [ ] Closing and reopening the app shows the "Restore session?" prompt with saved entries
- [ ] Starting a new session archives the previous one to `sessions/archive/`
- [ ] Archived sessions appear in the Past Sessions sidebar list
- [ ] Clicking an archived session loads it into the main view
- [ ] `config.json` file is valid JSON after multiple setting changes (not corrupted)
- [ ] App still works in browser dev mode (falls back to localStorage)
- [ ] No `localStorage` calls remain in any code path when running in Tauri

### Quick Smoke Test

```
1. npm run tauri dev
2. Change theme to light
3. Set a fake API key "test123"
4. Resize the panels
5. Close the app completely
6. npm run tauri dev again
7. Verify: light theme, API key still saved, panels at same ratio
8. Start recording, say a few words, stop
9. Close the app (DON'T click new session)
10. npm run tauri dev again
11. Verify: "Restore session?" prompt appears with your entries
12. Click restore, verify entries are there
13. Click "New Session"
14. Verify: Past Sessions list shows the archived session
```

---

## 3.5 What NOT To Touch

- Do NOT modify the recording/transcription pipeline (Phase 2)
- Do NOT modify the clinical prompt builder or note generation
- Do NOT modify styles.css
- Do NOT change the session data structure (entries, speakers, etc.) — just change WHERE it's stored
- Do NOT make config writes synchronous/blocking — always use the debounced Config manager

---

## 3.6 Common Pitfalls

- **`getSavedSession()` must become async.** This cascades to `init()` and anywhere it's called. Handle this carefully.
- **Atomic writes are critical.** Always write to `.tmp` then rename. If the app crashes mid-write to `active.json`, you'd lose the session without atomic writes.
- **JSON parse errors.** Always wrap `JSON.parse()` in try/catch. A corrupted file should not crash the app.
- **Config debouncing.** The panel resize fires many events per second during drag. The 500ms debounce prevents hammering the filesystem.
- **Browser fallback.** Every Tauri invoke must have a `window.__TAURI__` check with a localStorage fallback, so the app still works in a browser for development.
