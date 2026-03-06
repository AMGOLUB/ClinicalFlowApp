# ClinicalFlow — Windows Readiness Audit

**Date:** 2026-03-05

---

## 1. Tauri Config (`tauri.conf.json`)

**macOS-specific:**
- Bundle targets: `["dmg"]` only — no Windows targets (`msi`, `nsis`)
- `macOS` block: `minimumSystemVersion: "11.0"`, `hardenedRuntime: true`, `entitlements: "Entitlements.plist"`, `signingIdentity: null`

**No Windows bundle settings exist.** You'd need to add:
```json
"windows": { "certificateThumbprint": null, "timestampUrl": "http://timestamp.digicert.com" }
```
and add `"nsis"` or `"msi"` to the targets array.

**Cross-platform (no changes needed):**
- `withGlobalTauri: true`
- CSP: `default-src 'self'; connect-src 'self' http://localhost:11434 https://api.anthropic.com wss://api.deepgram.com https://*.supabase.co; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:`
- Plugins: `deep-link` with `clinicalflow` scheme
- Capabilities: `core:default`, `shell:allow-execute/spawn/open`, `fs:default`, `dialog:default/allow-save`, `http:default`, `notification:default`, `deep-link:default`

---

## 2. Cargo.toml

**Zero platform-gated dependencies.** All 25 crates are cross-platform:
- `cpal 0.15` — uses CoreAudio on macOS, **WASAPI on Windows**, ALSA/Pulse on Linux
- `aes-gcm`, `pbkdf2`, `argon2`, `sha2`, `rand` — pure Rust crypto
- `reqwest`, `tokio`, `serde`, `chrono`, `dirs`, `sysinfo`, `mysql_async` — all cross-platform

No `[target.'cfg(target_os="macos")'.dependencies]` sections.

---

## 3. Rust Platform-Specific Code

| File | Lines | What | Windows Status |
|------|-------|------|----------------|
| `main.rs` | 1 | `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` | **Already Windows-ready** (hides console) |
| `storage.rs` | 319-335 | HTML file opening: `open` / `cmd /c start` / `xdg-open` | **Already cross-platform** |
| `storage.rs` | 413-429 | PDF file opening: same pattern | **Already cross-platform** |
| `storage.rs` | 370-381 | `html2pdf-aarch64-apple-darwin` hardcoded path | **macOS only — needs Windows PDF solution** |
| `audio.rs` | 37-38 | `unsafe impl Send/Sync for StreamWrapper` | Cross-platform (cpal uses WASAPI on Windows) |
| `audio.rs` | 209-218, 250, 280 | `/tmp/whisper.cpp/...` dev fallback paths | Unix-only, but dev-mode only — not in production |

**Not found (good):** No CoreAudio, Security.framework, Keychain, NSApplication, AppleScript, objc imports. No hardcoded `/Applications/`, `/Library/`, `~/Library/` paths.

---

## 4. Sidecar Binaries

| Current (macOS arm64) | Windows Equivalent Needed | Notes |
|------------------------|--------------------------|-------|
| `whisper-server-aarch64-apple-darwin` (3.3M) | `whisper-server-x86_64-pc-windows-msvc.exe` | whisper.cpp builds on Windows with CUDA/DirectML |
| `whisper-cli-aarch64-apple-darwin` (2.9M) | `whisper-cli-x86_64-pc-windows-msvc.exe` | Dead code (`#[allow(dead_code)]`) — may skip |
| `html2pdf-aarch64-apple-darwin` (60K) | **No direct equivalent** | Swift/WebKit binary — needs replacement |

The Rust code already searches for both `whisper-server` and `whisper-server.exe`, so binary resolution will work once the Windows binaries are placed.

---

## 5. Resources

| Resource | Size | Windows Compatible? |
|----------|------|-------------------|
| `models/ggml-large-v3-turbo-q5_0.bin` | 547M | Yes — model file is platform-agnostic |
| `corrections*.json` (×6) | ~16K total | Yes |
| `fonts/LiberationSans-*.ttf` (×2) | ~800K | Yes |

All resolved via `app.path().resource_dir()` — cross-platform.

---

## 6. Info.plist & Entitlements

**Info.plist** (macOS only, no Windows equivalent needed):
- `NSMicrophoneUsageDescription` — Windows handles mic permissions via system settings
- `CFBundleURLTypes` → `clinicalflow://` scheme — Windows uses registry

**Entitlements.plist** (macOS only):

