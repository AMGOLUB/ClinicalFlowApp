# ClinicalFlow — Complete Infrastructure Documentation

> **Updated:** 2026-03-02 (full system audit)
> **Version:** 1.0.0
> **Identifier:** `com.clinicalflow.ai`
> **Domain:** `https://clinicalflow.us`
> **Supabase Project:** `seuinmmslazvibotoupm` (West US / Oregon)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Repository Structure](#2-repository-structure)
3. [Desktop Application (Tauri v2)](#3-desktop-application-tauri-v2)
   - 3.1 [Rust Backend Modules](#31-rust-backend-modules)
   - 3.2 [Frontend Modules (Vanilla JS)](#32-frontend-modules-vanilla-js)
   - 3.3 [Sidecar Binaries](#33-sidecar-binaries)
   - 3.4 [Bundled Resources](#34-bundled-resources)
   - 3.5 [Tauri Configuration](#35-tauri-configuration)
   - 3.6 [macOS Entitlements](#36-macos-entitlements)
   - 3.7 [Capabilities (Permissions)](#37-capabilities-permissions)
4. [Marketing Website](#4-marketing-website)
   - 4.1 [Page Inventory](#41-page-inventory)
   - 4.2 [Shared Assets](#42-shared-assets)
   - 4.3 [SEO Files](#43-seo-files)
   - 4.4 [Screenshots & Media](#44-screenshots--media)
5. [Supabase Backend](#5-supabase-backend)
   - 5.1 [Project Configuration](#51-project-configuration)
   - 5.2 [Database Schema](#52-database-schema)
   - 5.3 [Row-Level Security (RLS)](#53-row-level-security-rls)
   - 5.4 [Database Triggers](#54-database-triggers)
   - 5.5 [Edge Functions](#55-edge-functions)
   - 5.6 [Shared Utilities](#56-shared-utilities)
6. [Authentication & OAuth](#6-authentication--oauth)
   - 6.1 [Email/Password Flow](#61-emailpassword-flow)
   - 6.2 [Google OAuth (PKCE)](#62-google-oauth-pkce)
   - 6.3 [Password Reset Flow](#63-password-reset-flow)
   - 6.4 [Deep Link Login (clinicalflow://)](#64-deep-link-login)
   - 6.5 [Supabase Auth Configuration](#65-supabase-auth-configuration)
   - 6.6 [Redirect URLs](#66-redirect-urls)
   - 6.7 [Desktop Login Gate](#67-desktop-login-gate)
7. [Stripe Billing Integration](#7-stripe-billing-integration)
   - 7.1 [Pricing Tiers](#71-pricing-tiers)
   - 7.2 [Checkout Flow](#72-checkout-flow)
   - 7.3 [Webhook Events](#73-webhook-events)
   - 7.4 [Customer Portal](#74-customer-portal)
8. [License & Subscription System](#8-license--subscription-system)
   - 8.1 [License Verification Flow](#81-license-verification-flow)
   - 8.2 [License Encryption (AES-256-GCM)](#82-license-encryption-aes-256-gcm)
   - 8.3 [Device Seat Tracking](#83-device-seat-tracking)
   - 8.4 [Subscription Lifecycle](#84-subscription-lifecycle)
9. [Download & Release Distribution](#9-download--release-distribution)
   - 9.1 [Cloudflare R2 Storage](#91-cloudflare-r2-storage)
   - 9.2 [Presigned URL Generation](#92-presigned-url-generation)
   - 9.3 [Gated Download Flow](#93-gated-download-flow)
10. [Security Architecture](#10-security-architecture)
    - 10.1 [Encryption Model](#101-encryption-model)
    - 10.2 [PIN Authentication](#102-pin-authentication)
    - 10.3 [Content Security Policy](#103-content-security-policy)
    - 10.4 [Data Classification](#104-data-classification)
11. [Audio & Transcription Pipeline](#11-audio--transcription-pipeline)
    - 11.1 [Recording Pipeline](#111-recording-pipeline)
    - 11.2 [Transcription Engines](#112-transcription-engines)
    - 11.3 [Post-Processing](#113-post-processing)
12. [AI Note Generation](#12-ai-note-generation)
    - 12.1 [Three-Tier Fallback](#121-three-tier-fallback)
    - 12.2 [Note Templates](#122-note-templates)
    - 12.3 [Medical & Dental Coding](#123-medical--dental-coding)
13. [Dental Charting System](#13-dental-charting-system)
14. [PMS Integration (Open Dental)](#14-pms-integration-open-dental)
15. [Environment Variables](#15-environment-variables)
16. [DNS, Domain & Hosting](#16-dns-domain--hosting)
17. [Build & Development](#17-build--development)
18. [CI/CD & Automation](#18-cicd--automation)
19. [Developer Onboarding & Local Environment](#19-developer-onboarding--local-environment)
20. [App Updates Strategy](#20-app-updates-strategy)
21. [Monitoring, Alerting & Observability](#21-monitoring-alerting--observability)
22. [Disaster Recovery & Backups](#22-disaster-recovery--backups)
23. [Testing](#23-testing)
24. [File Manifest](#24-file-manifest)

---

## 1. Architecture Overview

ClinicalFlow is a multi-component clinical documentation platform:

```
┌─────────────────────────────────────────────────────────────┐
│                    USER'S MACHINE                           │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │          TAURI v2 DESKTOP APP (.dmg)                  │  │
│  │                                                       │  │
│  │  ┌──────────────┐   ┌────────────────────────────┐   │  │
│  │  │  Rust Backend │   │   Vanilla JS Frontend      │   │  │
│  │  │  (lib.rs)     │   │   (index.html + 20 modules)│   │  │
│  │  │              │◄──►│                            │   │  │
│  │  │  audio.rs    │IPC │  app.js      notes.js     │   │  │
│  │  │  auth.rs     │    │  audio.js    dental-chart  │   │  │
│  │  │  crypto.rs   │    │  auth.js     settings.js   │   │  │
│  │  │  license.rs  │    │  recording   transcript    │   │  │
│  │  │  storage.rs  │    │  session.js  subscription  │   │  │
│  │  │  pms.rs      │    │  pms-bridge  speakers      │   │  │
│  │  │  logging.rs  │    │  perio-voice-parser        │   │  │
│  │  └──────┬───────┘   └──────────┬─────────────────┘   │  │
│  │         │                       │                     │  │
│  │  ┌──────┴───────┐   ┌──────────┴─────────────────┐   │  │
│  │  │  SIDECARS    │   │  EXTERNAL APIs              │   │  │
│  │  │  whisper-srv │   │  Deepgram (wss://)         │   │  │
│  │  │  html2pdf    │   │  Anthropic Claude API      │   │  │
│  │  └──────────────┘   │  Ollama (localhost:11434)  │   │  │
│  │                      │  Supabase (https://)       │   │  │
│  │                      └────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  LOCAL FILES                                        │   │
│  │  ~/Library/App Support/                             │   │
│  │    com.clinicalflow.ai/                             │   │
│  │    ├─ auth.json (PIN hash)                          │   │
│  │    ├─ config.json (enc)                             │   │
│  │    ├─ session.json (enc)                            │   │
│  │    ├─ sessions/archive/                             │   │
│  │    ├─ exports/                                      │   │
│  │    └─ logs/                                         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    CLOUD SERVICES                           │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              SUPABASE (PostgreSQL 17)                │   │
│  │                                                     │   │
│  │  Auth ─── JWT tokens, email verify, Google OAuth    │   │
│  │  DB ───── profiles, device_activations, sub_events  │   │
│  │                                                     │   │
│  │  Edge Functions (Deno v2):                          │   │
│  │    ├─ signup-page      (branded HTML signup)        │   │
│  │    ├─ create-checkout  (Stripe session)             │   │
│  │    ├─ customer-portal  (Stripe billing)             │   │
│  │    ├─ stripe-webhook   (subscription lifecycle)     │   │
│  │    ├─ verify-license   (encrypted license blobs)    │   │
│  │    └─ download-release (presigned R2 URLs)          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │   STRIPE     │  │ CLOUDFLARE   │  │  DEEPGRAM       │  │
│  │  Payments    │  │  R2 Storage  │  │  Nova-3 Medical │  │
│  │  Checkout    │  │  .dmg host   │  │  Speech-to-Text │  │
│  │  Portal      │  │  Presigned   │  └─────────────────┘  │
│  │  Webhooks    │  │  URLs        │                        │
│  └──────────────┘  └──────────────┘  ┌─────────────────┐  │
│                                       │  ANTHROPIC      │  │
│                                       │  Claude Haiku   │  │
│                                       │  Note Gen       │  │
│                                       └─────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            MARKETING WEBSITE                        │   │
│  │            clinicalflow.us                          │   │
│  │  11 HTML pages + CSS + JS + screenshots             │   │
│  │  Supabase JS SDK for auth pages                     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Repository Structure

```
ClinicalFlowApp/
├── CLAUDE.md                           # Project rules & security boundaries
├── package.json                        # Node.js config (Tauri CLI + Vitest)
├── vitest.config.js                    # Test runner config
├── .gitignore                          # Excludes: binaries, models, env, target/
│
├── src/                                # Desktop app frontend (vanilla JS)
│   ├── index.html                      # Main UI shell (~500 lines)
│   ├── app.js                          # Entry point & coordinator (634 lines)
│   ├── state.js                        # Global app state & config backend
│   ├── ui.js                           # DOM manipulation, modals, theme
│   ├── auth.js                         # PIN authentication & auto-lock
│   ├── audio.js                        # Audio playback & recording controls
│   ├── recording.js                    # Recording state machine
│   ├── transcript.js                   # Transcript entry rendering
│   ├── speakers.js                     # Speaker management (doctor/patient/other)
│   ├── notes.js                        # SOAP/HPI note generation (67KB)
│   ├── settings.js                     # Configuration UI
│   ├── session.js                      # Session save/restore/archive
│   ├── subscription.js                 # License/subscription gate overlay
│   ├── dental-chart.js                 # Interactive dental chart (49KB)
│   ├── dental-extras.js                # Dental utilities (insurance narratives)
│   ├── pms-bridge.js                   # Open Dental PMS integration
│   ├── perio-voice-parser.js           # Periodontal measurement voice parsing
│   ├── medical-dictionary.js           # Clinical terminology (23KB)
│   ├── languages.js                    # i18n language list (37 languages)
│   ├── templates.js                    # SOAP/medical note templates
│   ├── pure.js                         # Pure utility functions
│   ├── styles.css                      # Design system (5,889 lines)
│   ├── env.js                          # Supabase credentials (GITIGNORED)
│   ├── corrections.json                # English medical corrections (23KB)
│   ├── corrections-de.json             # German corrections
│   ├── corrections-es.json             # Spanish corrections
│   ├── corrections-fr.json             # French corrections
│   ├── corrections-it.json             # Italian corrections
│   └── corrections-pt.json             # Portuguese corrections
│
├── src-tauri/                          # Desktop app Rust backend
│   ├── Cargo.toml                      # Rust dependencies
│   ├── tauri.conf.json                 # Tauri v2 configuration
│   ├── build.rs                        # Tauri build script
│   ├── Entitlements.plist              # macOS hardened runtime permissions
│   ├── Info.plist                      # macOS microphone usage string
│   ├── src/
│   │   ├── main.rs                     # Entry point (110 bytes)
│   │   ├── lib.rs                      # Module registry & Tauri setup (4KB)
│   │   ├── audio.rs                    # Audio capture & whisper integration (39KB)
│   │   ├── auth.rs                     # PIN hashing (Argon2) & auth state (6.5KB)
│   │   ├── crypto.rs                   # AES-256-GCM encryption (2.8KB)
│   │   ├── license.rs                  # License blob decrypt & seat tracking (10KB)
│   │   ├── storage.rs                  # File I/O, config/session persistence (26KB)
│   │   ├── pms.rs                      # Open Dental MySQL sync (17KB)
│   │   └── logging.rs                  # Structured logging (1.4KB)
│   ├── binaries/                       # Sidecar executables (GITIGNORED)
│   │   ├── whisper-cli-aarch64-apple-darwin      (3 MB, not actively used)
│   │   ├── whisper-server-aarch64-apple-darwin   (3.3 MB, Metal GPU-accelerated)
│   │   └── html2pdf-aarch64-apple-darwin         (62 KB)
│   ├── resources/
│   │   ├── models/                     # Whisper ML models (GITIGNORED)
│   │   │   └── ggml-large-v3-turbo-q5_0.bin  (574 MB, multilingual, quantized)
│   │   ├── corrections.json            # Bundled English corrections
│   │   ├── corrections-{de,es,fr,it,pt}.json
│   │   └── fonts/                      # Custom fonts
│   ├── icons/                          # App icons (all sizes)
│   │   ├── 32x32.png
│   │   ├── 128x128.png
│   │   ├── 128x128@2x.png
│   │   ├── icon.icns                   # macOS icon
│   │   └── icon.ico                    # Windows icon
│   └── capabilities/
│       └── default.json                # Tauri v2 capability permissions
│
├── ClinicalFlowWebsite/               # Marketing & auth website
│   ├── index.html                      # Landing page (74KB)
│   ├── pricing.html                    # Pricing tiers (46KB)
│   ├── signup.html                     # Registration flow (54KB)
│   ├── login.html                      # Login page (14KB)
│   ├── account.html                    # User dashboard (22KB)
│   ├── get-started.html                # Download & onboarding (39KB)
│   ├── docs.html                       # Documentation (112KB)
│   ├── about.html                      # Company info (30KB)
│   ├── privacy-policy.html             # Privacy policy (42KB)
│   ├── terms-of-service.html           # Terms of service (45KB)
│   ├── reset-password.html             # Password reset (20KB)
│   ├── styles.css                      # Website styles (34KB)
│   ├── main.js                         # Shared JS (scroll, nav, platform detect)
│   ├── docs.css                        # Docs-specific styles (8.4KB)
│   ├── robots.txt                      # SEO crawl rules
│   ├── sitemap.xml                     # XML sitemap (12 URLs)
│   └── *.png                           # Screenshots (6-7 MB each)
│
├── supabase/                           # Cloud backend
│   ├── config.toml                     # Local dev config
│   ├── .env.example                    # Environment variable template
│   ├── migrations/
│   │   ├── 001_profiles.sql            # User profiles + triggers
│   │   ├── 002_device_activations.sql  # Device seat tracking
│   │   ├── 003_subscription_events.sql # Stripe webhook audit log
│   │   ├── 004_selected_plan.sql       # Plan selection column + RLS
│   │   ├── 005_oauth_email_verified.sql # Fix Google OAuth pending_verification
│   │   ├── 006_skip_email_verification.sql # Skip email verify, start users in trial
│   │   ├── 007_fix_remaining_pending.sql   # Bulk-upgrade remaining pending users
│   │   ├── 008_fix_pending_with_trigger.sql # Same, with trigger disable workaround
│   │   └── 009_free_demo_plan.sql      # Add free_demo to selected_plan CHECK
│   └── functions/
│       ├── _shared/
│       │   ├── supabase-admin.ts       # CORS, token extraction, JSON helpers
│       │   └── license-crypto.ts       # AES-256-GCM license encryption
│       ├── create-checkout/index.ts    # Stripe checkout session
│       ├── customer-portal/index.ts    # Stripe billing portal
│       ├── delete-account/index.ts     # Cancel Stripe + delete profile + auth user
│       ├── download-release/index.ts   # Presigned R2 .dmg URL
│       ├── signup-page/index.ts        # Branded HTML signup (for Tauri)
│       ├── stripe-webhook/index.ts     # Stripe event handler
│       └── verify-license/index.ts     # License validation + encryption
│
├── chrome-extension/                   # EHR paste extension (NOT distributed — internal only)
│   ├── manifest.json                   # Chrome Manifest v3
│   ├── popup.html                      # Extension popup UI
│   ├── popup.js                        # Popup logic (clipboard paste)
│   ├── popup.css                       # Popup styling
│   ├── content.js                      # Content script (EHR injection)
│   └── icons/                          # Extension icons (16, 48, 128px)
│
├── tests/                              # Test suite
│   ├── dental-chart.test.js            # Dental chart rendering (13KB)
│   ├── pure.test.js                    # Pure function tests (13KB)
│   ├── subscription.test.js            # Subscription logic (10KB)
│   └── templates.test.js              # Template rendering (4KB)
│
├── docs/                               # Project documentation
│   ├── INFRASTRUCTURE.md               # THIS FILE
│   ├── WEBSITE_COMPLETION_SPEC.md      # Website completion checklist
│   ├── supabase-email-templates.md     # Branded email templates
│   ├── ClinicalFlow_Full_Audit.md      # Complete codebase audit
│   ├── ClinicalFlow_Phase11_AppOnly.md # Subscription system spec
│   ├── ClinicalFlow_CloudAI_Integration.md  # Claude API integration
│   ├── ClinicalFlow_Phase3-9_Detailed.md    # Phase breakdowns
│   ├── clinicalflow-medical-dictionary.md   # Medical terminology
│   ├── clinicalflow-dental-dictionary.md    # Dental terminology
│   └── dentalIdeas.md                  # Dental feature ideas
│
└── .claude/                            # Claude Code settings
    └── settings.local.json             # Allowed tool permissions
```

---

## 3. Desktop Application (Tauri v2)

### 3.1 Rust Backend Modules

| Module | File | Lines | Purpose |
|--------|------|-------|---------|
| **audio** | `audio.rs` | ~1,023 | cpal audio capture, 16kHz resampling, whisper-server HTTP API (persistent server, health checks), adaptive chunk management (2s default + 0.3s overlap, auto-scales 2–3s), silence detection, hallucination filtering, WAV writing, Metal GPU acceleration |
| **auth** | `auth.rs` | ~217 | PIN creation/verification via Argon2id, `AppState` (authenticated flag, last_activity), auto-lock, PIN reset |
| **crypto** | `crypto.rs` | ~84 | AES-256-GCM encrypt/decrypt, PBKDF2-HMAC-SHA256 key derivation (100k iterations), atomic file writes |
| **license** | `license.rs` | ~245 | Session data encryption (compiled-in SESSION_KEY), license blob decryption (compiled-in LICENSE_KEY), device hash computation (SHA256 of hostname:username) |
| **storage** | `storage.rs` | ~500+ | File I/O for auth.json, config.json (encrypted), session.json (encrypted), session archives, PDF export via html2pdf sidecar, corrections loading, log cleanup |
| **pms** | `pms.rs` | ~448 | MySQL async connection to Open Dental, perio sync (perioexam + periomeasure), procedure sync (procedurelog), note sync (commlog) |
| **logging** | `logging.rs` | ~43 | Daily rolling file logs + stdout, tracing subscriber setup, debug/info filter levels |

**Key Rust Dependencies** (`Cargo.toml`):

| Crate | Version | Purpose |
|-------|---------|---------|
| `tauri` | 2 | Desktop framework |
| `tauri-plugin-shell` | 2 | Sidecar execution |
| `tauri-plugin-fs` | 2 | File system access |
| `tauri-plugin-dialog` | 2 | Save/open dialogs |
| `tauri-plugin-http` | 2 | HTTP requests |
| `tauri-plugin-notification` | 2 | System notifications |
| `cpal` | 0.15 | Audio input/output |
| `hound` | 3.5 | WAV file reading/writing |
| `tokio` | 1 (full) | Async runtime |
| `aes-gcm` | 0.10 | AES-256-GCM encryption |
| `argon2` | 0.5 | PIN hashing |
| `pbkdf2` | 0.12 | Key derivation |
| `sha2` | 0.10 | SHA-256 hashing |
| `rand` | 0.8 | Secure random generation |
| `reqwest` | 0.12 | HTTP client (multipart) |
| `mysql_async` | 0.34 | Open Dental database |
| `serde` / `serde_json` | 1 | Serialization |
| `chrono` | 0.4 | Date/time |
| `dirs` | 6 | OS directory paths |
| `base64` | 0.22 | Base64 encoding |
| `tracing` | 0.1 | Structured logging |
| `sysinfo` | 0.31 | System memory checks |
| `hostname` / `whoami` | 0.4 / 1 | Device identification |
| `hex` | 0.4 | Hex encoding |

### 3.2 Frontend Modules (Vanilla JS)

The frontend runs inside Tauri's WKWebView (macOS) with `withGlobalTauri: true` exposing `window.__TAURI__`.

| Module | Purpose | Key APIs |
|--------|---------|----------|
| `app.js` | Entry point, initialization, coordinator | `init()`, `_initTauri()`, demo mode |
| `state.js` | Global `App` state object, config backend | `ConfigFallback` (localStorage) or encrypted Tauri storage |
| `ui.js` | DOM manipulation, modals, panel resizing | Toast, modal, draggable divider |
| `auth.js` | PIN entry/creation, auto-lock timer | `lockApp()`, `unlockApp()`, 5-min default |
| `audio.js` | Audio playback controls | Waveform visualization |
| `recording.js` | Recording state machine | Start/stop/pause, chunk management |
| `transcript.js` | Transcript entry rendering | Speaker colors, word count, timestamps |
| `speakers.js` | Speaker management | Doctor (teal), Patient (amber), Other (purple) |
| `notes.js` | Note generation orchestrator | Template selection, AI dispatch, formatting |
| `settings.js` | Settings drawer UI | API key inputs, engine selection, device picker |
| `session.js` | Session persistence | Save/restore/archive, patient name |
| `subscription.js` | License gate overlay (z-1999) | Blocks UI if license invalid/expired |
| `dental-chart.js` | Interactive SVG dental chart | 32 teeth, 8 states, 5 surfaces, voice-driven perio |
| `dental-extras.js` | Dental utilities | Insurance narratives, CDT codes |
| `pms-bridge.js` | Open Dental integration | Connection test, sync perio/procedures/notes |
| `perio-voice-parser.js` | Voice → perio measurements | "Three two four one..." → 6-point depths |
| `medical-dictionary.js` | Clinical term definitions | Used in note generation prompts |
| `languages.js` | Language list (37 languages) | Transcription language selection |
| `templates.js` | Note templates (20 built-in) | SOAP, HPI, DAP, BIRP, specialty, dental, custom |
| `pure.js` | Pure utility functions | Formatting, parsing, validation |

**Supabase Credentials** (`src/env.js` — gitignored):
```javascript
window.ENV = {
  SUPABASE_URL: 'https://seuinmmslazvibotoupm.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIs...'
};
```

### 3.3 Sidecar Binaries

| Binary | Platform | Size | Purpose |
|--------|----------|------|---------|
| `whisper-server` | `aarch64-apple-darwin` | 3.3 MB | HTTP transcription server (Whisper.cpp), Metal GPU-accelerated, flash attention, persistent across recordings (zero cold start), port auto-selected, health-checked before each recording |
| `whisper-cli` | `aarch64-apple-darwin` | 3.0 MB | CLI fallback (not actively used) |
| `html2pdf` | `aarch64-apple-darwin` | 62 KB | Swift executable using WebKit `createPDF`, produces paginated PDF from HTML |

All binaries are **platform-specific** and **gitignored**. Compiled separately for each target architecture.

### 3.4 Bundled Resources

| Resource | Size | Purpose |
|----------|------|---------|
| `models/ggml-large-v3-turbo-q5_0.bin` | 574 MB | Whisper large-v3-turbo model (multilingual, 100 languages, quantized q5_0, near-large accuracy at tiny speed) |
| `corrections.json` (x6) | ~2 KB each | Phonetic error correction dictionaries (EN, DE, ES, FR, IT, PT) |
| `fonts/` | — | Custom fonts for UI |

Model search order: `large-v3-turbo` → `large-v3-turbo-q5_0` → `small` → `tiny` (multilingual preferred over `-en` variants). Default shipped model: `ggml-large-v3-turbo-q5_0.bin` (574 MB).

### 3.5 Tauri Configuration

**File:** `src-tauri/tauri.conf.json`

```
Product Name:     ClinicalFlow
Version:          1.0.0
Identifier:       com.clinicalflow.ai
Frontend Dist:    ../src
Window:           1400×900 (min 1024×700), centered, dark bg (#0B0F14)
Bundle Target:    dmg (macOS only)
Category:         Medical
Min macOS:        11.0
Hardened Runtime: true
withGlobalTauri:  true (REQUIRED for vanilla JS)
```

**CSP (Content Security Policy):**
```
default-src  'self'
connect-src  'self' http://localhost:11434 https://api.anthropic.com
             wss://api.deepgram.com https://*.supabase.co
script-src   'self' 'unsafe-inline'
style-src    'self' 'unsafe-inline'
img-src      'self' data: blob:
font-src     'self' data:
```

### 3.6 macOS Entitlements

**File:** `src-tauri/Entitlements.plist`

| Entitlement | Purpose |
|-------------|---------|
| `com.apple.security.cs.allow-jit` | WebView JIT compilation |
| `com.apple.security.cs.allow-unsigned-executable-memory` | WebView requirement |
| `com.apple.security.cs.disable-library-validation` | WebView requirement |
| `com.apple.security.device.audio-input` | Microphone access |
| `com.apple.security.network.client` | Network (Deepgram, Claude, Supabase) |
| `com.apple.security.files.user-selected.read-write` | File save/open dialogs |

**Microphone prompt** (`Info.plist`): "ClinicalFlow needs microphone access to record and transcribe clinical encounters."

### 3.7 Capabilities (Permissions)

**File:** `src-tauri/capabilities/default.json`

Grants frontend access to Tauri plugins: shell (sidecar execution), fs (read/write app data), dialog (save/open), http (API calls), notification (system alerts).

---

## 4. Marketing Website

**Location:** `ClinicalFlowWebsite/`
**Domain:** `https://clinicalflow.us`
**Tech:** Vanilla HTML + CSS + JS, Supabase JS SDK v2 (CDN)

### 4.1 Page Inventory

| Page | Size | Auth? | Supabase? | Purpose |
|------|------|-------|-----------|---------|
| `index.html` | 74KB | No | Yes (download) | Landing: hero, features, templates, dental, security, download |
| `pricing.html` | 46KB | No | No | Plans: Free Trial, Pro ($25/mo), Team ($19/seat/mo), Enterprise |
| `signup.html` | 54KB | Yes | Yes (full) | 5 screens: signup → verify → plan select → success → error |
| `login.html` | 14KB | Yes | Yes | Email/password + Google OAuth login |
| `account.html` | 22KB | Yes | Yes (full) | Dashboard: subscription, download, profile, password change |
| `get-started.html` | 39KB | Yes | Yes (download) | Onboarding guide + gated download |
| `docs.html` | 112KB | No | No | Full documentation portal with sidebar nav |
| `about.html` | 30KB | No | No | Company story, team, values, differentiators |
| `privacy-policy.html` | 42KB | No | No | Privacy policy (HIPAA, CCPA coverage) |
| `terms-of-service.html` | 45KB | No | No | Terms of service |
| `reset-password.html` | 20KB | Yes | Yes | 5 screens: request → check email → new password → success → error |

**Supabase Configuration** (shared across all auth pages):
```javascript
const SUPABASE_URL = 'https://seuinmmslazvibotoupm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
```

**Supabase JS SDK loaded via CDN:**
```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
```

### 4.2 Shared Assets

| File | Purpose |
|------|---------|
| `styles.css` (34KB) | Design system: accent #0891B2, gradients, glass morphism, responsive breakpoints (1024/768/480px) |
| `main.js` (310 lines) | Nav scroll blur, mobile menu, scroll-reveal animations, smooth scroll, active nav, platform detection, stat animation, keyboard nav, footer year |
| `docs.css` (8.4KB) | Documentation sidebar + content styling |

**Design Tokens:**
- Accent: `#0891B2` (cyan/teal)
- Gradient: `#0891B2 → #06B6D4 → #3B82F6`
- Fonts: DM Sans (sans-serif), JetBrains Mono (monospace)
- Max width: 1200px
- Nav height: 72px (64px mobile)

### 4.3 SEO Files

**robots.txt:**
```
User-agent: *
Allow: /
Disallow: /account.html
Disallow: /reset-password.html
Sitemap: https://clinicalflow.us/sitemap.xml
```

**sitemap.xml** (12 URLs):

| URL | Priority | Frequency |
|-----|----------|-----------|
| `index.html` | 1.0 | weekly |
| `pricing.html` | 0.9 | weekly |
| `signup.html` | 0.9 | monthly |
| `get-started.html` | 0.8 | monthly |
| `docs.html` | 0.8 | weekly |
| `about.html` | 0.6 | monthly |
| `login.html` | 0.5 | monthly |
| `privacy-policy.html` | 0.3 | yearly |
| `terms-of-service.html` | 0.3 | yearly |

### 4.4 Screenshots & Media

Located in `ClinicalFlowWebsite/`:
- `hero-screenshot.png` — Main app interface
- `transcript-screenshot.png` — Transcript panel
- `panels-screenshot.png` — Dual-panel layout
- `note-screenshot.png` — Generated note
- `sidebar-screenshot.png` — Sidebar navigation
- `settings-screenshot.png` — Settings drawer
- `corrections-screenshot.png` — Corrections system
- `shortcuts-screenshot.png` — Keyboard shortcuts

All screenshots are 6-7 MB PNG files.

---

## 5. Supabase Backend

### 5.1 Project Configuration

| Setting | Value |
|---------|-------|
| **Project Reference** | `seuinmmslazvibotoupm` |
| **Region** | West US (Oregon) |
| **Organization** | ClinicalFlow (`gwbsfeppuozaamvdnveq`) |
| **PostgreSQL Version** | 17 |
| **Edge Runtime** | Deno v2, `per_worker` policy |
| **Auth Site URL** | (configured in dashboard) |
| **JWT Expiry** | 3600 seconds (1 hour) |
| **Refresh Token Rotation** | Enabled (10s reuse interval) |

### 5.2 Database Schema

#### `profiles` Table (Migration 001 + 004)

```sql
CREATE TABLE public.profiles (
  id                     UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email                  TEXT NOT NULL UNIQUE,
  full_name              TEXT,
  license_key            UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  stripe_customer_id     TEXT UNIQUE,
  tier                   TEXT NOT NULL DEFAULT 'trial',
    -- Values: trial | pro | team | enterprise | none
  status                 TEXT NOT NULL DEFAULT 'trial',
    -- Values: pending_verification | trial | active | past_due | canceled | expired | none
    -- Note: Default changed from 'pending_verification' to 'trial' by migration 006
  seats                  INT NOT NULL DEFAULT 1,
  trial_ends_at          TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  subscription_ends_at   TIMESTAMPTZ,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id        TEXT,
  email_verified_at      TIMESTAMPTZ,
  selected_plan          TEXT,
    -- Values: pro_monthly | pro_annual | team_monthly | team_annual | free_demo
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### `device_activations` Table (Migration 002)

```sql
CREATE TABLE public.device_activations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  device_hash TEXT NOT NULL,          -- SHA-256(hostname:username)
  device_name TEXT DEFAULT 'Unknown', -- e.g. "MacBook Pro — Dr. Patel"
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, device_hash)
);
```

#### `subscription_events` Table (Migration 003)

```sql
CREATE TABLE public.subscription_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT NOT NULL UNIQUE,  -- Idempotency key
  event_type      TEXT NOT NULL,
  user_id         UUID REFERENCES profiles(id),
  payload         JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 5.3 Row-Level Security (RLS)

| Table | Policy | Rule |
|-------|--------|------|
| `profiles` | SELECT own | `auth.uid() = id` |
| `profiles` | UPDATE own | `auth.uid() = id` (restricted by trigger) |
| `device_activations` | SELECT own | `auth.uid() = user_id` |
| `device_activations` | DELETE own | `auth.uid() = user_id` |
| `subscription_events` | Service role only | No public access |

**Update Restrictions** (enforced by `enforce_profile_update_restrictions` trigger):
Non-service-role users can ONLY update: `full_name`, `selected_plan`.
All other fields (tier, status, seats, stripe_*, dates, license_key) are service-role only.

### 5.4 Database Triggers

| Trigger | Event | Action |
|---------|-------|--------|
| `on_auth_user_created` | `auth.users` INSERT | Creates `profiles` row: status=`trial`, email_verified_at=NOW(), trial_ends_at=NOW()+14 days (migration 006 removed email verification requirement) |
| `on_auth_email_verified` | `auth.users` UPDATE (email_confirmed_at) | Legacy — Sets status→`trial` when email_confirmed_at changes (no longer needed since 006) |
| `profiles_updated_at` | `profiles` UPDATE | Auto-sets `updated_at = NOW()` |
| `enforce_profile_update_restrictions` | `profiles` UPDATE | Blocks non-service-role changes to protected fields (must be disabled for migrations) |

### 5.5 Edge Functions

All functions deployed to: `https://seuinmmslazvibotoupm.supabase.co/functions/v1/{name}`

| Function | Method | Auth | JWT Verify | Purpose |
|----------|--------|------|------------|---------|
| `signup-page` | GET | Public | Gateway | Serves branded HTML signup (for Tauri deep-link) |
| `create-checkout` | POST | Bearer JWT | Gateway | Creates Stripe checkout session |
| `customer-portal` | POST | Bearer JWT | Gateway | Creates Stripe billing portal link |
| `download-release` | GET | Bearer JWT | **Disabled** (--no-verify-jwt) | Returns presigned R2 URL for .dmg |
| `verify-license` | POST | License key | Gateway | Returns encrypted license blob |
| `stripe-webhook` | POST | Stripe signature | None | Handles Stripe subscription lifecycle events |
| `delete-account` | POST | Bearer JWT | **Disabled** (--no-verify-jwt) | Cancels Stripe sub, deletes profile + auth user |

#### `create-checkout` — Stripe Checkout Session

**Request:**
```json
POST /functions/v1/create-checkout
Authorization: Bearer <access_token>

{
  "plan": "pro_monthly" | "pro_annual" | "team_monthly" | "team_annual",
  "seats": 1  // only for team plans
}
```

**Response:**
```json
{ "url": "https://checkout.stripe.com/pay/cs_live_..." }
```

**Flow:**
1. Validates JWT → gets user
2. Looks up or creates Stripe customer (saves `stripe_customer_id` to profiles)
3. Maps plan → Stripe price ID (from env vars)
4. Creates Checkout Session with metadata: `supabase_user_id`, `plan`, `seats`
5. Returns checkout URL

#### `customer-portal` — Stripe Billing Portal

**Request:**
```json
POST /functions/v1/customer-portal
Authorization: Bearer <access_token>

{ "return_url": "https://clinicalflow.us/account.html" }
```

**Response:**
```json
{ "url": "https://billing.stripe.com/p/session/..." }
```

#### `download-release` — Presigned R2 URL

**Request:**
```
GET /functions/v1/download-release
Authorization: Bearer <access_token>
apikey: <supabase_anon_key>
```

**Response:**
```json
{
  "url": "https://.../ClinicalFlow_1.0.0_aarch64.dmg?X-Amz-...",
  "expires_in": 900
}
```

**Access control:** Requires `selected_plan` to be set in profiles table. Returns 403 otherwise.

**Deployed with `--no-verify-jwt`** — the function handles auth internally via `supabase.auth.getUser()`.

#### `verify-license` — License Blob

**Request:**
```json
POST /functions/v1/verify-license

{
  "license_key": "550e8400-e29b-41d4-a716-446655440000",
  "device_hash": "sha256(hostname:username)",
  "device_name": "MacBook Pro — Dr. Patel"
}
```

**Response:**
```json
{
  "valid": true,
  "status": "trial",
  "tier": "pro",
  "reason": "Trial active (10 days remaining)",
  "days_remaining": 10,
  "trial_ends_at": "2026-03-10T...",
  "subscription_ends_at": null,
  "seats": 1,
  "seats_used": 1,
  "license_blob": "base64(nonce + ciphertext + GCM_tag)"
}
```

**Verification logic:**
1. Looks up profile by `license_key`
2. Checks email verification status
3. Evaluates subscription status (trial dates, expiry, grace periods)
4. Tracks device activation (upserts `device_activations`, checks seat limits)
5. Encrypts license payload with AES-256-GCM
6. Returns encrypted blob (24-hour validity)

#### `stripe-webhook` — Subscription Lifecycle

**Request:**
```
POST /functions/v1/stripe-webhook
stripe-signature: t=<timestamp>,v1=<signature>
Body: Raw Stripe event JSON
```

**Handled Events:**

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Set status→`active`, tier→`pro`/`team`, save Stripe IDs, clear trial |
| `invoice.paid` | Update `subscription_ends_at` to new period end |
| `invoice.payment_failed` | Set status→`past_due` |
| `customer.subscription.updated` | Handle seat changes, `cancel_at_period_end`, status transitions |
| `customer.subscription.deleted` | Set status→`expired`, clear Stripe subscription ID |

All events are logged to `subscription_events` table with idempotency (UNIQUE `stripe_event_id`).

#### `signup-page` — Branded HTML Signup

Serves a complete HTML page with:
- Google OAuth button
- Email/password signup form with password strength meter
- Email verification pending screen
- Success screen with deep-link (`clinicalflow://login`)
- Error screen

Used when the Tauri app opens the browser for signup (redirects to this edge function URL).

### 5.6 Shared Utilities

**`_shared/supabase-admin.ts`:**
```typescript
getServiceClient()     // Supabase client with SERVICE_ROLE_KEY (bypasses RLS)
getTokenFromRequest()  // Extract Bearer token from Authorization header
corsHeaders            // CORS headers (Origin: *, Methods: GET/POST/OPTIONS)
jsonResponse()         // JSON Response helper with CORS
```

**`_shared/license-crypto.ts`:**
```typescript
interface LicensePayload {
  user_id, email, tier, status, seats, seats_used,
  valid_until, issued_at, license_key,
  trial_ends_at?, subscription_ends_at?
}

encryptLicense(payload) → base64(nonce_12 + ciphertext + GCM_tag_16)
// Key: LICENSE_ENCRYPTION_KEY env var (64 hex chars = 32 bytes)
// MUST match compiled-in key in src-tauri/src/license.rs
```

---

## 6. Authentication & OAuth

### 6.1 Email/Password Flow

```
User → signup.html → sb.auth.signUp({email, password, data: {full_name}})
  → Supabase creates auth.users entry
  → Trigger creates profiles row (status: trial, trial_ends_at = NOW()+14 days)
  → No email verification required (confirmations disabled)
  → Show plan selection screen (Demo / Pro / Team)
  → User selects plan → profiles.selected_plan updated
  → Show success screen with download button
```

**Anti-enumeration:** Supabase returns a fake success with empty `identities` array for duplicate confirmed emails. The signup page detects this with `Array.isArray(data?.user?.identities) && data.user.identities.length === 0` and shows "An account with this email already exists."

**Rate limiting:** Supabase enforces a 45-second cooldown per email address. The signup page shows friendly messages for rate limit errors.

### 6.2 Google OAuth (PKCE)

```
User → login.html → sb.auth.signInWithOAuth({provider: 'google'})
  → Redirect to Google consent screen
  → Google redirects back with ?code=...
  → JS calls sb.auth.exchangeCodeForSession(code)
  → Session established → redirect to account.html
```

**Google OAuth configured in Supabase dashboard** (external.google = true per auth settings API).

#### Google Cloud Console Setup

1. **Create project:** Go to `https://console.cloud.google.com` → Create New Project → Name: "ClinicalFlow"
2. **Enable API:** API Library → Search "Google Identity" → Enable "Google Identity Services API"
3. **Create OAuth credentials:**
   - Credentials → Create Credentials → OAuth 2.0 Client ID
   - Application type: Web application
   - Name: "ClinicalFlow Web"
   - Authorized redirect URI: `https://seuinmmslazvibotoupm.supabase.co/auth/v1/callback`
   - Copy **Client ID** and **Client Secret**
4. **Configure in Supabase:**
   - Go to `https://supabase.com/dashboard/project/seuinmmslazvibotoupm/auth/providers`
   - Find Google → Toggle enabled
   - Paste Client ID and Client Secret
   - Save
5. **If not ready at launch:** Add `style="display:none"` to the Google OAuth button in `signup.html` and `login.html` to avoid showing broken UI

### 6.3 Password Reset Flow

```
User → reset-password.html → sb.auth.resetPasswordForEmail(email, {redirectTo})
  → Supabase sends reset email
  → User clicks link → redirect with #access_token=...&type=recovery
  → JS calls sb.auth.setSession()
  → Show new password form
  → sb.auth.updateUser({password: newPassword})
  → Success screen → redirect to login
```

### 6.4 Deep Link Login (clinicalflow://)

The desktop app supports browser-based login via custom URL scheme deep links. This enables Google OAuth and other browser-based auth flows.

**Flow:**
1. User clicks "Log in on Website" in the desktop app login gate
2. System browser opens `https://clinicalflow.us/login.html?source=app`
3. User authenticates (Google OAuth or email/password)
4. Website detects `?source=app` (persisted in `sessionStorage` across redirects)
5. After auth success, redirects to `clinicalflow://auth-callback?refresh_token=...`
6. Tauri deep-link plugin captures the URL
7. Desktop app exchanges refresh token for full session via `POST /auth/v1/token?grant_type=refresh_token`
8. Gate closes, user proceeds to PIN entry

**Security:**
- Only `refresh_token` is passed in the deep link (never `access_token`)
- Supabase refresh tokens are single-use (rotated on exchange)
- Custom URL scheme `clinicalflow://` registered in `Info.plist` and `tauri.conf.json`

**Cold-start handling:** If the app launches from a deep link URL, `PendingDeepLink` (Rust `Arc<Mutex<Option<String>>>`) buffers it. JS retrieves via `get_pending_deep_link` command after gate init.

**Files:** `src-tauri/src/lib.rs` (plugin + handler), `src/subscription.js` (`_handleDeepLinkAuth`, `subCompleteWebLogin`), `ClinicalFlowWebsite/login.html` (`redirectToApp`)

### 6.5 Supabase Auth Configuration

| Setting | Value |
|---------|-------|
| Email signup | Enabled |
| Phone signup | Disabled |
| Anonymous sign-ins | Disabled |
| Google OAuth | Enabled |
| Email confirmations | **Disabled** (`enable_confirmations = false` in config.toml) |
| Minimum password length | 6 |
| JWT expiry | 3600 seconds (1 hour) |
| Refresh token rotation | Enabled |
| Refresh token reuse interval | 10 seconds |
| Rate limit: emails | 2 per hour |
| Rate limit: signups | 30 per 5 minutes |
| Rate limit: token refresh | 150 per 5 minutes |

> **Note:** Email verification was disabled (migration 006) so new users start directly in `trial` status. The `handle_new_user()` trigger sets `status='trial'`, `email_verified_at=NOW()`, `trial_ends_at=NOW()+14 days`. Any legacy `pending_verification` users were bulk-upgraded to `trial` by migrations 007/008.

### 6.7 Desktop Login Gate

The subscription gate in the desktop app (`src/index.html` `#subscriptionGate`) has three modes:

1. **`auth`** — Login form with two options:
   - **"Log in on Website"** (primary button) — Opens browser for Google OAuth + email/password
   - **Direct email/password form** — Below a divider, for users who prefer in-app login
   - **"Create Free Account"** — Opens `https://clinicalflow.us/signup.html` in browser
2. **`expired`** — Plan selection (Pro/Team) + Stripe checkout + manage billing link
3. **`pending_verification`** — Legacy screen (no longer shown since email verification disabled)

### 6.6 Redirect URLs

**`emailRedirectTo` / `redirectTo` values used across pages:**

| Page | Redirect URL |
|------|-------------|
| `signup.html` | `window.location.origin + window.location.pathname` (self) |
| `login.html` | `window.location.origin + '/account.html'` |
| `reset-password.html` | `window.location.origin + window.location.pathname` (self) |
| `signup-page` (edge fn) | `SUPABASE_URL + '/functions/v1/signup-page'` |

**Important:** All redirect URLs must be added to **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**. Example entries needed:
```
https://clinicalflow.us/signup.html
https://clinicalflow.us/account.html
https://clinicalflow.us/reset-password.html
https://clinicalflow.us/login.html
https://seuinmmslazvibotoupm.supabase.co/functions/v1/signup-page
```

---

## 7. Stripe Billing Integration

### 7.1 Pricing Tiers

| Tier | Monthly | Annual | Savings |
|------|---------|--------|---------|
| **Free Trial** | $0 (14 days) | — | — |
| **Pro** | $25/month | $250/year ($20.83/mo) | $50/year |
| **Team** | $19/seat/month | $190/seat/year ($15.83/seat/mo) | $38/seat/year |
| **Enterprise** | Custom | Custom | Contact sales |

### 7.2 Checkout Flow

```
Website (account.html or signup.html)
  → POST /functions/v1/create-checkout
    Body: { plan: "pro_monthly", seats: 1 }
  → Edge function creates Stripe Checkout Session
    - Lookup/create Stripe customer
    - Map plan → price ID (env var)
    - Set metadata: supabase_user_id, plan, seats
    - Success URL: account.html?checkout=success
    - Cancel URL: account.html?checkout=canceled
  → Returns checkout URL
  → User redirected to Stripe Checkout
  → Payment processed
  → Stripe fires checkout.session.completed webhook
  → stripe-webhook Edge Function updates profiles:
    status→active, tier→pro/team, saves Stripe IDs
```

### 7.3 Webhook Events

| Event | Profiles Update |
|-------|----------------|
| `checkout.session.completed` | status→`active`, tier→`pro`/`team`, seats, stripe_subscription_id, stripe_price_id, subscription_ends_at, trial_ends_at→NULL |
| `invoice.paid` | status→`active`, subscription_ends_at→new period end |
| `invoice.payment_failed` | status→`past_due` |
| `customer.subscription.updated` | seats, subscription_ends_at, status (handles `cancel_at_period_end`) |
| `customer.subscription.deleted` | status→`expired`, stripe_subscription_id→NULL |

**Webhook URL:** `https://seuinmmslazvibotoupm.supabase.co/functions/v1/stripe-webhook`
**Webhook Secret:** `STRIPE_WEBHOOK_SECRET` env var (signature verification)

#### Setting Up Webhooks in Stripe Dashboard

1. **Add endpoint:** Go to `https://dashboard.stripe.com/webhooks` → Click "Add endpoint"
2. **Endpoint URL:** `https://seuinmmslazvibotoupm.supabase.co/functions/v1/stripe-webhook`
3. **Select events:**
   - `checkout.session.completed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. **Click "Add endpoint"** to create
5. **Get signing secret:** Click the endpoint → Under "Signing secret" click "Reveal" → Copy the `whsec_...` value
6. **Set in Supabase:** `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...`
7. **Verify health:** Webhook delivery logs visible at `https://dashboard.stripe.com/webhooks` → Click endpoint → View deliveries and retry status

### 7.4 Customer Portal

Accessed from `account.html` "Manage Billing" button:
```javascript
const res = await fetch(SUPABASE_URL + '/functions/v1/customer-portal', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + session.access_token,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ return_url: window.location.href }),
});
const { url } = await res.json();
window.location.href = url;  // Redirect to Stripe portal
```

Portal allows: view invoices, update payment method, cancel subscription, change seats.

---

## 8. License & Subscription System

### 8.1 License Verification Flow

```
Tauri App Launch
  → Load session.json (encrypted with compiled-in SESSION_KEY)
  → Check cached license_blob
  → If expired (>24 hours old) or missing:
      POST /functions/v1/verify-license
        Body: { license_key, device_hash, device_name }
      → Server validates subscription status
      → Server encrypts LicensePayload with LICENSE_ENCRYPTION_KEY
      → Returns encrypted license_blob
  → App decrypts blob with compiled-in LICENSE_KEY
  → Checks: valid_until, status, tier, seats
  → If valid: unlock app features
  → If invalid: show subscription gate overlay (z-index 1999)
```

### 8.2 License Encryption (AES-256-GCM)

**Two matching keys must be identical:**

| Location | Key | Purpose |
|----------|-----|---------|
| Supabase env: `LICENSE_ENCRYPTION_KEY` | 64 hex chars (32 bytes) | Server-side encryption of license blobs |
| Tauri binary: `license.rs::LICENSE_KEY` | Same key compiled in | Client-side decryption of license blobs |

**Generate:** `openssl rand -hex 32`

**Encrypted payload structure:**
```
base64( nonce[12 bytes] + ciphertext + GCM_tag[16 bytes] )
```

**LicensePayload fields:**
```
user_id, email, tier, status, seats, seats_used,
valid_until (24h from issuance), issued_at, license_key,
trial_ends_at?, subscription_ends_at?
```

### 8.3 Device Seat Tracking

- **Device hash:** `SHA-256(hostname:username)` — computed by Rust (`license.rs`)
- **Device name:** `"MacBook-Pro — drpatel"` — human-readable
- **Tracked in:** `device_activations` table (upserted on each verify-license call)
- **Seat enforcement:** At verify-license time, counts devices seen in last 30 days
  - Pro: 1 seat (1 device)
  - Team: N seats (configured in Stripe, stored in `profiles.seats`)
  - If `seats_used > seats`: returns `valid: false, status: "seat_limit"`
- **Users can free seats** by deleting devices from account page (RLS allows DELETE own)

### 8.4 Subscription Lifecycle

```
1. SIGNUP → profiles.status = trial, trial_ends_at = NOW() + 14 days
   (email verification disabled; users start directly in trial)
2. TRIAL ACTIVE → App works, verify-license returns valid=true
3. TRIAL EXPIRES → verify-license auto-updates status→expired, returns valid=false
4. USER SUBSCRIBES → Stripe checkout → webhook → status=active, tier=pro/team
5. RENEWAL → invoice.paid webhook → subscription_ends_at extended
6. PAYMENT FAILS → invoice.payment_failed → status=past_due (grace period)
7. USER CANCELS → subscription.updated → status=canceled (access until period end)
8. PERIOD ENDS → subscription.deleted → status=expired
9. DELETE ACCOUNT → delete-account edge fn → cancels Stripe sub → deletes profile + auth user
```

### 8.5 Offline Grace Period & Trial Enforcement

The app allows offline usage with cached subscription status:

- **24-hour cache:** If verified within 24h, trusts cached status without network call
- **License blob:** Server-issued AES-256-GCM encrypted blob with `valid_until` (24h from issuance). If network fails, app decrypts blob and checks `valid_until`.
- **30-day grace period:** If blob decryption fails but last verification was within 30 days, trusts cached status — **except for expired trials**
- **Trial expiration check:** Even offline, the grace period path checks `trial_ends` date. If the trial has expired, returns `valid: false` regardless of grace period. This prevents the bypass where an expired trial user could continue using the app indefinitely while offline.

**Code:** `src/subscription.js` — `checkSubscriptionPrePin()` (pre-PIN) and `checkSubscription()` (post-PIN) both enforce this.

### 8.6 Free Demo Plan (v1.0.0)

For the v1.0.0 early release, a "Free Demo" plan tile is available on the website's plan selection wizard:
- **Database:** `selected_plan` CHECK constraint includes `'free_demo'` (migration 009)
- **Website:** `signup.html` shows Demo/Pro/Team tiles in a 3-column grid
- **Behavior:** Selecting Free Demo saves `free_demo` to `profiles.selected_plan`, enables download access (no Stripe checkout needed)
- **App behavior:** Trial status and 14-day expiration still apply — Free Demo is just a plan selection preference, not a different subscription tier

---

## 9. Download & Release Distribution

### 9.1 Cloudflare R2 Storage

| Setting | Value |
|---------|-------|
| **Bucket** | `clinicalflow-releases` (default, configurable via `R2_BUCKET`) |
| **File** | `ClinicalFlow_1.0.0_aarch64.dmg` |
| **Endpoint** | `R2_ENDPOINT` env var |
| **Auth** | `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` |

#### R2 Bucket Setup in Cloudflare Dashboard

1. **Create bucket:** Go to `https://dash.cloudflare.com/` → R2 Object Storage → Create bucket → Name: `clinicalflow-releases`
2. **Upload release:** Upload `ClinicalFlow_1.0.0_aarch64.dmg` to the bucket root
3. **Generate API token:**
   - Go to R2 → Manage R2 API Tokens → Create API token
   - Permissions: Object Read & Write
   - Scope: Apply to `clinicalflow-releases` bucket
   - Copy the **Access Key ID** and **Secret Access Key**
4. **Get S3 endpoint:** In R2 bucket settings, find the S3 API endpoint (format: `https://<account-id>.r2.cloudflarestorage.com`)
5. **Set Supabase secrets:**
   ```bash
   supabase secrets set R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
   supabase secrets set R2_BUCKET=clinicalflow-releases
   supabase secrets set R2_ACCESS_KEY_ID=<access-key>
   supabase secrets set R2_SECRET_ACCESS_KEY=<secret-key>
   ```

### 9.2 Presigned URL Generation

The `download-release` edge function generates AWS SigV4 presigned URLs manually (no SDK):

```
Algorithm:  AWS4-HMAC-SHA256
Region:     auto
Service:    s3
Expiry:     900 seconds (15 minutes)
Signed Headers: host

Steps:
1. Build canonical request (GET, path, query params, host header)
2. Build string to sign (algorithm, timestamp, credential scope, request hash)
3. Derive signing key: HMAC(HMAC(HMAC(HMAC("AWS4"+secret, date), region), service), "aws4_request")
4. Compute signature: HMAC-SHA256(signing_key, string_to_sign)
5. Append X-Amz-Signature to URL
```

### 9.3 Gated Download Flow

All download buttons across the website use the same pattern:

```javascript
async function gatedDownload(btn) {
  // 1. Refresh session to get fresh access token
  const { data: { session } } = await sb.auth.refreshSession();
  if (!session) { redirect to signup; return; }

  // 2. Call edge function with BOTH headers
  const res = await fetch(SUPABASE_URL + '/functions/v1/download-release', {
    headers: {
      'Authorization': 'Bearer ' + session.access_token,
      'apikey': SUPABASE_KEY,  // Required by Supabase gateway
    },
  });

  // 3. Parse response with full error handling
  var text = await res.text();
  var body = {};
  try { body = JSON.parse(text); } catch (_) {}

  if (res.status === 403) { redirect to signup; return; }
  if (!res.ok) throw new Error(body.error || text || 'HTTP ' + res.status);
  if (!body.url) throw new Error('No download URL in response');

  // 4. Redirect to presigned R2 URL → browser downloads .dmg
  window.location.href = body.url;
}
```

**Pages with download buttons:**

| Page | Button ID(s) | Behavior |
|------|-------------|----------|
| `index.html` | `heroDownloadBtn`, `macDownloadBtn`, `ctaDownloadBtn` | Gated download or redirect to signup |
| `get-started.html` | `macDownloadBtn` | Gated download |
| `account.html` | `downloadBtn` | Gated download |
| `signup.html` | `getStartedBtn` (success screen) | Gated download via `downloadRelease()` |

---

## 10. Security Architecture

### 10.1 Encryption Model

ClinicalFlow uses a **two-tier encryption model** for local file storage:

#### Tier 1: Session Encryption (App Key)

| Aspect | Detail |
|--------|--------|
| **File** | `session.json` |
| **Algorithm** | AES-256-GCM |
| **Key Derivation** | PBKDF2-HMAC-SHA256 (100k iterations) |
| **Key Source** | Compiled-in `SESSION_KEY` constant in `license.rs` |
| **Security Level** | At-rest protection only (key is in binary) |
| **Contents** | Supabase tokens, license UUID, cached tier/status, license blob |

#### Tier 2: Config Encryption (User PIN)

| Aspect | Detail |
|--------|--------|
| **File** | `config.json` |
| **Algorithm** | AES-256-GCM |
| **Key Derivation** | PBKDF2-HMAC-SHA256 (100k iterations) |
| **Key Source** | User's PIN (4-8 digits) |
| **Security Level** | Full user-controlled encryption |
| **Contents** | API keys (Deepgram, Anthropic), all settings, PHI-adjacent data |

**File format (both tiers):**
```
[salt: 16 bytes][nonce: 12 bytes][ciphertext + GCM tag]
```

### 10.2 PIN Authentication

| Aspect | Detail |
|--------|--------|
| **Hash Algorithm** | Argon2id (default params) |
| **Storage** | `auth.json` (plaintext file with hash string) |
| **PIN Length** | 4-8 digits, numeric only |
| **Auto-Lock** | Default 5 minutes of inactivity (configurable) |
| **In-Memory** | PIN held in `AppState.pin` Mutex, cleared on lock |
| **Reset** | Deletes auth.json + config.json + session.json + archives |

### 10.3 Content Security Policy

```
default-src  'self'
connect-src  'self'
             http://localhost:11434        (Ollama local LLM)
             https://api.anthropic.com     (Claude API)
             wss://api.deepgram.com        (Deepgram streaming)
             https://*.supabase.co         (Supabase backend)
script-src   'self' 'unsafe-inline'
style-src    'self' 'unsafe-inline'
img-src      'self' data: blob:
font-src     'self' data:
```

### 10.4 Data Classification

| Classification | Encryption | Location | Examples |
|---------------|-----------|----------|----------|
| **PHI** | PIN-based AES-256-GCM | `config.json`, session archives | Transcripts, notes, dental data, patient names |
| **Auth Tokens** | App-key AES-256-GCM | `session.json` | Supabase access/refresh tokens |
| **License Data** | App-key + License-key (double) | `session.json` | License blob, tier, status |
| **PIN Hash** | Argon2id (one-way) | `auth.json` | PIN verification |
| **API Keys** | PIN-based AES-256-GCM | `config.json` | Deepgram, Anthropic, Ollama |

**Critical Rule:** NEVER store PHI in `session.json`. The session.json encryption key is embedded in the binary — it is NOT equivalent to PIN-based encryption.

---

## 11. Audio & Transcription Pipeline

### 11.1 Recording Pipeline

```
Microphone (cpal)
  ↓ Input stream (variable sample rate, i16 or f32)
  ↓ Resample to 16kHz mono i16 (linear interpolation)
  ↓ Continuous WAV file writer (crash-safe, periodic flush)
  ↓ Chunk buffer (2s default, adaptive 2–3s + 0.3s overlap)
  ↓ RMS-based silence detection (threshold: 200.0)
  ↓ HTTP POST to whisper-server (multipart/form-data, Metal GPU)
  ↓ Adaptive performance monitoring (rolling 10-chunk window)
  ↓ Hallucination filtering (regex: "thank you", "(silence)", etc.)
  ↓ Medical term corrections (82+ patterns)
  ↓ Transcript event emitted to frontend
```

**Constraints:**
- Max recording: 4 hours per session (sample limit)
- Chunk size: 2 seconds default (adaptive: auto-scales to 3s if inference falls behind, back to 2s when headroom available)
- Overlap: 0.3s (5000 samples) for continuity between chunks
- Polling interval: 150ms (processing loop)
- Inference timeout: 5s per chunk (fail-fast with Metal GPU)
- `navigator.mediaDevices.getUserMedia()` NOT available in Tauri WKWebView
- `cpal::Stream` is `!Send+!Sync` → wrapped in `StreamWrapper` with unsafe impl

**Persistent Whisper Server:**
- Server starts on first recording and stays alive across recordings (zero cold start)
- `ensure_whisper_server()` health-checks existing server before each recording
- Auto-restarts if server is unresponsive or language changed
- Killed on app exit (RunEvent::Exit handler in lib.rs) or via `shutdown_whisper_server` command
- Thread count capped at 6 to avoid overwhelming E-cores on Apple Silicon

### 11.2 Transcription Engines

| Engine | Mode | Protocol | Key Features |
|--------|------|----------|-------------|
| **Deepgram Nova-3 Medical** | Online (`online`) | WebSocket (`wss://`) | Medical vocabulary, speaker diarization, streaming, keyterm boosting (100 terms) |
| **Whisper (whisper-server)** | Offline (`offline`) | HTTP POST (`localhost:{port}`) | Metal GPU-accelerated, large-v3-turbo-q5_0 model, 100 languages, flash attention, persistent server (zero cold start), adaptive chunk sizing, medical vocabulary prompt |
| **Web Speech API** | Fallback | Browser native | No setup required, limited accuracy |

**Config keys:** `ms-tx-mode` (values: `online`, `offline`), `ms-dg-key` (Deepgram API key).

**Whisper model search order:** `large-v3-turbo` → `large-v3-turbo-q5_0` → `small` → `tiny` (multilingual before `-en`). Default shipped model: `large-v3-turbo-q5_0` (574 MB, near-large accuracy at tiny speed, 4 decoder layers).

**Medical vocabulary prompt** (~5KB, embedded in binary):
Covers medications (metformin, lisinopril...), conditions, anatomy, labs, vitals, dental terms. Used by local Whisper mode.

### 11.3 Post-Processing

**Corrections dictionary** (`corrections.json` × 6 languages):
- 82 English patterns + 122 multilingual patterns
- Regex-based phonetic error correction
- Examples: "hyper tension" → "hypertension", "peri odontal" → "periodontal"
- Applied in real-time to each transcript chunk

---

## 12. AI Note Generation

### 12.1 Three-Tier Fallback

```
Transcript → Note Generation Request
  ↓
  ├─ [1] Cloud AI (Claude Haiku 4.5)
  │     API: https://api.anthropic.com
  │     Cost: ~1.3¢ per note
  │     Quality: Highest
  │
  ├─ [2] Ollama (Local LLM)
  │     API: http://localhost:11434
  │     Model: llama3.1:8b (configurable)
  │     Cost: Free (local compute)
  │     Quality: Good
  │
  └─ [3] Rule-Based (Deterministic)
        No AI required
        Keyword extraction + template fill
        Quality: Basic but reliable
```

**Two-pass verification** (optional):
- Pass 1: Generate note from transcript
- Pass 2: Verify note accuracy against transcript (catches hallucinations)

### 12.2 Note Templates (20 Built-In)

| Category | Templates |
|----------|-----------|
| **General** (3) | SOAP, HPI-Focused, Problem-Oriented |
| **Behavioral** (2) | DAP, BIRP |
| **Specialty** (10) | Cardiology, Ortho, Peds, OB/GYN, ER/Urgent, Derm, Neuro, Ophtho, Wellness, Procedure |
| **Dental** (5) | General Exam, Perio, Endo, Oral Surgery, Prostho |
| **Custom** | User-created (stored in config) |

### 12.3 Medical & Dental Coding

| System | Codes | Source |
|--------|-------|--------|
| **ICD-10** | Up to 8 codes per note | AI-generated with confidence levels |
| **CPT** | Up to 4 codes per note | AI-generated with E&M assessment |
| **CDT** | Dental-specific | 4 guardrails: depth escalator, trauma classification, etiology tracking, insurance narrative |

---

## 13. Dental Charting System

**Module:** `dental-chart.js` (49KB)

| Feature | Detail |
|---------|--------|
| **Tooth Chart** | Interactive SVG, adult (32 teeth) + primary (20 teeth) |
| **Numbering** | FDI system (11-48) |
| **Tooth States** (8) | Healthy, Decay/Caries, Missing, Restored, Implant, Root Canal, Fracture, Impacted |
| **Surfaces** (5) | Mesial, Occlusal/Incisal, Distal, Buccal/Facial, Lingual |
| **Perio Mode** | 6-point probing depths (MB, B, DB, ML, L, DL) |
| **Additional Perio** | Bleeding on Probing, Mobility (0-3), Furcation (I-III), Recession |
| **Voice Entry** | `perio-voice-parser.js` parses spoken measurements |
| **AI Integration** | Bidirectional: findings→prompt, response→chart |
| **Export** | SVG + findings table included in PDF/text exports |

---

## 14. PMS Integration (Open Dental)

**Module:** `pms.rs` (448 lines)

| Feature | Table | Data |
|---------|-------|------|
| **Perio Sync** | `perioexam` + `periomeasure` | 6-point depths, BOP, mobility, furcation |
| **Procedure Sync** | `procedurelog` | CDT codes, tooth #, surfaces, status |
| **Note Sync** | `commlog` | Clinical notes (CommType 224) |
| **Connection** | MySQL/MariaDB | Host, port, database, username, password |

**Connection test** verifies access to `perio*` tables before sync.

---

## 15. Environment Variables

### Supabase Edge Functions (Secrets)

| Variable | Used By | Purpose |
|----------|---------|---------|
| `SUPABASE_URL` | All | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | All | Service role (bypasses RLS) |
| `SUPABASE_ANON_KEY` | signup-page | Public anon key |
| `STRIPE_SECRET_KEY` | create-checkout, customer-portal, stripe-webhook | Stripe API |
| `STRIPE_WEBHOOK_SECRET` | stripe-webhook | Webhook signature verification |
| `STRIPE_PRICE_PRO_MONTHLY` | create-checkout | Stripe price ID |
| `STRIPE_PRICE_PRO_ANNUAL` | create-checkout | Stripe price ID |
| `STRIPE_PRICE_TEAM_MONTHLY` | create-checkout, stripe-webhook | Stripe price ID |
| `STRIPE_PRICE_TEAM_ANNUAL` | create-checkout, stripe-webhook | Stripe price ID |
| `LICENSE_ENCRYPTION_KEY` | verify-license | 64 hex chars (32 bytes AES-256 key) |
| `R2_ENDPOINT` | download-release | Cloudflare R2 endpoint URL |
| `R2_BUCKET` | download-release | Bucket name (default: `clinicalflow-releases`) |
| `R2_ACCESS_KEY_ID` | download-release | R2 access key |
| `R2_SECRET_ACCESS_KEY` | download-release | R2 secret key |

#### Creating Stripe Products & Prices

1. **Go to Products:** `https://dashboard.stripe.com/products`
2. **Create "ClinicalFlow Pro":**
   - Click "Add product" → Name: "ClinicalFlow Pro"
   - Add price: $25.00 USD, Recurring, Monthly → Save → Copy Price ID (`price_1...`)
   - Add another price: $250.00 USD, Recurring, Yearly → Copy Price ID
3. **Create "ClinicalFlow Team":**
   - Click "Add product" → Name: "ClinicalFlow Team"
   - Add price: $19.00 USD per unit, Recurring, Monthly → Copy Price ID
   - Add another price: $190.00 USD per unit, Recurring, Yearly → Copy Price ID
4. **Set Supabase secrets** with the Price IDs:
   ```bash
   supabase secrets set STRIPE_PRICE_PRO_MONTHLY=price_1ABC...
   supabase secrets set STRIPE_PRICE_PRO_ANNUAL=price_1XYZ...
   supabase secrets set STRIPE_PRICE_TEAM_MONTHLY=price_1DEF...
   supabase secrets set STRIPE_PRICE_TEAM_ANNUAL=price_1GHI...
   ```

These Price IDs are referenced in `create-checkout/index.ts` (PRICE_MAP) and `stripe-webhook/index.ts` (TEAM_PRICE_IDS).

### Desktop App (src/env.js — gitignored)

```javascript
window.ENV = {
  SUPABASE_URL: 'https://seuinmmslazvibotoupm.supabase.co',
  SUPABASE_ANON_KEY: 'eyJ...'
};
```

### Desktop App (User-Configured, stored encrypted in config.json)

| Setting | Purpose |
|---------|---------|
| Deepgram API key | Online transcription |
| Anthropic API key | Claude note generation |
| Ollama URL | Local LLM endpoint |
| Ollama model | Local LLM model name |
| PMS credentials | Open Dental MySQL connection |

---

## 16. DNS, Domain & Hosting

### Domain

| Item | Value |
|------|-------|
| **Domain** | `clinicalflow.us` |
| **Referenced in** | sitemap.xml, robots.txt, email templates, privacy policy, terms of service |
| **Contact emails** | `support@clinicalflow.us` (in legal pages) |

### Website Hosting

No deployment configuration files found in the repository (no `netlify.toml`, `vercel.json`, `_redirects`, or `CNAME`). The website is static HTML — compatible with any static hosting provider:
- Vercel (recommended — free tier, auto-HTTPS)
- Netlify
- Cloudflare Pages
- GitHub Pages

### Supabase Dashboard Links (Quick Reference)

| Location | URL |
|----------|-----|
| **Main Dashboard** | `https://supabase.com/dashboard/project/seuinmmslazvibotoupm` |
| **Auth → Providers** | `https://supabase.com/dashboard/project/seuinmmslazvibotoupm/auth/providers` |
| **Auth → URL Config** | `https://supabase.com/dashboard/project/seuinmmslazvibotoupm/auth/url-configuration` |
| **Auth → Email Templates** | `https://supabase.com/dashboard/project/seuinmmslazvibotoupm/auth/templates` |
| **Database → Tables** | `https://supabase.com/dashboard/project/seuinmmslazvibotoupm/editor` |
| **Edge Functions** | `https://supabase.com/dashboard/project/seuinmmslazvibotoupm/functions` |
| **Edge Function Logs** | `https://supabase.com/dashboard/project/seuinmmslazvibotoupm/logs/edge-logs` |
| **SQL Editor** | `https://supabase.com/dashboard/project/seuinmmslazvibotoupm/sql` |
| **Settings → API Keys** | `https://supabase.com/dashboard/project/seuinmmslazvibotoupm/settings/api` |
| **Settings → Secrets** | `https://supabase.com/dashboard/project/seuinmmslazvibotoupm/settings/vault/secrets` |
| **Database → Backups** | `https://supabase.com/dashboard/project/seuinmmslazvibotoupm/database/backups` |

| Item | Value |
|------|-------|
| **Project URL** | `https://seuinmmslazvibotoupm.supabase.co` |
| **Region** | West US (Oregon) |

### Cloudflare R2

| Item | Value |
|------|-------|
| **Bucket** | `clinicalflow-releases` |
| **File** | `ClinicalFlow_1.0.0_aarch64.dmg` |
| **Access** | Via presigned URLs (15-min expiry) |

### Stripe

| Item | Value |
|------|-------|
| **Webhook URL** | `https://seuinmmslazvibotoupm.supabase.co/functions/v1/stripe-webhook` |
| **Checkout Success** | `https://clinicalflow.us/account.html?checkout=success` |
| **Checkout Cancel** | `https://clinicalflow.us/account.html?checkout=canceled` |
| **Portal Return** | `https://clinicalflow.us/account.html` |
| **Dashboard** | `https://dashboard.stripe.com` |

### External API Endpoints

| Service | Endpoint | Protocol |
|---------|----------|----------|
| **Deepgram** | `wss://api.deepgram.com` | WebSocket (streaming STT) |
| **Anthropic** | `https://api.anthropic.com` | HTTPS (Claude API) |
| **Ollama** | `http://localhost:11434` | HTTP (local LLM) |
| **Supabase Auth** | `https://seuinmmslazvibotoupm.supabase.co/auth/v1` | HTTPS |
| **Supabase DB** | `https://seuinmmslazvibotoupm.supabase.co/rest/v1` | HTTPS |
| **Supabase Functions** | `https://seuinmmslazvibotoupm.supabase.co/functions/v1` | HTTPS |

---

## 17. Build & Development

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Rust | 1.77.2+ | Backend compilation |
| Node.js | 18+ | npm scripts, Tauri CLI |
| Cargo | — | Rust package manager |
| Supabase CLI | 2.75.0 | Edge function deployment |

### Commands

```bash
# Development
cd /Users/aidengolub/Desktop/ClinicalFlowApp
PATH="/Users/aidengolub/.cargo/bin:/usr/local/bin:$PATH" npm run dev

# Build DMG
npm run build

# Run tests
npm test            # or: npx vitest run
npm run test:watch  # or: npx vitest

# Deploy edge functions
# Most functions use Supabase's default gateway JWT verification.
# download-release uses --no-verify-jwt because it handles auth internally
# via supabase.auth.getUser() to provide custom error messages (e.g. 403
# "Please select a plan") instead of the gateway's generic 401 "Invalid JWT".
supabase functions deploy create-checkout
supabase functions deploy customer-portal
supabase functions deploy download-release --no-verify-jwt
supabase functions deploy signup-page
supabase functions deploy stripe-webhook
supabase functions deploy verify-license

# Set secrets
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set LICENSE_ENCRYPTION_KEY=<64-hex-chars>
supabase secrets set R2_ENDPOINT=https://...
supabase secrets set R2_ACCESS_KEY_ID=...
supabase secrets set R2_SECRET_ACCESS_KEY=...
```

### Known Build Issues

| Issue | Fix |
|-------|-----|
| C++ headers broken on macOS | Add `-isystem /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1` |
| `window.__TAURI__` undefined | Ensure `withGlobalTauri: true` in tauri.conf.json |
| `navigator.mediaDevices` unavailable | Skip getUserMedia in Tauri mode (use cpal instead) |
| Script `?v=X` cache-busting fails | Don't add query params — Tauri's file server can't resolve them |
| MutexGuard across await | Don't hold Rust MutexGuard across `.await` points |

---

## 18. CI/CD & Automation

### Current State

This is a **solo project** with manual build and deployment. No CI/CD pipeline exists yet.

**Current workflow:**
```
Developer machine
  → Manual code changes
  → Manual: npm run build (local macOS .dmg build)
  → Manual: supabase functions deploy <name> (each function individually)
  → Manual: upload .dmg to Cloudflare R2
  → Manual: deploy website files to hosting
```

### Planned Strategy (GitHub Actions)

**Phase 1 — Edge Function Auto-Deploy (next priority):**
```yaml
# .github/workflows/deploy-functions.yml
# Trigger: merge to main
# Steps:
#   1. Checkout repo
#   2. Install Supabase CLI
#   3. Link project (SUPABASE_ACCESS_TOKEN secret)
#   4. Deploy all edge functions:
#      - supabase functions deploy create-checkout
#      - supabase functions deploy customer-portal
#      - supabase functions deploy download-release --no-verify-jwt
#      - supabase functions deploy signup-page
#      - supabase functions deploy stripe-webhook
#      - supabase functions deploy verify-license
```

**Phase 2 — Automated .dmg Build (future goal, not blocking launch):**
```yaml
# .github/workflows/build-release.yml
# Trigger: push tag v*.*.*
# Runner: macos-latest (required for Tauri macOS builds)
# Steps:
#   1. Checkout repo
#   2. Install Rust toolchain + cargo
#   3. Install Node.js + npm dependencies
#   4. Download Whisper models + sidecar binaries (from private storage)
#   5. npm run build
#   6. Upload .dmg artifact to Cloudflare R2
#   7. Create GitHub Release with .dmg attached
```

**Not planned:**
- Auto-run tests on PR (tests are run locally before committing)
- Branch protection rules (solo project)
- Staging environments (develop directly against production Supabase)

---

## 19. Developer Onboarding & Local Environment

### Project Context

This is a **solo developer project**. There is no team onboarding process. Development is done directly against the **hosted Supabase project** (not a local Supabase instance).

### Development Setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd ClinicalFlowApp

# 2. Install Node dependencies
npm install

# 3. Create src/env.js (gitignored — credentials not in repo)
cat > src/env.js << 'EOF'
window.ENV = {
  SUPABASE_URL: 'https://seuinmmslazvibotoupm.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNldWlubW1zbGF6dmlib3RvdXBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjM4MjAsImV4cCI6MjA4Nzc5OTgyMH0.YE4e8bf6Q_4zfvu9zLpaMIrfbnsf6Z9ucf2mSebyrqY'
};
EOF

# 4. Ensure Rust toolchain is installed
rustup default stable

# 5. Place sidecar binaries (not in git — must be compiled or obtained separately)
#    src-tauri/binaries/whisper-server-aarch64-apple-darwin
#    src-tauri/binaries/html2pdf-aarch64-apple-darwin

# 6. Place Whisper model (not in git — 574MB)
#    src-tauri/resources/models/ggml-large-v3-turbo-q5_0.bin

# 7. Launch dev mode
PATH="/Users/aidengolub/.cargo/bin:/usr/local/bin:$PATH" npm run dev
```

### Supabase Backend

| Aspect | Approach |
|--------|----------|
| **Local Supabase** | Not used — develop directly against hosted project |
| **Migrations** | Applied manually via Supabase Dashboard SQL editor or CLI (`supabase db push`) |
| **Seed data** | No seed file — test with real accounts |
| **Edge functions** | Tested by deploying to hosted project and calling from the app/website |

### Edge Function Deployment

```bash
# Link project (one-time)
supabase link --project-ref seuinmmslazvibotoupm

# Deploy individual function
supabase functions deploy <function-name>

# Deploy with JWT verification disabled (download-release only)
supabase functions deploy download-release --no-verify-jwt

# Set environment secrets
supabase secrets set KEY=value
```

---

## 20. App Updates Strategy

### Current State (v1.0.0)

The Tauri auto-updater plugin is **not enabled**. Users download new versions manually from the website.

**Current update flow:**
```
New version built (npm run build)
  → .dmg uploaded to Cloudflare R2
  → download-release edge function updated with new file key (if filename changes)
  → Users visit clinicalflow.us/account.html or get-started.html
  → Click "Download .dmg" → presigned URL → browser downloads new version
  → User drags new .dmg to Applications (replaces old version)
```

### Planned: In-App Update Notifications (v2)

For a future release, the plan is to add lightweight update checking:

```
App launch
  → Check remote endpoint for latest version (e.g., latest.json on R2 or GitHub)
  → Compare against current version (1.0.0)
  → If newer version available:
      Show non-blocking notification: "ClinicalFlow v1.1.0 is available"
      Link to website download page
  → User manually downloads and installs
```

**Not planned for v1:**
- Tauri's built-in updater plugin (requires code signing + update server)
- Background auto-update (complexity not justified at launch scale)
- Delta updates

### Version Numbering

Follows semantic versioning: `MAJOR.MINOR.PATCH`
- Version stored in: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`
- Release file naming: `ClinicalFlow_{version}_aarch64.dmg`

---

## 21. Monitoring, Alerting & Observability

### Current State

No dedicated monitoring infrastructure is deployed. Observability relies on built-in tools from each service provider.

### Monitoring by Layer

| Layer | Tool | Status | Details |
|-------|------|--------|---------|
| **Edge Functions** | Supabase Log Explorer | Available | `https://supabase.com/dashboard/project/seuinmmslazvibotoupm/logs/edge-logs` — shows invocations, errors, latency |
| **Database** | Supabase Dashboard | Available | Table inspector, query performance, connection counts |
| **Stripe Webhooks** | Stripe Dashboard | Available | Webhook delivery logs, automatic failure emails, retry status at `https://dashboard.stripe.com/webhooks` |
| **Desktop App** | Local log files | Active | Daily rolling logs at `~/Library/Application Support/com.clinicalflow.ai/logs/` |
| **Website** | None | Planned | No analytics or uptime monitoring yet |

### Stripe Webhook Failure Handling

Stripe provides built-in alerting:
- Failed webhook deliveries trigger email notifications to the Stripe account owner
- Stripe retries failed webhooks with exponential backoff (up to 72 hours)
- The `stripe-webhook` edge function logs errors to console (visible in Supabase Log Explorer)
- Idempotency via `subscription_events.stripe_event_id` UNIQUE constraint prevents duplicate processing on retries

### Planned Additions

| Tool | Purpose | Priority |
|------|---------|----------|
| **UptimeRobot** (free) | Website uptime monitoring + Supabase endpoint health | Medium — add after launch |
| **Supabase Alerts** | Database storage/connection threshold alerts | Low — available on Pro plan |
| **Sentry** | Frontend JS + Rust crash reporting | Low — consider for v2 if user base grows |
| **Plausible / GA4** | Website analytics (page views, conversion funnel) | Medium — add after launch |

### Desktop App Logging

The Tauri app writes structured logs locally:

```
Location:   ~/Library/Application Support/com.clinicalflow.ai/logs/
Format:     clinicalflow-YYYY-MM-DD.log
Rotation:   Daily (new file each day)
Retention:  30 days (auto-cleanup on app launch)
Levels:     debug (dev builds), info (production)
Excluded:   hyper, reqwest, tao, wry (noisy framework internals)
PHI:        NEVER logged — only message lengths and error stacks
```

---

## 22. Disaster Recovery & Backups

### Database Backups (Supabase)

| Aspect | Detail |
|--------|--------|
| **Supabase Plan** | Free tier |
| **Backup Type** | Daily automated backups (included on free plan) |
| **Retention** | 7 days |
| **Point-in-Time Recovery** | Not available (requires Pro plan) |
| **Manual Export** | Available via Supabase Dashboard → Database → Backups |

**Upgrade path:** Moving to Supabase Pro ($25/month) adds:
- Point-in-Time Recovery (PITR) with 7-day granularity
- Daily backups with 30-day retention
- Database health alerts

### Release Binary Backups

| Aspect | Detail |
|--------|--------|
| **Primary Storage** | Cloudflare R2 (`clinicalflow-releases` bucket) |
| **Redundancy** | None — single copy in R2 |
| **R2 Durability** | 99.999999999% (11 nines, S3-compatible) |
| **Mitigation** | If R2 is unavailable, .dmg can be rebuilt from source (`npm run build`) |

**Recommended future addition:** Keep a copy of each release `.dmg` as a GitHub Release artifact for redundancy.

### Stripe Data

Stripe maintains its own data redundancy. Subscription state is mirrored in the `profiles` table via webhooks. If the Supabase database is lost:
- Stripe remains the source of truth for all billing data
- Profiles can be reconstructed from Stripe customer/subscription data
- `subscription_events` audit log would be lost (non-critical — Stripe has its own event history)

### Local User Data

Desktop app data lives entirely on the user's machine:

| Data | Location | Backup |
|------|----------|--------|
| Encrypted config | `config.json` | User responsibility (no cloud sync) |
| Auth tokens | `session.json` | Regenerated on login |
| Session archives | `sessions/archive/` | User responsibility |
| Exported PDFs | `exports/` | User responsibility |

**No server-side storage of clinical data.** This is by design (local-first, privacy-first architecture). Users are responsible for backing up `~/Library/Application Support/com.clinicalflow.ai/`.

### Webhook Endpoint Resilience

| Aspect | Detail |
|--------|--------|
| **Endpoint** | Single Supabase Edge Function (`stripe-webhook`) |
| **Redundancy** | None (single endpoint) |
| **Failure handling** | Stripe retries with exponential backoff for up to 72 hours |
| **Idempotency** | Built-in via `subscription_events.stripe_event_id` UNIQUE constraint |
| **Recovery** | If webhook events are missed, Stripe dashboard allows manual re-delivery |

This is sufficient for launch scale. If the user base grows significantly, consider:
- A dead-letter queue for failed webhook processing
- A periodic reconciliation job that compares Stripe subscription state against `profiles` table

---

## 23. Testing

**Runner:** Vitest (Node environment)

| Test File | Lines | Coverage |
|-----------|-------|----------|
| `dental-chart.test.js` | 13KB | Dental chart rendering, tooth states, surface marking |
| `pure.test.js` | 13KB | Pure utility functions (parsing, formatting, validation) |
| `subscription.test.js` | 10KB | Subscription tier logic, trial dates, status transitions |
| `templates.test.js` | 4KB | Note template rendering |

```bash
npm test          # Run all tests
npm run test:watch  # Watch mode
```

Tests are run locally before committing. No automated test runner in CI (solo project).

---

## 24. File Manifest

### Total File Count by Directory

| Directory | Files | Purpose |
|-----------|-------|---------|
| `src/` | ~25 | Desktop app frontend (vanilla JS modules) |
| `src-tauri/src/` | 8 | Rust backend modules (lib, audio, auth, crypto, license, storage, pms, logging) |
| `src-tauri/binaries/` | 3 | Sidecar executables (whisper-cli, whisper-server, html2pdf) |
| `src-tauri/resources/` | ~8 | Models, corrections dictionaries, fonts |
| `src-tauri/icons/` | 5 | App icons (png, icns, ico) |
| `ClinicalFlowWebsite/` | ~22 | Marketing website (11 HTML pages + CSS + JS + SEO) |
| `supabase/functions/` | 9 | Edge functions (7 functions + 2 shared modules) |
| `supabase/migrations/` | 10 | Database schema (001–010) |
| `chrome-extension/` | 6 | EHR paste extension (not distributed) |
| `tests/` | 4 | Test suite |
| `docs/` | ~5 | Documentation |
| Root | ~8 | Config files |

### Recent Changes (2026-03-02)

**Commits since initial release:**
- `c9ce425` — Harden subscription checks, add Free Demo plan, misc fixes
- `6bb68ff` — Show rate limit messages on signup
- `4d0b52e` — Fix duplicate email check blocking all new signups
- `2b397ee` — Fix duplicate email check to handle null/undefined identities
- `dc2fd3f` — Fix duplicate email signup silently succeeding
- `771abb1` — Add web-based login with Tauri deep links for Google OAuth support
- `74d045c` — Initial commit: ClinicalFlow v1.0.0

### Stripe Setup Checklist (NOT YET DONE)

1. [ ] Create Stripe Products & Prices (Pro $25/$250, Team $19/$190 per seat)
2. [ ] Add webhook endpoint: `https://seuinmmslazvibotoupm.supabase.co/functions/v1/stripe-webhook`
3. [ ] Set Supabase secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, 4 price IDs
4. [ ] Test full checkout flow with Stripe test mode cards

### Database Migration Status

| Migration | Applied? | Description |
|-----------|----------|-------------|
| 001_profiles | Yes | Core profiles table + triggers |
| 002_device_activations | Yes | Device seat tracking |
| 003_subscription_events | Yes | Stripe webhook audit log |
| 004_selected_plan | Yes | Plan selection column + column restriction trigger |
| 005_oauth_email_verified | Yes | Fix OAuth users stuck in pending_verification |
| 006_skip_email_verification | Yes | Start new users in trial, skip email verification |
| 007_fix_remaining_pending | Yes | Bulk-upgrade pending_verification users |
| 008_fix_pending_with_trigger | Yes | Same fix, with trigger disable workaround |
| 009_free_demo_plan | **Pending** | Add `free_demo` to `selected_plan` CHECK constraint |

### Key Environment Variables (Supabase Edge Functions)

| Variable | Status | Purpose |
|----------|--------|---------|
| `SUPABASE_URL` | Auto-set | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-set | Service-role key (bypasses RLS) |
| `SUPABASE_ANON_KEY` | Auto-set | Public anon key |
| `STRIPE_SECRET_KEY` | **Not set** | Stripe API secret |
| `STRIPE_WEBHOOK_SECRET` | **Not set** | Stripe webhook signing secret |
| `STRIPE_PRICE_PRO_MONTHLY` | **Not set** | Stripe price ID |
| `STRIPE_PRICE_PRO_ANNUAL` | **Not set** | Stripe price ID |
| `STRIPE_PRICE_TEAM_MONTHLY` | **Not set** | Stripe price ID |
| `STRIPE_PRICE_TEAM_ANNUAL` | **Not set** | Stripe price ID |
| `LICENSE_ENCRYPTION_KEY` | Set | 64-char hex key for AES-256-GCM license blobs |
| `R2_ENDPOINT` | Set | Cloudflare R2 S3-compatible endpoint |
| `R2_BUCKET` | Set | R2 bucket name (`clinicalflow-releases`) |
| `R2_ACCESS_KEY_ID` | Set | R2 access key |
| `R2_SECRET_ACCESS_KEY` | Set | R2 secret key |

---

*End of infrastructure documentation.*
