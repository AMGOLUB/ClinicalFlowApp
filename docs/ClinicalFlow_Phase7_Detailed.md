# ClinicalFlow — Phase 7: Build & Distribution

## Overview

Package ClinicalFlow into installable applications for macOS (.dmg) and Windows (.msi/.exe). This includes configuring the app bundle, handling sidecar binaries (whisper.cpp), bundling resources (models, corrections), code signing, notarization, and setting up auto-updates.

**Prerequisites:** Phases 1-6 complete. `npm run tauri dev` runs perfectly. All features work.

**Important:** This phase has some steps that cost money (Apple Developer account: $99/year) and steps that take time (notarization can take minutes to hours on first submission). Plan accordingly.

---

## 1. Pre-Build Configuration

### 1.1 Update tauri.conf.json

Make sure all the metadata is correct before building:

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "ClinicalFlow",
  "version": "1.0.0",
  "identifier": "com.clinicalflow.app",
  "build": {
    "beforeDevCommand": "",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "",
    "frontendDist": "../src"
  },
  "app": {
    "windows": [
      {
        "title": "ClinicalFlow",
        "width": 1400,
        "height": 900,
        "minWidth": 1024,
        "minHeight": 700,
        "center": true
      }
    ],
    "security": {
      "csp": "default-src 'self'; connect-src 'self' http://localhost:11434 https://api.anthropic.com wss://api.deepgram.com; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:"
    },
    "withGlobalTauri": true
  },
  "bundle": {
    "active": true,
    "targets": ["dmg", "nsis", "msi"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "category": "Medical",
    "shortDescription": "AI-powered clinical documentation assistant",
    "longDescription": "ClinicalFlow transcribes clinical encounters in real-time and generates structured SOAP, HPI, and problem-oriented notes using AI. Supports online (Deepgram + Claude) and offline (Whisper + Ollama) modes.",
    "copyright": "© 2026 ClinicalFlow",
    "externalBin": [
      "binaries/whisper-cli"
    ],
    "resources": [
      "resources/models/*",
      "resources/corrections.json"
    ],
    "macOS": {
      "minimumSystemVersion": "11.0",
      "signingIdentity": null,
      "hardenedRuntime": true,
      "entitlements": "Entitlements.plist"
    },
    "windows": {
      "certificateThumbprint": null,
      "digestAlgorithm": "sha256",
      "timestampUrl": "http://timestamp.digicert.com"
    }
  }
}
```

**Notes:**
- `minimumSystemVersion: "11.0"` — Required for `window.print()` support in PDF export
- `hardenedRuntime: true` — Required for notarization
- `withGlobalTauri: true` — Makes `window.__TAURI__` available without imports
- `targets` — Build DMG for macOS, NSIS + MSI for Windows

### 1.2 Create App Icons

You need icons in multiple sizes. Start with a 1024x1024 PNG of the ClinicalFlow logo, then generate all sizes:

```bash
# Install the Tauri icon generator
npm install -g @tauri-apps/cli

# Generate all icon sizes from a single 1024x1024 PNG
npx tauri icon src-tauri/icons/app-icon.png
```

This creates all required files in `src-tauri/icons/`:
- `icon.icns` (macOS)
- `icon.ico` (Windows)
- `32x32.png`, `128x128.png`, `128x128@2x.png`

### 1.3 Create Entitlements.plist

Create `src-tauri/Entitlements.plist` — this tells macOS what permissions ClinicalFlow needs:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- Required for Tauri's WebView to function -->
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>

    <!-- Microphone access for recording -->
    <key>com.apple.security.device.audio-input</key>
    <true/>

    <!-- Network access for Deepgram, Claude API -->
    <key>com.apple.security.network.client</key>
    <true/>

    <!-- File access for session storage -->
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
</dict>
</plist>
```

### 1.4 macOS Info.plist Additions

Create or update `src-tauri/Info.plist` for microphone permission prompt:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSMicrophoneUsageDescription</key>
    <string>ClinicalFlow needs microphone access to record and transcribe clinical encounters.</string>