| Entitlement | Purpose | Windows Equivalent |
|-------------|---------|-------------------|
| `cs.allow-jit` | WKWebView JS | Not needed (Edge WebView2) |
| `cs.allow-unsigned-executable-memory` | WKWebView | Not needed |
| `cs.disable-library-validation` | Sidecar binaries | Not needed |
| `device.audio-input` | Microphone | System-level permission |
| `network.client` | API calls | No restriction on Windows |
| `files.user-selected.read-write` | File I/O | No restriction |

---

## 7. Deep Links

Configured via `tauri-plugin-deep-link` + Info.plist `CFBundleURLSchemes`. On Windows, Tauri automatically registers the `clinicalflow://` scheme in the Windows Registry during installation. **No code changes needed** — the plugin handles platform differences.

---

## 8. Audio Capture

Uses **cpal** (cross-platform). `cpal::default_host()` automatically selects:
- macOS → CoreAudio
- Windows → **WASAPI**
- Linux → ALSA/PulseAudio

Supports both I16 and F32 sample formats with resampling to 16kHz mono. The `StreamWrapper` unsafe Send/Sync impl works on all platforms. **No changes needed.**

Bonus: `navigator.mediaDevices` **IS available** in Edge WebView2 (unlike WKWebView), so the browser fallback path also works on Windows.

---

## 9. File System Paths

**All cross-platform.** Every file path uses `app.path().app_data_dir()` or `app.path().resource_dir()`. No hardcoded forward slashes in path construction (uses `PathBuf::join()`). JavaScript has zero file path logic — all I/O delegates to Tauri commands.

| File | Path Resolution | Cross-platform? |
|------|----------------|----------------|
| `session.json` | `{app_data_dir}/session.json` | Yes |
| `config.json` | `{app_data_dir}/config.json` | Yes |
| `auth.json` | `{app_data_dir}/auth.json` | Yes |
| `sessions/` | `{app_data_dir}/sessions/` | Yes |
| `logs/` | `{app_data_dir}/logs/` | Yes |

---

## 10. Code Signing & Notarization

- `signingIdentity: null` — no macOS signing active
- `bundle_dmg.sh` has codesign + notarytool support but not currently used
- **No GitHub Actions CI/CD** for desktop builds (only `deploy-website.yml`)
- Windows would need: code signing certificate, `certificateThumbprint` in tauri.conf.json

---

## 11. Auto-Updater

**Not configured.** No `tauri-plugin-updater` in Cargo.toml. Distribution is manual (DMG uploaded to R2, presigned URLs via edge function).

---

## 12. Frontend JS Platform Detection

All platform checks are `window.__TAURI__` / `tauriInvoke` presence checks — no OS-specific detection (`navigator.platform`, `process.platform`). SVG workarounds (dual-element pattern) work fine in Edge WebView2. All `shell.open()` calls use Tauri's cross-platform API.

---

## 13. Shell Commands (Rust)

| Command | Platform | Purpose |
|---------|----------|---------|
| `whisper-server` spawn | All | Transcription server |
| `html2pdf` spawn | macOS only | PDF generation |
| `open` | macOS | Open files/PDFs |
| `cmd /c start` | Windows | Open files/PDFs |
| `xdg-open` | Linux | Open files/PDFs |

---

## 14. Encryption & Security

**All pure Rust — no platform-specific APIs:**
- `aes-gcm 0.10` for AES-256-GCM authenticated encryption
- `pbkdf2 0.12` with HMAC-SHA256, 100,000 iterations (PIN → key derivation)
- `argon2 0.5` for PIN hashing
- No macOS Keychain, Windows DPAPI, or Linux keyring usage

| File | Encryption | Key Source |
|------|-----------|-----------|
| `session.json` | AES-256-GCM | Compiled-in app key (at-rest protection only) |
| `config.json` | AES-256-GCM | PIN-derived via PBKDF2 (100k iterations) |
| `auth.json` | None | Argon2 PIN hash only |

---

## Blockers for Windows

| Priority | Issue | Effort |
|----------|-------|--------|
| **Critical** | `html2pdf` sidecar is Swift/WebKit (macOS only). Need Windows PDF solution (wkhtmltopdf, headless Chrome, or Rust library like `headless_chrome`) | Medium |
| **Critical** | Compile `whisper-server` for Windows x86_64 with CUDA or DirectML GPU acceleration | Medium-High |
| **Critical** | Add `"nsis"` or `"msi"` to bundle targets, add Windows bundle config | Low |
| **Minor** | `/tmp/whisper.cpp/...` dev fallback paths are Unix-only | Low (dev-mode only) |
| **None** | Everything else (audio, crypto, file paths, deep links, CSP, frontend JS) is already cross-platform | — |

**The codebase is ~90% Windows-ready.** The two real blockers are the PDF sidecar replacement and compiling whisper-server for Windows.
