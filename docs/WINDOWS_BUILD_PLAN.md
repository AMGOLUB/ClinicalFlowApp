# ClinicalFlow — Windows Build Implementation Plan

> **Audience:** Claude Code (autonomous developer agent)
> **Context:** ClinicalFlow is a Tauri v2 desktop app currently macOS-only. The Windows readiness audit (docs/WINDOWS_READINESS_AUDIT.md) found the codebase is ~90% cross-platform. This plan addresses the two critical blockers (PDF generation and whisper-server compilation) and everything else needed to produce a working Windows installer.
> **Target:** Windows 10/11, x86_64, NSIS installer (.exe)

---

## Table of Contents

1. [Audit Summary](#1-audit-summary)
2. [Blocker 1: PDF Generation Replacement](#2-blocker-1-pdf-generation-replacement)
3. [Blocker 2: Whisper Server for Windows](#3-blocker-2-whisper-server-for-windows)
4. [Tauri Config Updates](#4-tauri-config-updates)
5. [Rust Code Changes](#5-rust-code-changes)
6. [Build Environment Setup](#6-build-environment-setup)
7. [Windows-Specific Considerations](#7-windows-specific-considerations)
8. [GPU Acceleration on Windows](#8-gpu-acceleration-on-windows)
9. [Code Signing](#9-code-signing)
10. [Distribution & Download](#10-distribution--download)
11. [Website Updates](#11-website-updates)
12. [Implementation Order](#12-implementation-order)
13. [Files Summary](#13-files-summary)
14. [Verification Checklist](#14-verification-checklist)

---

## 1. Audit Summary

### Already Cross-Platform (No Changes Needed)
- **Audio capture:** cpal uses WASAPI on Windows automatically
- **Encryption:** Pure Rust (aes-gcm, pbkdf2, argon2) — no platform APIs
- **File paths:** All use `PathBuf::join()` and `app.path().app_data_dir()` — no hardcoded separators
- **Deep links:** tauri-plugin-deep-link auto-registers `clinicalflow://` in Windows Registry during installation
- **Frontend JS:** All platform checks are `window.__TAURI__` presence — no OS detection
- **Resources:** Model files, correction JSONs, fonts — all platform-agnostic
- **Dependencies:** All 25 Cargo crates are cross-platform (zero `cfg(target_os)` gating)
- **CSP:** Identical on all platforms
- **Shell commands for opening files:** Already has `cmd /c start` branch for Windows (storage.rs lines 319-335, 413-429)
- **Console hiding:** `main.rs` already has `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`

### Two Critical Blockers
1. **`html2pdf` sidecar** — Swift/WebKit binary, macOS-only. Needs cross-platform replacement.
2. **`whisper-server` sidecar** — Needs to be compiled for Windows x86_64 with GPU acceleration.

### Minor Issues
- `/tmp/whisper.cpp/...` dev fallback paths in audio.rs — Unix-only but dev-mode only, not a production issue.
- `whisper-cli` sidecar is dead code (`#[allow(dead_code)]`) — skip for Windows, don't compile.

---

## 2. Blocker 1: PDF Generation Replacement

### Current Approach
`storage.rs` (line 370-381) shells out to `html2pdf-aarch64-apple-darwin`, a Swift binary that uses WebKit to render HTML to PDF. This is macOS-only.

### Recommended Replacement: `headless_chrome` Rust Crate

Use the `headless_chrome` crate to render HTML to PDF via Chromium. This is cross-platform (macOS, Windows, Linux) and produces identical output to what a browser would render — including CSS, fonts, and SVG (important for dental charts).

#### Why `headless_chrome` over alternatives:
- **wkhtmltopdf:** Deprecated, uses ancient Qt WebKit, poor CSS support, known security issues
- **printpdf/pdf-rs:** Can't render HTML — you'd need to rewrite the PDF layout from scratch
- **Bundled Chrome binary:** Too large (200MB+). The `headless_chrome` crate finds an installed Chromium/Chrome/Edge — Edge ships with Windows 10/11, Chrome is on most machines
- **headless_chrome:** Uses the Chrome DevTools Protocol to control any installed Chromium-based browser. Edge (which IS Chromium and ships with Windows) works perfectly. On macOS it finds Chrome or Chromium.

#### Implementation

**Step 2a: Add Cargo dependency**

File: `src-tauri/Cargo.toml`

```toml
[dependencies]
headless_chrome = "1"
```

**Step 2b: Create cross-platform PDF function**

File: `src-tauri/src/pdf.rs` (NEW)

```rust
use headless_chrome::{Browser, LaunchOptions};
use headless_chrome::protocol::cdp::Page;
use std::path::Path;

pub fn html_to_pdf(html_content: &str, output_path: &Path) -> Result<(), String> {
    // Launch browser — finds installed Chrome, Chromium, or Edge automatically
    let options = LaunchOptions {
        headless: true,
        sandbox: true,
        ..Default::default()
    };
    
    let browser = Browser::new(options)
        .map_err(|e| format!("Failed to launch browser for PDF: {}. Ensure Chrome or Edge is installed.", e))?;
    
    let tab = browser.new_tab()
        .map_err(|e| format!("Failed to create tab: {}", e))?;
    
    // Navigate to the HTML content via data URI or temp file
    // Using a temp file is more reliable for large HTML with embedded images
    let temp_html = output_path.with_extension("html");
    std::fs::write(&temp_html, html_content)
        .map_err(|e| format!("Failed to write temp HTML: {}", e))?;
    
    let file_url = format!("file://{}", temp_html.display());
    tab.navigate_to(&file_url)
        .map_err(|e| format!("Failed to navigate: {}", e))?;
    
    tab.wait_until_navigated()
        .map_err(|e| format!("Navigation timeout: {}", e))?;
    
    // Generate PDF
    let pdf_data = tab.print_to_pdf(Some(Page::PrintToPdfParams {
        landscape: Some(false),
        print_background: Some(true),
        margin_top: Some(0.4),
        margin_bottom: Some(0.4),
        margin_left: Some(0.4),
        margin_right: Some(0.4),
        paper_width: Some(8.5),
        paper_height: Some(11.0),
        ..Default::default()
    }))
    .map_err(|e| format!("Failed to generate PDF: {}", e))?;
    
    std::fs::write(output_path, &pdf_data)
        .map_err(|e| format!("Failed to write PDF: {}", e))?;
    
    // Clean up temp file
    let _ = std::fs::remove_file(&temp_html);
    
    Ok(())
}
```

**Step 2c: Update storage.rs to use new PDF function**

Replace the `html2pdf` sidecar call (lines 370-381) with a call to `pdf::html_to_pdf()`. The function signature stays the same — it takes HTML content and an output path.

```rust
// OLD (macOS only):
let html2pdf_path = app.path().resource_dir()...join("html2pdf-aarch64-apple-darwin");
Command::new(html2pdf_path).arg(&html_path).arg(&pdf_path).output()?;

// NEW (cross-platform):
use crate::pdf;
pdf::html_to_pdf(&html_content, &pdf_path)?;
```

**Step 2d: Register module**

File: `src-tauri/src/lib.rs` or `main.rs` — add `mod pdf;`

**Step 2e: Remove html2pdf sidecar**

Delete `src-tauri/binaries/html2pdf-aarch64-apple-darwin`. It's no longer needed on any platform.

#### Fallback Strategy

If `headless_chrome` can't find a browser (rare — Edge ships with Windows, Chrome is on 70%+ of machines):
- Show user-friendly error: "PDF export requires Chrome, Edge, or Chromium. Please install one of these browsers."
- The note is still copyable to clipboard (existing feature) as a fallback
- Log the specific error for debugging

#### Testing

- Verify PDF output matches current html2pdf output visually (fonts, dental chart SVGs, section formatting)
- Test on Windows with only Edge installed (no Chrome)
- Test on macOS with Chrome installed
- Test with no Chromium browser installed — verify graceful error message

---

## 3. Blocker 2: Whisper Server for Windows

### What's Needed

Compile `whisper-server` from whisper.cpp for Windows x86_64. The binary must be placed at:
```
src-tauri/binaries/whisper-server-x86_64-pc-windows-msvc.exe
```

Tauri's sidecar resolution already handles the platform suffix — the Rust code searches for both `whisper-server` and `whisper-server.exe`.

### Build Instructions (on a Windows machine or cross-compile)

#### Option A: Build on Windows (Recommended)

Requires: Visual Studio 2022 with C++ workload, CMake, Git.

```powershell
git clone https://github.com/ggml-org/whisper.cpp.git C:\temp\whisper.cpp
cd C:\temp\whisper.cpp
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release -j
copy build\bin\Release\whisper-server.exe src-tauri\binaries\whisper-server-x86_64-pc-windows-msvc.exe
```

This produces a CPU-only build. For GPU acceleration, see Section 8.

#### Option B: Cross-Compile from macOS

Not practical for whisper.cpp due to MSVC/Windows SDK dependencies. Build on a Windows machine or use GitHub Actions with a `windows-latest` runner.

### whisper-cli

The audit found `whisper-cli` is dead code (`#[allow(dead_code)]`). Do NOT compile it for Windows — skip it entirely. If the code references it anywhere in a non-dead path, remove the reference.

---

## 4. Tauri Config Updates

### File: `src-tauri/tauri.conf.json`

#### Add Windows bundle targets

Find the `bundle` section and update `targets`:

```json
"targets": ["dmg", "nsis"]
```

Or to support both MSI and NSIS:
```json
"targets": ["dmg", "nsis", "msi"]
```

NSIS is recommended over MSI — it produces a familiar `.exe` installer with a wizard, supports per-user or machine-wide install, and handles auto-updates better.

#### Add Windows-specific bundle config

Add a `windows` block inside `bundle`:

```json
"windows": {
  "certificateThumbprint": null,
  "timestampUrl": "http://timestamp.digicert.com",
  "webviewInstallMode": {
    "type": "downloadBootstrapper"
  }
}
```

The `webviewInstallMode` ensures WebView2 is installed if missing (rare on Windows 10/11, but possible on Windows 10 LTSC or Server).

#### Add NSIS config (optional but recommended)

```json
"nsis": {
  "displayLanguageSelector": false,
  "installerIcon": "icons/icon.ico",
  "headerImage": null,
  "sidebarImage": null,
  "languages": ["English"],
  "perMachine": false
}
```

`perMachine: false` = installs to the user's AppData (no admin required). Set to `true` for enterprise/hospital deployments that want machine-wide install.

#### Add Windows icon

Tauri needs a `.ico` file for Windows. The icon must be placed in `src-tauri/icons/`:

```
src-tauri/icons/icon.ico     (256x256 multi-resolution ICO)
```

Generate from the existing macOS icon:
```bash
# If you have a 1024x1024 PNG icon:
magick icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```

Or use an online converter. The ICO must contain at least 32x32 and 256x256 sizes.

---

## 5. Rust Code Changes

### 5a. storage.rs — Replace html2pdf (covered in Section 2)

### 5b. audio.rs — Dev fallback paths (optional, low priority)

Lines 209-218, 250, 280 have `/tmp/whisper.cpp/...` paths as development fallbacks. These only trigger in dev mode when the sidecar binary isn't found. They won't cause errors in production (the code gracefully falls through), but for cleanliness:

```rust
// Optional: add Windows dev fallback
#[cfg(target_os = "windows")]
let dev_fallback = r"C:\temp\whisper.cpp\build\bin\Release\whisper-server.exe";
#[cfg(not(target_os = "windows"))]
let dev_fallback = "/tmp/whisper.cpp/build/bin/whisper-server";
```

This is a nice-to-have for development on Windows but not required for production.

### 5c. lib.rs — Add pdf module

Add `mod pdf;` to register the new PDF module.

### 5d. No other Rust changes needed

The audit confirmed: no CoreAudio, no Keychain, no NSApplication, no hardcoded macOS paths in production code paths. cpal, encryption, file I/O, and all Tauri commands work as-is.

---

## 6. Build Environment Setup

### Requirements for Building on Windows

| Tool | Version | Purpose |
|------|---------|---------|
| Rust | stable (via rustup) | Compiler |
| Visual Studio 2022 | Community (free) | C++ build tools, MSVC linker, Windows SDK |
| Node.js | 18+ | Tauri frontend build |
| CMake | 3.20+ | Building whisper.cpp |
| Git | latest | Cloning whisper.cpp |

### Install Rust on Windows

```powershell
winget install Rustlang.Rustup
rustup default stable
rustup target add x86_64-pc-windows-msvc
```

### Install Visual Studio Build Tools

```powershell
winget install Microsoft.VisualStudio.2022.BuildTools
# Then open Visual Studio Installer and add "Desktop development with C++"
```

### Build ClinicalFlow for Windows

```powershell
cd ClinicalFlow
npm install
npx tauri build
```

This produces:
- `src-tauri/target/release/ClinicalFlow.exe` (standalone binary)
- `src-tauri/target/release/bundle/nsis/ClinicalFlow_1.0.0_x64-setup.exe` (installer)

---

## 7. Windows-Specific Considerations

### 7a. Microphone Permissions

Windows 10/11 has a system-level microphone permission. If the user has "Microphone access" disabled in Settings → Privacy → Microphone, cpal will fail to open the audio device.

The existing error handling in audio.rs should catch this — cpal returns an error when it can't access the microphone. Verify the error message is user-friendly: "Microphone access denied. Please enable microphone access in Windows Settings → Privacy → Microphone."

### 7b. Windows Defender / SmartScreen

Unsigned executables trigger SmartScreen warnings ("Windows protected your PC — this app is from an unknown publisher"). Users have to click "More info" → "Run anyway." This is unacceptable for a healthcare product.

**Solution:** Code sign the installer (see Section 9). Without a code signing certificate, every user will see this warning on first launch.

### 7c. WebView2 Runtime

Tauri v2 on Windows uses Microsoft Edge WebView2. This ships with Windows 10 (version 1903+) and Windows 11. For older builds or Windows Server, the installer will need to download the WebView2 bootstrapper. The `webviewInstallMode: "downloadBootstrapper"` config handles this automatically.

### 7d. Antivirus False Positives

Some antivirus software flags new/unknown executables. Code signing reduces this significantly. If users report false positives, submit the signed binary to antivirus vendors for whitelisting (Microsoft, Norton, Kaspersky, etc.).

### 7e. Data Directory

On Windows, `app.path().app_data_dir()` resolves to:
```
C:\Users\{username}\AppData\Roaming\com.clinicalflow.ai\
```

This is the correct location for persistent app data on Windows. No changes needed — Tauri handles this.

### 7f. Firewall

When whisper-server starts listening on `127.0.0.1:{port}`, Windows Firewall may prompt the user to allow network access. Since it's localhost-only, it should be auto-allowed, but test this. If a prompt appears, you may need to add a firewall rule during installation via NSIS.

---

## 8. GPU Acceleration on Windows

### The Landscape

| GPU Backend | Hardware | Status |
|-------------|----------|--------|
| CUDA | NVIDIA GPUs | Best performance, requires CUDA toolkit |
| DirectML | Any GPU (NVIDIA, AMD, Intel) | Built into Windows, no extra drivers |
| Vulkan | Most GPUs | Good fallback, requires Vulkan SDK |
| CPU | Any | Always works, slowest |

### Recommendation: Ship CPU-only for v1, Add DirectML in v1.1

**For the initial Windows release:** Ship a CPU-only whisper-server binary. This works on all Windows machines. Performance will be slower than Metal on macOS, but the app is functional.

**For v1.1:** Add DirectML support. DirectML is Microsoft's hardware-accelerated ML inference layer built into Windows 10 (1903+). It works with ANY GPU — NVIDIA, AMD, Intel integrated. No extra drivers or SDKs needed for the end user.

Building whisper.cpp with DirectML:
```powershell
cd C:\temp\whisper.cpp
cmake -B build -DCMAKE_BUILD_TYPE=Release -DGGML_DIRECTML=ON
cmake --build build --config Release -j
```

This is the Windows equivalent of Metal on macOS — it automatically uses whatever GPU is available.

### Why NOT CUDA for v1:
- Requires NVIDIA GPU (excludes AMD and Intel users)
- Requires CUDA toolkit installed (end users won't have this)
- Redistributable size is large (~400MB for CUDA runtime DLLs)
- DirectML covers the same use case without any user-side setup

---

## 9. Code Signing

### Why It's Critical for Healthcare

Unsigned Windows apps trigger SmartScreen warnings, antivirus flags, and group policy blocks. Hospitals with managed IT environments will block unsigned executables entirely. Code signing is not optional for a healthcare product.

### Options

| Certificate Type | Cost | Trust Level | SmartScreen |
|-----------------|------|-------------|-------------|
| Standard code signing (OV) | ~$200-400/year | Organization validated | Builds trust over time |
| EV code signing | ~$300-500/year | Extended validation + hardware token | Immediate SmartScreen trust |

**Recommendation:** Get an EV code signing certificate from DigiCert, Sectigo, or GlobalSign. EV certificates get immediate SmartScreen reputation — users won't see warnings even on the first install.

### Configuration

Once you have a certificate, update `tauri.conf.json`:

```json
"windows": {
  "certificateThumbprint": "YOUR_CERT_THUMBPRINT",
  "timestampUrl": "http://timestamp.digicert.com"
}
```

### For v1 Without a Certificate

Ship unsigned. Users will see SmartScreen warning. Include a note on the download page: "Windows may show a security warning for new applications. Click 'More info' → 'Run anyway' to proceed. We are in the process of obtaining a code signing certificate."

This is acceptable for early beta users but must be resolved before any hospital deployment.

---

## 10. Distribution & Download

### Download Hosting

Use the same R2 bucket and `download-release` Edge Function as the macOS DMG. Add a Windows NSIS installer alongside:

```
R2 Bucket:
  clinicalflow-releases/
    ClinicalFlow-1.0.0.dmg             (macOS)
    ClinicalFlow-1.0.0-x64-setup.exe   (Windows)
```

### Edge Function Update

The `download-release` Edge Function generates presigned URLs for downloads. It currently serves the DMG. Update it to detect the user's OS and serve the correct file:

```typescript
// In download-release/index.ts:
const userAgent = req.headers.get('user-agent') || '';
const isWindows = userAgent.includes('Windows');
const fileName = isWindows 
  ? 'ClinicalFlow-1.0.0-x64-setup.exe' 
  : 'ClinicalFlow-1.0.0.dmg';
```

Or accept an `os` query parameter: `/functions/v1/download-release?os=windows`

### Website Download Section

Update the download section on `index.html` and `get-started.html` to show both options with OS auto-detection. See Section 11.

---

## 11. Website Updates

### 11a. index.html — Download Section

The current download section shows:
- macOS: "Download for macOS" button (active)
- Windows: "Coming soon — Join the waitlist / Notify Me" (disabled)
- Linux: "Coming soon — Join the waitlist / Notify Me" (disabled)

Update Windows to active:

```html
<!-- Windows card — change from "coming soon" to active -->
<h4>Windows</h4>
<p>Windows 10/11 · x86_64</p>
<a href="/signup" class="btn btn--primary">Download for Windows</a>
```

Remove the "Notify Me" button and waitlist language for Windows.

### 11b. index.html — Requirements Section

Update the requirements section to include Windows:

```
Online Mode — Minimum Requirements:
  • macOS 11.0 or later (Apple Silicon or Intel)
  • Windows 10 (version 1903+) or Windows 11
  • 4 GB RAM
  • ...

Offline Mode — Recommended Specs:
  • Apple Silicon Mac (M1+) or modern Windows PC with dedicated GPU
  • 8 GB RAM recommended
  • ...
```

### 11c. get-started.html

Update the download steps page with Windows-specific instructions:
- Download the `.exe` installer
- Run the installer (may need to click "More info" → "Run anyway" if unsigned)
- Follow the installation wizard
- Launch from Start Menu or Desktop shortcut

### 11d. pricing.html

No changes needed — pricing is platform-agnostic.

### 11e. docs.html

Add a Windows section to the installation docs:
- System requirements
- WebView2 requirement (auto-installed)
- Microphone permissions (Settings → Privacy → Microphone)
- Offline mode setup on Windows (Whisper model is bundled, Ollama install instructions for Windows)
- Known differences from macOS (if any)

---

## 12. Implementation Order

### Phase 1: PDF Replacement (Do First — Benefits Both Platforms)
1. Add `headless_chrome` crate to Cargo.toml
2. Create `src-tauri/src/pdf.rs` with `html_to_pdf()` function
3. Update `storage.rs` to call `pdf::html_to_pdf()` instead of shelling out to `html2pdf`
4. Register `mod pdf` in lib.rs
5. Remove `html2pdf-aarch64-apple-darwin` binary
6. **Test on macOS first** — verify PDF output matches current output
7. This change makes the macOS build simpler too (removes a sidecar dependency)

### Phase 2: Tauri Config + Icons
8. Add `"nsis"` to bundle targets in tauri.conf.json
9. Add `windows` block with `webviewInstallMode`
10. Add NSIS config
11. Generate `icon.ico` from existing app icon
12. Place in `src-tauri/icons/`

### Phase 3: Whisper Server Binary
13. On a Windows machine (or GitHub Actions Windows runner):
    - Clone whisper.cpp
    - Build with CMake (CPU-only for v1)
    - Copy `whisper-server.exe` to `src-tauri/binaries/whisper-server-x86_64-pc-windows-msvc.exe`
14. Verify the binary runs on Windows: `whisper-server.exe --help`

### Phase 4: Build & Test
15. On a Windows machine:
    ```powershell
    npm install
    npx tauri build
    ```
16. Test the NSIS installer on a clean Windows VM
17. Run through the full verification checklist (Section 14)

### Phase 5: Distribution
18. Upload Windows installer to R2 bucket
19. Update `download-release` Edge Function to serve Windows builds
20. Update website (index.html, get-started.html, docs.html)

### Phase 6: Code Signing (Can Be Done Later)
21. Purchase EV code signing certificate
22. Configure in tauri.conf.json
23. Rebuild and re-sign
24. Re-upload to R2

---

## 13. Files Summary

### New Files

| File | Purpose |
|------|---------|
| `src-tauri/src/pdf.rs` | Cross-platform HTML-to-PDF via headless_chrome |
| `src-tauri/binaries/whisper-server-x86_64-pc-windows-msvc.exe` | Windows whisper-server binary |
| `src-tauri/icons/icon.ico` | Windows application icon |

### Modified Files

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Add `headless_chrome = "1"` dependency |
| `src-tauri/tauri.conf.json` | Add `"nsis"` target, `windows` block, NSIS config |
| `src-tauri/src/lib.rs` | Add `mod pdf;` |
| `src-tauri/src/storage.rs` | Replace html2pdf sidecar call with `pdf::html_to_pdf()` |
| `ClinicalFlowWebsite/index.html` | Activate Windows download button, update requirements |
| `ClinicalFlowWebsite/get-started.html` | Add Windows installation instructions |
| `ClinicalFlowWebsite/docs.html` | Add Windows documentation section |

### Removed Files

| File | Reason |
|------|--------|
| `src-tauri/binaries/html2pdf-aarch64-apple-darwin` | Replaced by headless_chrome (cross-platform) |

---

## 14. Verification Checklist

### Build
- [ ] `npx tauri build` completes on Windows without errors
- [ ] NSIS installer is produced at `target/release/bundle/nsis/`
- [ ] Installer file size is reasonable (~600-700MB with model, or ~100MB without bundled model)

### Installation
- [ ] NSIS installer runs on clean Windows 10 VM
- [ ] NSIS installer runs on clean Windows 11 VM
- [ ] App appears in Start Menu after installation
- [ ] Desktop shortcut works (if enabled)
- [ ] Uninstaller works (Settings → Apps → ClinicalFlow → Uninstall)
- [ ] WebView2 auto-installs if missing (test on Windows 10 LTSC)

### Core Functionality
- [ ] App launches and shows PIN creation screen
- [ ] PIN creation works (Argon2 hashing, AES-256 encryption)
- [ ] Subscription gate appears after PIN setup
- [ ] Email/password signup works (Supabase auth)
- [ ] Google OAuth login works (deep link: `clinicalflow://auth-callback`)
- [ ] Plan selection works
- [ ] Trial starts correctly

### Audio & Transcription
- [ ] Microphone access prompt appears (if not already granted)
- [ ] Recording starts (cpal + WASAPI)
- [ ] Audio levels display correctly in the UI
- [ ] Offline transcription works (whisper-server.exe starts, processes chunks)
- [ ] Groq cloud transcription works (if key configured)
- [ ] Deepgram streaming works (if key configured)
- [ ] Speaker diarization works (Deepgram mode)
- [ ] Pause/resume recording works

### Note Generation
- [ ] AI note generation works (Claude API — online mode)
- [ ] AI note generation works (Ollama — offline mode, if Ollama installed on Windows)
- [ ] Template selection works (all 20 templates)
- [ ] Verification pass runs correctly
- [ ] Billing code generation works

### Export
- [ ] PDF export works (headless_chrome + Edge)
- [ ] PDF includes dental chart SVG (if applicable)
- [ ] PDF formatting matches macOS output
- [ ] Copy to clipboard works
- [ ] Session archiving works (save/load/delete)
- [ ] Transcript download works

### Dental
- [ ] Dental chart renders correctly (SVG in WebView2)
- [ ] Tooth selection, state changes, surface marking all work
- [ ] Perio charting works
- [ ] Chart exports to PDF correctly

### Security
- [ ] session.json is encrypted at rest
- [ ] config.json is encrypted with PIN-derived key
- [ ] Auto-lock engages after inactivity timeout
- [ ] PIN re-entry required after lock
- [ ] Settings show correct subscription info

### Deep Links
- [ ] `clinicalflow://auth-callback?refresh_token=...` opens the app and logs in
- [ ] Deep link works when app is already running
- [ ] Deep link works as cold start (app not running)
- [ ] Stale deep link when past PIN is ignored (gate visibility guard)

### Platform-Specific
- [ ] Windows Firewall doesn't block whisper-server on localhost
- [ ] No antivirus false positives (test with Windows Defender)
- [ ] SmartScreen behavior is documented (or resolved with code signing)
- [ ] Data directory is correct: `%APPDATA%\com.clinicalflow.ai\`
- [ ] File opening works: exported PDFs open in default PDF viewer
- [ ] Keyboard shortcuts work in WebView2 (Space, G, E, N, T, Cmd→Ctrl mapping)

### Regression (macOS Still Works)
- [ ] macOS build still produces valid DMG after PDF changes
- [ ] PDF export on macOS produces identical output to before (headless_chrome vs html2pdf)
- [ ] All macOS functionality unchanged

---

## Appendix A: Keyboard Shortcut Mapping

The app uses keyboard shortcuts (Space, G, E, N, T, etc.). Most are plain keys and work identically. The ones using `Cmd` on macOS need to use `Ctrl` on Windows:

| macOS | Windows | Action |
|-------|---------|--------|
| `Cmd+R` | `Ctrl+R` | Toggle recording |
| `Cmd+F` | `Ctrl+F` | Search transcript |
| `Cmd+,` | `Ctrl+,` | Open settings |

Check how the JS code detects modifier keys. If it uses `e.metaKey` (Mac) instead of `e.ctrlKey` (Windows), it needs a platform check:

```javascript
const modKey = navigator.platform.includes('Mac') ? e.metaKey : e.ctrlKey;
```

If the code already uses `e.metaKey || e.ctrlKey`, no change needed.

---

## Appendix B: GitHub Actions CI for Windows (Future)

For automated builds, add a GitHub Actions workflow:

```yaml
name: Build Windows
on:
  push:
    tags: ['v*']

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm install
      - run: npx tauri build
      - uses: actions/upload-artifact@v4
        with:
          name: windows-installer
          path: src-tauri/target/release/bundle/nsis/*.exe
```

This is not needed for v1 (manual builds are fine) but should be set up before v1.1.