</dict>
</plist>
```

---

## 2. Sidecar Binaries (whisper.cpp)

### 2.1 Naming Convention

Tauri v2 requires sidecar binaries to follow a strict naming convention based on the target platform triple. The name in `tauri.conf.json` (`binaries/whisper-cli`) gets the platform suffix appended automatically.

You must provide binaries with these exact names in `src-tauri/binaries/`:

| Platform | Filename |
|----------|----------|
| macOS Apple Silicon | `whisper-cli-aarch64-apple-darwin` |
| macOS Intel | `whisper-cli-x86_64-apple-darwin` |
| Windows x64 | `whisper-cli-x86_64-pc-windows-msvc.exe` |

### 2.2 Build whisper.cpp for Your Platform

**macOS Apple Silicon (most common for development):**
```bash
# Clone whisper.cpp
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp

# Build
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release

# The binary is at build/bin/whisper-cli
# Copy it with the correct name
cp build/bin/whisper-cli /path/to/clinicalflow/src-tauri/binaries/whisper-cli-aarch64-apple-darwin
```

**macOS Intel:**
```bash
# Same steps but on an Intel Mac, or cross-compile:
cmake -B build -DCMAKE_BUILD_TYPE=Release -DCMAKE_OSX_ARCHITECTURES=x86_64
cmake --build build --config Release
cp build/bin/whisper-cli /path/to/clinicalflow/src-tauri/binaries/whisper-cli-x86_64-apple-darwin
```

**Windows x64:**
```bash
# On Windows with Visual Studio Build Tools installed:
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release
copy build\bin\Release\whisper-cli.exe \path\to\clinicalflow\src-tauri\binaries\whisper-cli-x86_64-pc-windows-msvc.exe
```

### 2.3 Sign the Sidecar Binary (macOS)

Apple requires ALL binaries in a notarized app to be signed, including sidecars. If you skip this, notarization will fail.

```bash
# Sign the whisper-cli binary with your Developer ID certificate
codesign --force --options runtime --sign "Developer ID Application: Your Name (TEAM_ID)" \
  src-tauri/binaries/whisper-cli-aarch64-apple-darwin
```

**This is a common gotcha.** The main Tauri app gets signed automatically, but sidecar binaries must be signed manually before building.

### 2.4 Verify Sidecar Works

Before building, test that the sidecar runs:
```bash
# On macOS:
./src-tauri/binaries/whisper-cli-aarch64-apple-darwin --help
# Should print whisper.cpp help text
```

---

## 3. Bundle Resources

### 3.1 Whisper Models

Place model files in `src-tauri/resources/models/`:
```
src-tauri/resources/
├── models/
│   ├── ggml-large-v3-turbo.bin    (1.5GB — primary model)
│   └── ggml-small.en.bin          (466MB — fallback/low-RAM option)
└── corrections.json
```

**Warning:** The large-v3-turbo model is 1.5GB. This makes your app bundle ~1.6GB+. Consider:
- Only bundling `small.en` (466MB) and offering large-v3-turbo as a separate download
- Or downloading the model on first launch instead of bundling it

### 3.2 First-Run Model Download (Alternative to Bundling)

Instead of bundling the 1.5GB model, download it on first launch. Add to `storage.rs`:

```rust
#[tauri::command]
async fn download_whisper_model(
    app: AppHandle,
    model_name: String,
) -> Result<String, String> {
    let models_dir = app_data_dir(&app)?.join("models");
    std::fs::create_dir_all(&models_dir).map_err(|e| e.to_string())?;

    let model_path = models_dir.join(&model_name);
    if model_path.exists() {
        return Ok(model_path.to_string_lossy().to_string());
    }

    let url = format!(
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{}",
        model_name
    );

    tracing::info!("Downloading Whisper model: {}", url);

    let client = reqwest::Client::new();
    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;

    std::fs::write(&model_path, &bytes).map_err(|e| e.to_string())?;
    tracing::info!("Model downloaded: {} ({} bytes)", model_name, bytes.len());

    Ok(model_path.to_string_lossy().to_string())
}
```

**Frontend: Show download progress on first launch:**
```javascript
async function ensureWhisperModel() {
  if (!window.__TAURI__) return;
  try {
    const modelPath = await tauriInvoke('download_whisper_model', {
      modelName: 'ggml-large-v3-turbo.bin'
    });
    console.log('[ClinicalFlow] Whisper model ready:', modelPath);
  } catch (e) {
    toast('Failed to download Whisper model. Offline transcription unavailable.', 'warning', 8000);
  }
}
```

### 3.3 Corrections Dictionary

The `corrections.json` file should be in `src-tauri/resources/corrections.json`. It gets copied to the app data directory on first launch (handled by Phase 3's `init_storage`).

---

## 4. Build the App

### 4.1 Local Build (No Signing)

For testing, build without code signing:

```bash
# Make sure dependencies are installed
npm install

# Build the app
npm run tauri build
```

**Output locations:**
- **macOS:** `src-tauri/target/release/bundle/dmg/ClinicalFlow_1.0.0_aarch64.dmg`
- **Windows:** `src-tauri/target/release/bundle/nsis/ClinicalFlow_1.0.0_x64-setup.exe`
- **Windows:** `src-tauri/target/release/bundle/msi/ClinicalFlow_1.0.0_x64_en-US.msi`

### 4.2 Test the Unsigned Build

Before investing in signing, verify the built app works:

```bash
# macOS: Mount the DMG and run the app
open src-tauri/target/release/bundle/dmg/ClinicalFlow_*.dmg
# Drag to Applications, right-click > Open (to bypass Gatekeeper for unsigned)
```

Test everything:
- [ ] App launches
- [ ] Recording works (microphone permission prompt appears)
- [ ] Whisper offline transcription works (sidecar runs)
- [ ] Deepgram online transcription works
- [ ] Cloud AI note generation works
- [ ] Ollama note generation works
- [ ] PDF export works
- [ ] Settings persist across restart

---

## 5. macOS Code Signing & Notarization

### 5.1 Prerequisites

1. **Apple Developer Program account** ($99/year) — sign up at [developer.apple.com](https://developer.apple.com)
2. **Developer ID Application certificate** — for distributing outside the App Store
3. **Xcode Command Line Tools** — `xcode-select --install`

### 5.2 Create Signing Certificate

1. Open **Keychain Access** on your Mac
2. Go to **Keychain Access > Certificate Assistant > Request a Certificate from a Certificate Authority**
3. Enter your email, select "Saved to disk", click Continue
4. Go to [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates)
5. Click **+** to create a new certificate
6. Select **Developer ID Application**
7. Upload the CSR file you saved
8. Download and double-click the `.cer` to install in your keychain

### 5.3 Find Your Signing Identity

```bash
security find-identity -v -p codesigning
```

Look for a line like:
```
"Developer ID Application: Your Name (ABCDE12345)"
```

The string in quotes is your `APPLE_SIGNING_IDENTITY`. The part in parentheses (`ABCDE12345`) is your Team ID.

### 5.4 Set Up Notarization Credentials

**Option A: Apple ID (simpler for solo developers)**

1. Go to [appleid.apple.com](https://appleid.apple.com) > Sign-In and Security > App-Specific Passwords
2. Generate a new app-specific password (name it "ClinicalFlow Notarization")
3. Find your Team ID at [developer.apple.com/account](https://developer.apple.com/account) under Membership Details

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (ABCDE12345)"
export APPLE_ID="your@email.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"  # App-specific password
export APPLE_TEAM_ID="ABCDE12345"
```

**Option B: App Store Connect API (better for CI/CD)**

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com) > Users and Access > Integrations > Keys
2. Create a new key with "Developer" access
3. Download the `.p8` private key file (can only download once!)

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (ABCDE12345)"
export APPLE_API_ISSUER="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export APPLE_API_KEY="XXXXXXXXXX"
export APPLE_API_KEY_PATH="/path/to/AuthKey_XXXXXXXXXX.p8"
```

### 5.5 Sign the Sidecar Binary First

**Critical:** Do this BEFORE running `npm run tauri build`:

```bash
codesign --force --options runtime --sign "Developer ID Application: Your Name (ABCDE12345)" \
  src-tauri/binaries/whisper-cli-aarch64-apple-darwin
```

### 5.6 Build with Signing and Notarization

With the environment variables set:

```bash
npm run tauri build
```

Tauri will automatically:
1. Compile the Rust backend
2. Bundle the frontend
3. Include sidecar binaries and resources
4. Sign the app with your certificate
5. Submit to Apple for notarization
6. Wait for Apple's response
7. Staple the notarization ticket to the .dmg

**First notarization can take 5-30 minutes.** Subsequent builds are usually faster.

### 5.7 Verify Signing

```bash
# Check the .app is signed
codesign -dv --verbose=4 "src-tauri/target/release/bundle/macos/ClinicalFlow.app"

# Check notarization
spctl -a -vvv "src-tauri/target/release/bundle/macos/ClinicalFlow.app"
# Should say: "source=Notarized Developer ID"

# Check the DMG
spctl -a -vvv --type install "src-tauri/target/release/bundle/dmg/ClinicalFlow_1.0.0_aarch64.dmg"
```

---

## 6. Windows Code Signing (Optional but Recommended)

Without signing, Windows SmartScreen will warn users. With signing, the warning goes away.

### 6.1 Get a Code Signing Certificate

Options:
- **EV Code Signing Certificate** ($200-400/year) — Instant SmartScreen trust. Providers: DigiCert, Sectigo, GlobalSign.
- **Standard Code Signing Certificate** ($70-200/year) — Builds trust over time. Same providers.

### 6.2 Configure in tauri.conf.json

```json
"windows": {
  "certificateThumbprint": "YOUR_CERT_THUMBPRINT",
  "digestAlgorithm": "sha256",
  "timestampUrl": "http://timestamp.digicert.com"
}
```

### 6.3 Build

```bash
# On a Windows machine or CI runner:
npm run tauri build
```

---

## 7. Auto-Updater (Optional — Set Up Later)

Tauri has a built-in updater. You need a server that hosts update metadata.

### 7.1 Generate Update Key Pair

```bash
npx tauri signer generate -w ~/.tauri/clinicalflow.key
```

This creates a private key (keep secret) and prints a public key.

### 7.2 Configure in tauri.conf.json

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "https://releases.clinicalflow.ai/{{target}}/{{arch}}/{{current_version}}"
      ],
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ..."
    }
  }
}
```

### 7.3 Host Update Endpoint

The update endpoint returns JSON like:
```json
{
  "version": "1.1.0",
  "url": "https://releases.clinicalflow.ai/downloads/ClinicalFlow_1.1.0_aarch64.dmg",
  "signature": "...",
  "notes": "Bug fixes and performance improvements"
}
```

Options for hosting:
- **GitHub Releases** — Free, works with Tauri's GitHub updater
- **Simple static JSON** — Host on any web server, S3, Cloudflare Pages
- **CrabNebula** — Tauri-focused distribution platform

### 7.4 Frontend: Check for Updates

```javascript
if (window.__TAURI__) {
  try {
    const { check } = window.__TAURI__.updater;
    const update = await check();
    if (update?.available) {
      toast(`Update available: v${update.version}. Restart to install.`, 'info', 10000);
    }
  } catch (e) {
    // Update check failed — not critical
  }
}
```

**Skip auto-updater for v1.0.** Get it working manually first. Add auto-update for v1.1+.

---

## 8. Distribution Strategy

### 8.1 Initial Distribution (v1.0)

For your first release, keep it simple:

1. Build a signed .dmg for macOS
2. Build a signed .msi or NSIS installer for Windows
3. Host the files on:
   - Your website (clinicalflow.ai or similar)
   - GitHub Releases (free, handles hosting)
   - Google Drive / Dropbox (quick and dirty for early testers)

### 8.2 What to Include in the Download

The installer contains everything:
- ClinicalFlow app binary
- whisper-cli sidecar binary
- corrections.json

The installer does NOT contain (user downloads separately or on first launch):
- Whisper models (too large — 466MB to 1.5GB)
- Ollama (separate install, separate download)

### 8.3 First-Launch Setup Guide

On first launch, show a setup wizard or guide:

```
Welcome to ClinicalFlow!

Step 1: Choose your transcription mode
  [Online] — Best accuracy, requires internet + API key
  [Offline] — Works anywhere, downloads AI model (~1.5GB)

Step 2: Choose your note generation mode
  [Cloud AI] — Best quality, requires internet + API key
  [Local AI] — Install Ollama (free), runs on your machine

Step 3: Microphone check
  [Test Microphone] — Verify audio capture works
```

This is optional for v1.0 — a simple toast guiding the user to Settings is fine for early adopters.

---

## 9. Build Troubleshooting

### Problem: "App is damaged and can't be opened"
**Cause:** App is not signed or not notarized.
**Fix:** Follow section 5 (code signing). If testing locally, right-click > Open to bypass Gatekeeper.

### Problem: Notarization fails with sidecar
**Cause:** The whisper-cli binary is not signed.
**Fix:** Sign it manually BEFORE building (section 5.5).

### Problem: Sidecar not found at runtime
**Cause:** Binary name doesn't match the platform triple.
**Fix:** Verify exact filename matches section 2.1. Run `rustc -vV | grep host` to see your platform triple.

### Problem: Build is 2GB+
**Cause:** Whisper model files are bundled in resources.
**Fix:** Don't bundle models. Download on first launch instead (section 3.2).

### Problem: Microphone permission not requested on macOS
**Cause:** Missing `NSMicrophoneUsageDescription` in Info.plist.
**Fix:** Add the Info.plist from section 1.4.

### Problem: Window.print() doesn't work in built app
**Cause:** `minimumSystemVersion` is below 11.0.
**Fix:** Set `"minimumSystemVersion": "11.0"` in tauri.conf.json.

### Problem: CSP blocks API calls in production build
**Cause:** CSP is stricter in production than dev.
**Fix:** Verify CSP in tauri.conf.json includes all required domains (section 1.1).

---

## 10. Testing the Built App

### Smoke Test (run after EVERY build)
- [ ] Double-click the .dmg / run the .exe installer
- [ ] App installs and launches
- [ ] No Gatekeeper / SmartScreen warnings (if signed)
- [ ] Microphone permission prompt appears on first recording
- [ ] Record 30 seconds of speech
- [ ] Transcription appears (online or offline)
- [ ] Generate a note
- [ ] Export PDF
- [ ] Close app, reopen — settings and last session persist
- [ ] Check the log file exists in app data directory

### Distribution Test
- [ ] Send the .dmg to someone else's Mac (not your development machine)
- [ ] They can install and run it without any "damaged" warnings
- [ ] Microphone works on their machine
- [ ] Everything functions on a clean machine that has never run the dev version

---

## 11. Files Modified / Created Summary

| File | Action |
|------|--------|
| `src-tauri/tauri.conf.json` | Updated bundle config, icons, metadata, macOS/Windows signing config |
| `src-tauri/Entitlements.plist` | **New** — macOS entitlements for JIT, microphone, network |
| `src-tauri/Info.plist` | **New** — Microphone usage description |
| `src-tauri/icons/` | App icons in all required sizes |
| `src-tauri/binaries/whisper-cli-*` | Sidecar binaries for each platform |
| `src-tauri/resources/models/` | Whisper model files (or download on first launch) |
| `src-tauri/resources/corrections.json` | Medical term corrections dictionary |

---

## 12. Version Checklist

Before tagging v1.0.0:

- [ ] Version number set to `1.0.0` in `tauri.conf.json` and `Cargo.toml`
- [ ] App name is "ClinicalFlow" everywhere (no "MedScribe" remnants)
- [ ] App identifier is `com.clinicalflow.app`
- [ ] Icons are final (not placeholder)
- [ ] All test scripts pass (Phases 1-6 checklists)
- [ ] Unsigned build tested and works
- [ ] Signed build tested and works
- [ ] Someone other than you has tested it on a clean machine
- [ ] README or setup guide exists for new users
