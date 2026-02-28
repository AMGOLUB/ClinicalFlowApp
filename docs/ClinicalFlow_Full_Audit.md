# ClinicalFlow — Comprehensive Application Audit

> **Generated:** 2026-02-26
> **Codebase Version:** 1.0.0
> **Platform:** macOS (Apple Silicon)

---

## Table of Contents

1. [Feature Inventory](#1-feature-inventory)
2. [Technical Specifications](#2-technical-specifications)
3. [Corrections to Prior Understanding](#3-corrections-to-prior-understanding)
4. [Features Not Previously Documented](#4-features-not-previously-documented)
5. [Dependencies & Tech Stack](#5-dependencies--tech-stack)
6. [Pricing-Relevant Details](#6-pricing-relevant-details)
7. [Current Bugs & Known Issues](#7-current-bugs--known-issues)
8. [Welcome Wizard](#8-welcome-wizard)
9. [Demo Mode](#9-demo-mode)
10. [Dental Charting](#10-dental-charting)
11. [Medical & Dental Coding](#11-medical--dental-coding)
12. [Note Templates](#12-note-templates)
13. [Subscription & Licensing](#13-subscription--licensing)
14. [IPC Commands (JS → Rust)](#14-ipc-commands-js--rust)
15. [Performance Data](#15-performance-data)
16. [Hallucination Filtering](#16-hallucination-filtering)
17. [Medical Vocabulary Conditioning](#17-medical-vocabulary-conditioning)
18. [Data Format Schemas](#18-data-format-schemas)
19. [File Storage Structure](#19-file-storage-structure)
20. [Build from Source](#20-build-from-source)
21. [JavaScript Module Map](#21-javascript-module-map)

---

## 1. Feature Inventory

### Transcription Engines (3)

| Feature | Description | Status | Notes |
|---------|-------------|--------|-------|
| Deepgram Nova-3 Medical | Cloud streaming transcription via WebSocket | **Working** | Requires API key, `nova-3-medical` model |
| Whisper (offline) | Local whisper-server HTTP inference, 3s chunks with 0.5s overlap | **Working** | Uses `ggml-small.bin` (multilingual) or `ggml-small.en.bin` |
| Web Speech API | Browser-native fallback transcription | **Working** | Lowest accuracy, no diarization, always available |
| Speaker diarization | Auto-detect speaker changes from Deepgram | **Working** | Online mode only; offline has no diarization |
| Medical vocabulary conditioning | 55+ drug names + anatomy + vitals + dental terms in Whisper prompt | **Working** | Reduces misrecognition of clinical terms |
| Hallucination filtering | Filters Whisper false positives (silence, music, subscribe, etc.) | **Working** | Hardcoded pattern list |
| Live corrections | Regex post-processing of transcription output | **Working** | 82 English + 122 multilingual patterns (6 languages) |
| Multilingual transcription | 37 languages supported across all engines | **Working** | Language passed to Deepgram URL, Whisper `--language` flag, WebSpeech `.lang` |
| Keyterm boosting | Up to 100 medical terms sent to Deepgram as `keyterm` params | **Working** | Drawn from corrections dictionary + medical dictionary |

### AI Note Generation (3 tiers)

| Feature | Description | Status | Notes |
|---------|-------------|--------|-------|
| Cloud AI (Claude) | Claude Haiku 4.5 via Anthropic API streaming | **Working** | Model: `claude-haiku-4-5-20251001`, temp 0.3, max 2048 tokens |
| Local AI (Ollama) | Ollama API streaming | **Working** | Default model: `llama3.1:8b`, configurable, 3 retries |
| Rule-based fallback | Deterministic note generation from transcript keywords | **Working** | No AI required; keyword extraction for vitals, symptoms, medications |
| Two-pass verification | Generate note → audit against transcript for hallucinations | **Working** | Separate verification prompt, temp 0.1, toggleable per engine |
| Multilingual notes | OUTPUT LANGUAGE directive for non-English languages | **Working** | Section headers stay English for parser; clinical content in target language |
| Medical coding (ICD-10 + CPT) | Auto-generate billing codes from note content | **Working** | Max 8 ICD-10, max 4 CPT, confidence levels, E&M level assessment |
| Dental coding (CDT + ICD-10) | Auto-generate dental billing codes with 4 guardrails | **Working** | Depth/severity escalator, structural vs positional trauma, etiology tracking |

### Note Templates (20 built-in)

| Category | Templates |
|----------|-----------|
| **General (3)** | SOAP, HPI-Focused, Problem-Oriented |
| **Behavioral Health (2)** | DAP (Psychiatry), BIRP (Behavioral) |
| **Specialty (10)** | Cardiology, Orthopedics, Pediatrics, OB/GYN, Emergency/Urgent Care, Dermatology, Neurology, Ophthalmology, Wellness/Preventive, Procedure Note |
| **Dental (5)** | General Dental Exam, Periodontal Exam, Endodontic Evaluation, Oral Surgery Consult, Prosthodontic Evaluation |
| **Custom** | User-created templates stored in `ms-custom-templates` |

### Interactive Dental Chart

| Feature | Description | Status | Notes |
|---------|-------------|--------|-------|
| SVG tooth chart | Interactive 32-tooth adult + 20-tooth primary chart | **Working** | Click-to-select with two-tier popup |
| 8 tooth states | Healthy, Decay/Caries, Missing, Restored, Implant, Root Canal, Fracture, Impacted | **Working** | Color-coded per state |
| Surface marking | 5 surfaces per tooth (M/O/D/B/L posterior, M/I/D/F/L anterior) | **Working** | Anatomical validation prevents impossible combinations |
| Adult/primary toggle | Switch between permanent and deciduous dentition | **Working** | |
| AI prompt serialization | Dental findings formatted into AI prompt for note generation | **Working** | |
| AI response parsing | Parse dental findings from generated notes back to chart | **Working** | Acronym protection (FPD, RPD, SDF not treated as surfaces) |
| Export inclusion | Dental chart SVG + findings table in PDF/text exports | **Working** | Toggleable via settings |

### Speaker Management

| Feature | Description | Status | Notes |
|---------|-------------|--------|-------|
| 3 speaker roles | Physician (Dr), Patient (Pt), Other (Ot) | **Working** | Only 3 roles — not Nurse/Specialist/Translator/Family |
| Color-coded entries | Each speaker gets distinct color in transcript | **Working** | |
| Auto-detect changes | Voice activity detection triggers speaker switching | **Working** | 1.5s silence threshold; Deepgram diarization in online mode |

### Security & HIPAA

| Feature | Description | Status | Notes |
|---------|-------------|--------|-------|
| AES-256-GCM encryption | Encrypted config, sessions, archives | **Working** | PBKDF2-HMAC-SHA256 key derivation (100k iterations) |
| PIN authentication | 4–8 digit numeric PIN | **Working** | Argon2id hashing with random salt |
| Auto-lock | Lock after inactivity | **Working** | Default: 5 minutes, configurable via `ms-autolock-minutes` |
| Sanitized logging | No PHI in log files; only message/stack length logged | **Working** | |
| Log rotation | Daily rotating log files, 30-day retention | **Working** | Auto-cleanup on startup |
| Localhost whisper | Whisper-server binds to 127.0.0.1 only | **Working** | No network exposure |
| CSP headers | Strict Content Security Policy in Tauri config | **Working** | Allows only localhost, Deepgram WSS, Anthropic HTTPS, Supabase |
| Atomic file writes | tmp + rename pattern prevents corruption | **Working** | Backup to `.corrupted.TIMESTAMP` on parse failure |
| Hardened runtime | macOS entitlements with hardened runtime | **Working** | Audio input, network client, JIT allowed |

### Export & Archiving

| Feature | Description | Status | Notes |
|---------|-------------|--------|-------|
| PDF export | Native WebKit PDF via html2pdf Swift sidecar | **Working** | Header, sections, disclaimer footer, dental chart if applicable |
| Copy to clipboard | Copy note to clipboard for EHR paste | **Working** | |
| Text file export | Download note as `.txt` with save dialog | **Working** | Filename: `ClinicalFlow_Note_YYYY-MM-DD.txt` |
| Audio download | Download session audio recording | **Working** | WebM/Opus preferred, MP4 fallback |
| Session archiving | Archive full session (transcript + note + audio) | **Working** | Named `YYYY-MM-DD_HH-MM_PatientName` |
| Archive browser | List, load, delete archived sessions | **Working** | Sorted newest-first with size and has_audio flag |

### UI / UX

| Feature | Description | Status | Notes |
|---------|-------------|--------|-------|
| Dark & light themes | CSS custom property theming | **Working** | Dark default (#0B0F14 background) |
| Resizable panels | Drag handle between transcript and note panels | **Working** | |
| Collapsible sidebar | Toggle sidebar visibility | **Working** | |
| Searchable transcript | Debounced search with highlighting | **Working** | Cmd/Ctrl+F |
| Medical term highlighting | 1,300+ terms highlighted in transcript | **Working** | 200+ generic drugs, 150+ brand names, 365+ conditions, 80+ procedures, 200+ anatomy |
| Waveform visualizer | Real-time frequency display during recording | **Working** | 60 FPS, frequency bin → bar height mapping |
| Word count | Live word count display in header | **Working** | |
| Session timer | Running clock during recording | **Working** | MM:SS format |
| Demo mode | Sample encounters for testing | **Working** | Triple-click help button; 2 scenarios: Medical (animated) + Dental (instant) |
| Locale date formatting | Dates formatted per selected language | **Working** | `fmtDate()` and `fmtDT()` use `App.language` |
| Welcome wizard | 5-screen first-launch setup | **Working** | Language → Mode → API keys/Offline check → Ready |
| Subscription gate | License verification with Supabase + Stripe | **Working** | 14-day trial, 30-day offline grace period |

### Keyboard Shortcuts (10)

| Shortcut | Action | Context |
|----------|--------|---------|
| `Cmd/Ctrl+R` | Toggle recording | Always |
| `Cmd/Ctrl+,` | Toggle settings | Always |
| `Cmd/Ctrl+F` | Toggle search | Always |
| `Space` | Toggle recording | Not in input/textarea |
| `P` | Pause/resume | While recording |
| `G` | Generate note | When idle, entries exist |
| `E` | Export PDF | When note generated |
| `N` | New session | Always (confirm if data exists) |
| `T` | Download transcript | When entries exist |
| `Escape` | Close all modals | Always |

---

## 2. Technical Specifications

### Exact Models & Services

| Component | Exact Value |
|-----------|-------------|
| Deepgram model | `nova-3-medical` |
| Whisper model (multilingual) | `ggml-small.bin` (465 MB) |
| Whisper model (English) | `ggml-small.en.bin` (465 MB) |
| Claude model | `claude-haiku-4-5-20251001` |
| Ollama default model | `llama3.1:8b` |
| Whisper implementation | whisper.cpp via whisper-server HTTP sidecar |
| PDF engine | Swift html2pdf sidecar (WebKit `createPDF`) |

### Supported Languages (37)

| Region | Languages |
|--------|-----------|
| English (4) | en-US, en-GB, en-AU, en-IN |
| Romance (8) | es, es-419, fr, it, pt, pt-BR, nl, ro |
| Germanic (4) | de, sv, da, no |
| Asian (10) | ja, ko, zh-CN, zh-TW, hi, ta, te, th, vi, id, ms |
| Slavic (8) | ru, uk, pl, cs, sk, bg, hr, sl |
| Other (3) | ar, he, tr, fi, hu, el |

### Corrections Dictionaries

| Language | Patterns | File |
|----------|----------|------|
| English | 82 | `corrections.json` |
| Spanish | 30 | `corrections-es.json` |
| French | 29 | `corrections-fr.json` |
| German | 21 | `corrections-de.json` |
| Portuguese | 21 | `corrections-pt.json` |
| Italian | 21 | `corrections-it.json` |
| **Total** | **204** | |

### Audio Processing

| Parameter | Value |
|-----------|-------|
| Sample rate | 16,000 Hz (16 kHz mono) |
| Chunk size | 3 seconds (48,000 samples) |
| Overlap | 0.5 seconds |
| Silence threshold | 200 RMS |
| Max session | 4 hours |
| WAV format | 16-bit signed mono |
| WAV flush interval | ~10 seconds |
| Whisper startup timeout | 30 seconds |
| Whisper request timeout | 10 seconds |
| Whisper temperature | 0.0 (deterministic) |
| Whisper threads | `available_parallelism()`, minimum 4 |
| Deepgram keepalive | Every 8 seconds |
| Deepgram utterance end | 1,500 ms silence |

### Encryption

| Parameter | Value |
|-----------|-------|
| Cipher | AES-256-GCM (AEAD) |
| Key derivation | PBKDF2-HMAC-SHA256, 100,000 iterations |
| Salt | 16 bytes (128 bits), random per encryption |
| Nonce | 12 bytes (96 bits), random per encryption |
| PIN hashing | Argon2id (default parameters) |
| PIN length | 4–8 numeric digits |

### Network Requests (Online Mode)

| Endpoint | Protocol | Data Sent |
|----------|----------|-----------|
| `wss://api.deepgram.com/v1/listen` | WebSocket | PCM audio chunks (16-bit, 16kHz, mono) |
| `https://api.anthropic.com/v1/messages` | HTTPS POST | Transcript text + system prompt |
| `http://localhost:11434/api/*` | HTTP | Transcript text (Ollama, local only) |
| `https://*.supabase.co` | HTTPS | Auth tokens, license checks |

### Window Configuration

| Parameter | Value |
|-----------|-------|
| Default size | 1400 × 900 px |
| Minimum size | 1024 × 700 px |
| Background | #0B0F14 |
| macOS minimum | 11.0 |

---

## 3. Corrections to Prior Understanding

| Prior Claim | Correction |
|------------|------------|
| "Deepgram Nova-2 Medical (or Nova-3 Medical?)" | **Nova-3 Medical** (`nova-3-medical` in code) |
| "Whisper (Large V3 Turbo?)" | Search order: large-v3-turbo → small → base → tiny; **currently shipping `ggml-small.bin`** (465 MB). large-v3-turbo is first in search list but not bundled |
| "Medical term post-processing with 40+ regex correction patterns" | **204 total patterns** across 6 languages (82 English + 122 multilingual) |
| "Speaker roles: Doctor, Patient, Nurse, Specialist, Translator, Family Member" | **Only 3 roles**: Physician (Dr), Patient (Pt), Other (Ot). No Nurse/Specialist/Translator/Family |
| "Three note formats: SOAP, HPI-Focused, Problem-Oriented" | **20 built-in templates** across 5 categories (General, Behavioral Health, Specialty, Dental, Preventive) + custom user templates |
| "AES-256-GCM encryption at rest with PBKDF2 key derivation" | Correct, but encryption is **optional** — files can exist unencrypted; automatic migration from plaintext happens on first encrypted read |
| "Auto-lock after inactivity (how many minutes?)" | Default **5 minutes**, configurable via `ms-autolock-minutes` setting |
| "Log rotation and auto-cleanup (after how many days?)" | **30 days** retention |
| "Uses local SQLite database" | **No SQLite** — all storage is JSON files (config.json, active.json, archive/*.json). No database at all |
| "Originally built from a 3-file web prototype (app.js ~2,075 lines, 20 modules)" | Now **17 JavaScript modules**, ~6,065 lines of functional code |
| "Keyboard shortcuts (Space, P, G, E, N, T, Ctrl+F, Cmd+,)" | Also includes **Cmd/Ctrl+R** (toggle recording) and **Escape** (close modals) = 10 total |
| "Medical term highlighting in transcript (60+ conditions, 30+ medications)" | **1,300+ terms**: 200+ generic drugs, 150+ brand names, 365+ conditions, 80+ procedures, 200+ anatomy terms |
| "Platform Support: Windows, Linux" | **macOS only** currently. Windows and Linux are future plans — only macOS sidecars (aarch64-apple-darwin) are built. Tauri config bundles DMG only |

---

## 4. Features Not Previously Documented

| Feature | Description |
|---------|-------------|
| **Interactive dental chart** | Full SVG dental chart with 8 tooth states, 5-surface marking, adult/primary toggle, AI prompt serialization and response parsing |
| **5 dental note templates** | General Dental Exam, Periodontal Exam, Endodontic Evaluation, Oral Surgery Consult, Prosthodontic Evaluation |
| **Dental coding engine** | CDT (D-codes) + dental ICD-10 coding with 4 guardrails (depth/severity escalator, structural vs positional trauma, etiology of absence) |
| **Medical coding engine** | ICD-10 + CPT + E&M level assessment from note content |
| **Subscription/licensing system** | Supabase auth + Stripe checkout, 14-day trial, 30-day offline grace, license key management, billing portal |
| **20 specialty note templates** | Including Behavioral Health (DAP, BIRP), Cardiology, Orthopedics, Pediatrics, OB/GYN, Emergency, Dermatology, Neurology, Ophthalmology, Wellness, Procedure Note |
| **Custom template builder** | Users can create and save custom note templates |
| **Demo mode with 2 scenarios** | Medical encounter (Mr. Robinson, diabetes + knee pain, animated playback) and Dental encounter (Ms. Ramirez, caries + endo failure, instant) |
| **37-language support** | Full pipeline: transcription + note generation + corrections + UI locale |
| **Whisper-server architecture** | HTTP POST per chunk (not CLI-per-chunk), keeps model loaded in memory, dramatically faster |
| **Medical vocabulary prompt** | 55+ drug names + anatomy + vitals + dental terms conditioned into Whisper for better recognition |
| **Hallucination filtering** | Automated detection of Whisper false positives (YouTube artifacts, silence markers, background sounds) |
| **PIN reset (full wipe)** | Reset PIN destroys all data: config, sessions, archives, auth |
| **Plaintext-to-encrypted migration** | Automatic migration of old unencrypted files on first encrypted read |
| **System memory check** | `check_system_memory` command returns total/available/used% for health monitoring |
| **Startup health logging** | Logs OS, memory, config paths, session/archive/log counts on every launch |

---

## 5. Dependencies & Tech Stack

### Rust Crates (Cargo.toml)

| Crate | Version | Purpose |
|-------|---------|---------|
| tauri | 2.x | Core framework |
| tauri-plugin-shell | 2.x | Sidecar execution |
| tauri-plugin-fs | 2.x | File system access |
| tauri-plugin-dialog | 2.x | Save dialogs |
| tauri-plugin-http | 2.x | HTTP requests |
| tauri-plugin-notification | 2.x | Notifications |
| cpal | 0.15 | Cross-platform audio I/O |
| hound | 3.5 | WAV reading/writing |
| tokio | 1.x (full) | Async runtime |
| serde + serde_json | 1.x | Serialization |
| aes-gcm | 0.10 | AES-256-GCM encryption |
| argon2 | 0.5 | PIN hashing |
| pbkdf2 | 0.12 | Key derivation |
| sha2 | 0.10 | SHA-256 |
| rand | 0.8 | Cryptographic RNG |
| base64 | 0.22 | Encoding |
| chrono | 0.4 | Timestamps |
| dirs | 6.x | Platform directories |
| reqwest | 0.12 | HTTP client (multipart) |
| tracing + subscriber + appender | 0.1/0.3/0.2 | Structured logging |
| sysinfo | 0.31 | System information |

### JavaScript Dependencies (package.json)

| Package | Version | Purpose |
|---------|---------|---------|
| @tauri-apps/api | 2.x | Tauri JS bridge |
| @tauri-apps/cli | ^2.10.0 | Dev/build CLI |
| vitest | ^4.0.18 | Test framework |

### External Services

| Service | Purpose | Required? |
|---------|---------|-----------|
| Deepgram API | Cloud transcription | Online mode only |
| Anthropic API | Cloud AI notes (Claude) | Cloud AI only |
| Ollama (localhost) | Local AI notes | Offline AI only |
| Supabase | Auth + license management | Subscription checks |
| Stripe | Payment processing | Via Supabase integration |

### Sidecar Binaries

| Binary | Size | Purpose |
|--------|------|---------|
| whisper-server | 3.44 GB | Local transcription server |
| whisper-cli | 3.03 GB | CLI transcription (legacy, kept as fallback) |
| html2pdf | 61.8 KB | Swift WebKit PDF generator |

### System Requirements

| Requirement | Online Mode | Offline Mode |
|-------------|-------------|--------------|
| OS | macOS 11.0+ | macOS 11.0+ |
| RAM | 4 GB minimum | 8 GB recommended (Whisper + Ollama) |
| Disk | ~1 GB (app + models) | ~8 GB (app + models + Ollama models) |
| Internet | Required | Not required |
| Microphone | Required | Required |

---

## 6. Pricing-Relevant Details

### What Costs Money

| Component | Cost | Notes |
|-----------|------|-------|
| Deepgram Nova-3 Medical | ~$0.0059/min (pay-as-you-go) | Free tier: $200 credit |
| Claude Haiku 4.5 | ~$0.001–0.003/note (input + output) | ~1500 tokens input, ~800 tokens output per note |
| Ollama | Free (local) | Requires user to download models (~4–8 GB) |
| Whisper | Free (bundled) | Model ships with app |
| Rule-based | Free | No external calls |

### Per-Encounter Cost Estimates

| Configuration | Approximate Cost | Notes |
|---------------|-----------------|-------|
| Online (Deepgram + Claude) | ~$0.10–0.15/encounter | 15-min encounter + 2-pass note generation |
| Online (Deepgram + Ollama) | ~$0.09/encounter | Transcription only costs money |
| Offline (Whisper + Ollama) | $0.00 | Fully free, no API calls |
| Offline (Whisper + Claude) | ~$0.003/encounter | Only note generation costs |

### Storage Requirements

| Usage Pattern | Storage/Month |
|---------------|---------------|
| Light (5 encounters/day) | ~500 MB (JSON + WAV) |
| Medium (15 encounters/day) | ~1.5 GB |
| Heavy (30 encounters/day) | ~3 GB |

---

## 7. Current Bugs & Known Issues

| Issue | Severity | Details |
|-------|----------|---------|
| **macOS only** | High | Windows and Linux builds do not exist. Only aarch64-apple-darwin sidecars are compiled. Do NOT advertise cross-platform support |
| **Intel Mac untested** | Medium | Only ARM64 (Apple Silicon) sidecars are built. Intel Macs would need x86_64 sidecars compiled |
| **App unsigned** | High | No code signing identity configured (`signingIdentity: null`). macOS Gatekeeper will block installation for other users |
| **No speaker diarization offline** | Medium | Whisper has no diarization. Only Deepgram (online) provides speaker detection |
| **PIN entropy is low** | Low | 4–8 numeric digits = max 10^8 keyspace. Adequate for casual protection, not for determined attackers |
| **No PIN rate limiting** | Low | No lockout after failed attempts |
| **No PIN change** | Low | Users must "Reset PIN" (wipes all data) to change PIN |
| **Large app size** | Medium | Sidecars are ~6.5 GB total. Final DMG will be very large |
| **whisper-cli still bundled** | Low | Legacy 3 GB binary still ships but whisper-server is used instead. Could be removed to save space |
| **4-hour max session** | Low | Hardcoded in `MAX_SESSION_SAMPLES`. Long procedures may hit limit |
| **No HIPAA BAA** | High | Using Deepgram/Claude APIs without BAAs is not HIPAA-compliant for production use with real patient data |
| **Hallucination filter is fragile** | Low | Hardcoded string patterns; new Whisper hallucinations may not be caught |
| **30-day log retention** | Info | May be insufficient for some compliance requirements (HIPAA suggests 6 years) |
| **Web Speech fallback** | Low | Very low accuracy, no punctuation, no diarization. Exists as emergency fallback only |
| **Subscription gate bypassable** | Medium | Supabase environment variables can be empty to skip subscription checks entirely |

---

## 8. Welcome Wizard

**5 screens** (one conditional branch at step 3):

| Screen | Step Label | Title | User Choices |
|--------|-----------|-------|-------------|
| `wizScreen1` | *(none — intro)* | "Welcome to ClinicalFlow" | "Get Started" button only |
| `wizScreenLang` | Step 1 of 4 | "Choose Your Language" | Language dropdown (37 languages from LANGUAGES array) |
| `wizScreen2` | Step 2 of 4 | "Choose Your Mode" | Two selectable cards: **Online** (Deepgram+Claude, "Recommended") or **Offline** (Whisper+Ollama, "Privacy-first") |
| `wizScreen3a` | Step 3 of 4 | "Online Setup" | Deepgram API key input + test button, Claude API key input + test button |
| `wizScreen3b` | Step 3 of 4 | "Offline Setup" | Whisper status (bundled, ready), Ollama connection check + test button |
| `wizScreen4` | Step 4 of 4 | "You're All Set!" | Keyboard shortcut tips, "Start Using ClinicalFlow" button |

**Navigation flow:** Screen1 → ScreenLang → Screen2 → Screen3a *or* Screen3b (based on mode) → Screen4

**Persisted on completion:**

- `ms-tx-mode` — online or offline
- `ms-ai-engine` — cloud or ollama
- `ms-language` — BCP-47 code (e.g., `en-US`)
- `ms-dg-key` — Deepgram API key (if entered)
- `ms-claude-key` — Claude API key (if entered)
- Backend `welcomeCompleted: true` flag in auth.json

---

## 9. Demo Mode

**Activation:** Triple-click the Help button (3 clicks within 400ms). Opens a picker modal with 2 cards.

### Medical Demo

- **Patient:** James Robinson
- **Doctor:** Dr. Patel
- **Other speaker:** Maria (MA — Medical Assistant)
- **Entries:** ~24 transcript entries
- **Conditions:** Type 2 Diabetes (blood sugar 160–230), Hypertension (BP 142/88), Peripheral Neuropathy (tingling feet), Left Knee Osteoarthritis
- **Medications:** Glipizide 5mg added, Metformin continued, Naproxen 220mg prescribed
- **Plan:** A1C + CMP labs, monofilament exam, PT referral, cortisone injection option, 6-week follow-up
- **Rendering:** `runDemoAnimated()` — word-by-word playback with waveform animation and running timer

### Dental Demo

- **Patient:** Ms. Ramirez
- **Doctor:** Dr. Chen
- **Entries:** 15 transcript entries
- **Findings:** MOD caries #3, DO caries #30 (approaching pulp), Endodontic failure #19, Impacted #1, Missing #14, PFM crown #19, 5mm pockets on #19
- **Medical history:** Type 2 diabetes (A1C 7.2%), nickel allergy, metformin 1000mg
- **Plan:** 4-phase treatment (SRP, composites, endo retreatment referral, implant consult)
- **Rendering:** `runDemoInstant()` — all entries loaded at once, dental chart auto-populated from transcript, auto-selects `dental_general` template

| Aspect | Medical | Dental |
|--------|---------|--------|
| Rendering | Animated (word-by-word) | Instant (all at once) |
| Wave Animation | Yes | No |
| Speakers | 3 (doctor, patient, MA) | 2 (doctor, patient) |
| Entries | ~24 | 15 |
| Dental Chart | Not used | Auto-populated |
| Template | Default (SOAP) | `dental_general` (auto-selected) |

---

## 10. Dental Charting

### Accessing the Dental Chart

When any dental template is selected (`dental_general`, `dental_periodontal`, etc.), a "Dental Chart" section appears in the sidebar with an **"Edit Chart"** button. Clicking opens a full-screen modal.

### 8 Tooth States

| State | Label | Hex Color | Visual |
|-------|-------|-----------|--------|
| `healthy` | Healthy | `#34D399` | Green |
| `decay` | Decay/Caries | `#F87171` | Red |
| `missing` | Missing | `#64748B` | Gray (40% opacity) |
| `restored` | Restored | `#60A5FA` | Blue |
| `implant` | Implant | `#A78BFA` | Purple |
| `rct` | Root Canal | `#FBBF24` | Amber |
| `fracture` | Fracture | `#FB923C` | Orange |
| `impacted` | Impacted | `#E879F9` | Magenta |

### Surface Marking (User Flow)

1. **Click a tooth** in the SVG chart → Tier 1 popup appears
2. **Select a state** from 8 color-coded chip buttons
3. If state is `decay`, `restored`, or `fracture` → **Tier 2 surfaces appear** below
4. Click surface buttons to toggle on/off:
   - **Posterior teeth** (molars/premolars): M, O, D, B, L
   - **Anterior teeth** (canines/incisors): M, I, D, F, L
5. Click outside popup to close — selection saved

### Tooth Numbering (ADA Universal)

**Adult (1–32):**

```
UPPER ARCH:
  1  2  3  4  5  6  7  8  |  9 10 11 12 13 14 15 16
  3rd molar → central incisor | central incisor → 3rd molar
  (right)                     | (left)

LOWER ARCH:
 32 31 30 29 28 27 26 25  | 24 23 22 21 20 19 18 17
  3rd molar → central incisor | central incisor → 3rd molar
  (right)                     | (left)
```

**Primary (A–T):** Upper A→J, Lower K→T (20 teeth total)

### AI Integration

`formatDentalChartForPrompt()` serializes the chart:

```
DENTAL CHART FINDINGS:
Dentition: Adult (Permanent)
Tooth #3: Decay/Caries — Surfaces: MOD
Tooth #19: Root Canal
Tooth #30: Decay/Caries — Surfaces: DO
```

### Acronym Protection

When parsing AI notes back to the chart, these acronyms are masked to prevent false surface detection:

**FPD** (Fixed Partial Denture), **RPD** (Removable Partial Denture), **ZOE** (Zinc Oxide Eugenol), **FGC** (Full Gold Crown), **PFM** (Porcelain Fused to Metal), **MTA** (Mineral Trioxide Aggregate), **SDF** (Silver Diamine Fluoride), **BOP** (Bleeding On Probing), **CAL** (Clinical Attachment Loss), **TMD** (Temporomandibular Disorder), **TMJ** (Temporomandibular Joint), **GBI** (Gingival Bleeding Index), **OHI** (Oral Hygiene Index), **DI** (Debris Index), **CI** (Calculus Index), **CEJ** (Cementoenamel Junction), **PDL** (Periodontal Ligament), **IPR** (Interproximal Reduction)

---

## 11. Medical & Dental Coding

### Where Codes Appear

`#codingPanel` appears below the generated note sections. Shows read-only cards with colored confidence badges.

### Trigger

Automatic after note generation when `App.settings.autoCoding === true`. Not a separate user action.

### Confidence Levels

- **High:** Strong, specific documentation supports this code
- **Medium:** Documentation supports but lacks some specificity
- **Low:** Code is inferred from context; documentation is indirect

### Medical Coding

- Max 8 ICD-10-CM codes + max 4 CPT codes + E&M level (1–5) with MDM complexity
- Uses real, valid ICD-10-CM and CPT codes only
- E&M based on: number of problems, data complexity, risk of morbidity/mortality

### Dental Coding — 4 Guardrails

**1. STRICT DOMAIN GATE:** Only CDT D-codes and dental ICD-10 allowed. Strictly forbidden from outputting CPT codes (00100–99499), E&M levels, or non-dental codes. Every procedure code must begin with "D".

**2. DEPTH & SEVERITY ESCALATOR:** Never default to shallowest/generic code. Caries: if "approaching pulp"/"deep caries"/"pulpal involvement" → escalate to K04.0/K04.1, not K02.51. Periodontal: if "bone loss"/"deep pockets >5mm"/"furcation involvement" → escalate from K05.10 to K05.311+. Always select deepest anatomical penetration documented.

**3. STRUCTURAL vs POSITIONAL TRAUMA:** Classify every injury into exactly one track:
- **Track A (structural failure):** cracked/fractured → K03.81, S02.5XXA, D2740, D7140
- **Track B (positional displacement):** loosened/luxated → S03.2XXA, M26.30, D7270, D4921
- Never assign codes from both tracks to same tooth.

**4. ETIOLOGY OF ABSENCE:** For every missing tooth, determine reason. Default to **acquired** (K08.111–K08.409) unless text explicitly states "never formed"/"congenitally absent"/"agenesis"/"hypodontia" → then congenital (K00.0).

### User Editing

Read-only display with copy-to-clipboard. No direct editing of suggested codes in the UI.

---

## 12. Note Templates

### General (3)

| Key | Name | Sections |
|-----|------|----------|
| `soap` | SOAP Notes | Subjective, Objective, Assessment, Plan |
| `hpi` | HPI-Focused | Patient Demographics, Chief Complaint, History of Present Illness, Review of Systems, Physical Examination, Assessment & Plan |
| `problem` | Problem-Oriented | Visit Overview, Problem 1 (SOAP per problem), Medications Summary, Follow-Up |

### Behavioral Health (2)

| Key | Name | Sections |
|-----|------|----------|
| `dap` | DAP Note (Psychiatry) | Data, Assessment, Plan |
| `birp` | BIRP Note (Behavioral) | Behavior, Intervention, Response, Plan |

### Specialty (10)

| Key | Name | Sections |
|-----|------|----------|
| `cardiology` | Cardiology | Cardiac History, Cardiovascular Examination, Diagnostics, Assessment, Plan |
| `orthopedics` | Orthopedics | History, Musculoskeletal Examination, Imaging, Assessment, Plan |
| `pediatrics` | Pediatrics | Growth & Development, History, Physical Examination, Assessment, Plan |
| `obgyn` | OB/GYN | OB/GYN History, Physical Examination, Labs & Studies, Assessment, Plan |
| `emergency` | Emergency / Urgent Care | Triage, History of Present Illness, Physical Examination, Medical Decision Making, Disposition |
| `dermatology` | Dermatology | History, Lesion Description, Assessment, Plan |
| `neurology` | Neurology | Neurological History, Neurological Examination, Diagnostic Studies, Assessment, Plan |
| `ophthalmology` | Ophthalmology | Ophthalmic History, Examination, Assessment, Plan |
| `wellness` | Preventive / Wellness | Preventive Health, Health Screening, Physical Examination, Counseling & Education, Plan |
| `procedure` | Procedure Note | Pre-Procedure, Procedure, Findings, Post-Procedure |

### Dental (5)

| Key | Name | Sections |
|-----|------|----------|
| `dental_general` | General Dental Exam | Chief Complaint, Dental History, Extraoral Examination, Intraoral Examination, Radiographic Findings, Dental Chart Findings, Assessment, Treatment Plan |
| `dental_periodontal` | Periodontal Exam | Chief Complaint, Periodontal History, Periodontal Examination, Radiographic Findings, Dental Chart Findings, Assessment, Treatment Plan |
| `dental_endodontic` | Endodontic Evaluation | Chief Complaint, Endodontic History, Diagnostic Testing, Radiographic Findings, Dental Chart Findings, Assessment, Treatment Plan |
| `dental_oral_surgery` | Oral Surgery Consult | Chief Complaint, Surgical History, Clinical Examination, Radiographic Findings, Dental Chart Findings, Assessment, Surgical Plan |
| `dental_prosthodontic` | Prosthodontic Eval | Chief Complaint, Prosthodontic History, Clinical Examination, Radiographic Findings, Dental Chart Findings, Assessment, Treatment Plan |

### Template Selection

Dropdown (`#formatSelector`) in sidebar, grouped by category. Also changeable in Settings.

### Custom Templates

Click "+ Custom Template" button → provide name, section names, custom AI prompt → stored in `ms-custom-templates` config key as JSON array.

---

## 13. Subscription & Licensing

| Detail | Value |
|--------|-------|
| **Trial duration** | 14 days |
| **Trial expiration** | Shows subscription gate with upgrade options |
| **Offline grace period** | 30 days — if network verification fails but last verified within 30 days, cached status is trusted |
| **Verification interval** | Every 7 days maximum |
| **Verification endpoint** | `POST ${SUPABASE_URL}/functions/v1/verify-license` |
| **Stripe plans** | `pro_monthly` ($79/mo), `pro_annual` ($790/yr — saves $158) |
| **Default seats** | 3 per checkout |
| **Checkout flow** | POST to `/functions/v1/create-checkout` → opens Stripe URL → polls verify-license every 5s (max 60 attempts) |
| **Billing portal** | POST to `/functions/v1/customer-portal` → opens Stripe management URL |
| **Token refresh** | `POST /auth/v1/token?grant_type=refresh_token` |

### Subscription States

| State | UI Treatment | Valid? |
|-------|-------------|--------|
| `none` | Shows signup/login gate | No |
| `trial` | Full app access, shows days remaining | Yes |
| `active` | Full app access | Yes |
| `past_due` | Full app access (temporary), payment warning | Yes |
| `expired` | Locked gate with upgrade options | No |
| `unknown` | Uses cached status if within grace period | Depends |

### Gate Modes

- **`'auth'`** — Shows login/signup tabs
- **`'expired'`** — Shows upgrade form with plan cards and dynamic title

### Config Keys

`ms-license-key`, `ms-supabase-token`, `ms-supabase-refresh`, `ms-supabase-email`, `ms-sub-status`, `ms-sub-tier`, `ms-sub-verified`, `ms-sub-reason`, `ms-sub-days-left`, `ms-trial-ends`, `ms-sub-ends`

**Note:** Subscription gate is only active if `window.ENV.SUPABASE_URL` is set and doesn't start with `__`. Can be disabled by leaving env vars empty.

---

## 14. IPC Commands (JS → Rust)

**26 total Tauri commands:**

### Authentication (8)

| Command | Parameters | Returns |
|---------|------------|---------|
| `check_has_pin` | — | bool |
| `check_welcome_completed` | — | bool |
| `set_welcome_completed` | — | — |
| `create_pin` | `{pin}` | — |
| `authenticate` | `{pin}` | bool |
| `update_activity` | — | — |
| `lock_app` | — | — |
| `reset_pin` | — | — |

### Recording (5)

| Command | Parameters | Returns |
|---------|------------|---------|
| `start_recording` | `{mode, language}` | — |
| `stop_recording` | — | string (WAV path) |
| `pause_recording` | — | — |
| `resume_recording` | — | — |
| `check_system_memory` | — | `{total_gb, available_gb, used_percent}` |

### Configuration (3)

| Command | Parameters | Returns |
|---------|------------|---------|
| `load_config_encrypted` | — | JSON string |
| `save_config_encrypted` | `{configJson}` | — |
| `load_corrections` | `{language}` | JSON array |

### Session Management (7)

| Command | Parameters | Returns |
|---------|------------|---------|
| `save_session_encrypted` | `{sessionJson}` | — |
| `load_session_encrypted` | — | JSON string |
| `clear_session` | — | — |
| `archive_session_encrypted` | `{sessionJson}` | — |
| `load_archived_session_encrypted` | `{filename}` | JSON string |
| `list_archived_sessions` | — | array |
| `delete_archived_session` | `{filename}` | — |

### Export (2)

| Command | Parameters | Returns |
|---------|------------|---------|
| `generate_pdf` | `{html}` | — |
| `save_text_file` | `{path, content}` | — |

### Logging (2)

| Command | Parameters | Returns |
|---------|------------|---------|
| `log_frontend_error` | `{message, stack}` | — |
| `log_startup_info` | — | — |

---

## 15. Performance Data

| Metric | Value |
|--------|-------|
| Whisper chunk processing | 3s audio chunks; warning if > 1.5× chunk duration (> 4.5s) |
| Whisper startup timeout | 30 seconds for model loading |
| Whisper request timeout | 10 seconds per chunk |
| Note generation timeout | 120 seconds (2 minutes) |
| Max session duration | 4 hours (16000 × 60 × 60 × 4 = 230.4M samples) |
| WAV flush interval | Every ~10 seconds (160,000 samples) |
| Session auto-save debounce | 500ms |
| Auto-lock default | 5 minutes (page hidden: 60 seconds) |
| Deepgram keepalive | Every 8 seconds |
| Deepgram utterance end | 1,500ms silence |
| Whisper silence threshold | 200 RMS (chunks below this skipped) |
| Whisper processing loop | 250ms check interval |

No formal benchmarks are recorded in the codebase for cold start time or memory usage during recording.

---

## 16. Hallucination Filtering

**Function:** `is_hallucination(text)` in audio.rs — **not configurable** (hardcoded Rust const).

### Patterns Caught

**Whisper meta-tags:**
`[blank_audio]`, `(silence)`, `(blank audio)`, `(no audio)`

**Background sounds:**
`(music)`, `(music playing)`, `(laughter)`, `(laughing)`, `(sighing)`, `(coughing)`, `(breathing)`, `(clapping)`, `(footsteps)`, `(wind blowing)`, `(birds chirping)`

**Audience reactions:**
`(audience applauding)`, `(audience laughing)`, `(applause)`

**YouTube/social media artifacts:**
`subscribe`, `like and subscribe`, `click the bell`, `please subscribe`, `hit the like button`, `thank you for watching`, `thanks for watching`, `thanks for listening`

**Generic filler:**
`thank you.`, `goodbye.`, `bye.`, `bye-bye.`, `see you next time.`, `the end.`, `that's it.`, `that's all.`, `we're done.`, `you`, `so,`, `okay.`

**Structural patterns:**
- Any fully parenthesized string `(anything)`
- Repeated single word/phrase (1–3 words, all identical)
- Empty or whitespace-only output

---

## 17. Medical Vocabulary Conditioning

The `MEDICAL_PROMPT` constant in audio.rs is passed to whisper-server via the `--prompt` flag. It conditions Whisper to recognize clinical terminology.

### Term Categories

| Category | Count | Examples |
|----------|-------|---------|
| Medications | 62 | metformin, lisinopril, atorvastatin, gabapentin, warfarin, apixaban, alprazolam |
| Conditions | 80+ | hypertension, atrial fibrillation, diabetes mellitus, COPD, osteoarthritis, neuropathy, DVT |
| Anatomy | 21 | cervical, thoracic, lumbar, bilateral, anterior, posterior, lateral, medial |
| Vitals | 9 | systolic, diastolic, blood pressure, heart rate, SpO2, BMI, temperature |
| Labs | 12 | A1c, CBC, BMP, CMP, TSH, lipid panel, creatinine, BUN, eGFR, ALT, AST |
| Dental | 35+ | caries, periodontitis, mesial, occlusal, buccal, endodontic, pulpitis, malocclusion |

**Not user-configurable.** Changing requires editing audio.rs and recompiling.

---

## 18. Data Format Schemas

### Session (active.json / archive/*.json)

```json
{
  "entries": [
    {
      "id": 1,
      "spkId": 1,
      "spkName": "Dr. Patel",
      "spkRole": "doctor",
      "spkColor": "doctor",
      "text": "Let me get your vitals...",
      "ts": 45,
      "conf": 0.98
    }
  ],
  "speakers": [
    {
      "id": 1,
      "name": "Dr. Patel",
      "role": "doctor",
      "cc": "doctor",
      "speaking": false,
      "wc": 1250
    }
  ],
  "nextEntryId": 42,
  "nextSpkId": 3,
  "activeSpkId": 1,
  "elapsed": 1850,
  "sessionStartTime": "2026-02-23T18:45:00.000Z",
  "noteFormat": "soap",
  "noteSections": {
    "SUBJECTIVE": "Chief Complaint: ...",
    "OBJECTIVE": "Vital Signs: ...",
    "ASSESSMENT": "...",
    "PLAN": "..."
  },
  "codingResults": {
    "icd10": [{"code": "E11.65", "description": "...", "confidence": "high"}],
    "cpt": [{"code": "99214", "description": "...", "confidence": "high"}],
    "emLevel": {"level": "4", "mdm": "Moderate", "confidence": "medium"}
  },
  "dentalChart": {
    "mode": "adult",
    "teeth": {
      "3": {"state": "decay", "surfaces": {"M": "decay", "D": "decay"}},
      "19": {"state": "rct", "surfaces": {}}
    }
  },
  "savedAt": "2026-02-23T18:50:30.000Z"
}
```

### Config (config.json)

Flat key-value map with `ms-*` prefix convention:

```json
{
  "ms-language": "en-US",
  "ms-theme": "dark",
  "ms-tx-mode": "online",
  "ms-ai-engine": "cloud",
  "ms-note-format": "soap",
  "ms-dg-key": "...",
  "ms-claude-key": "sk-ant-...",
  "ms-ollama-url": "http://localhost:11434",
  "ms-ollama-model": "llama3.1:8b",
  "ms-ollama-verify": "0",
  "ms-claude-verify": "1",
  "ms-autolock-minutes": "5",
  "ms-settings-autoScroll": "1",
  "ms-settings-timestamps": "1",
  "ms-settings-autoDetect": "1",
  "ms-settings-highlightTerms": "0",
  "ms-settings-autoCoding": "1",
  "ms-settings-dentalChartInExport": "1",
  "ms-settings-dentalFindingsInExport": "1",
  "ms-custom-templates": "[]"
}
```

### Auth (auth.json) — PLAINTEXT, never encrypted

```json
{
  "pinHash": "$argon2id$v=19$m=19456,t=2,p=1$...",
  "welcomeCompleted": true
}
```

### Corrections (corrections.json)

```json
[
  {"pattern": "\\bglycide\\b", "flags": "gi", "replacement": "glipizide"},
  {"pattern": "\\bmetforeman\\b", "flags": "gi", "replacement": "metformin"}
]
```

---

## 19. File Storage Structure

```
~/Library/Application Support/com.clinicalflow.ai/
├── auth.json                      [PLAINTEXT] PIN hash + welcome flag
├── config.json                    [ENCRYPTED] All settings & API keys
├── sessions/
│   ├── active.json               [ENCRYPTED] Current session
│   └── archive/
│       ├── 2026-02-23_18-45_PatientName.json  [ENCRYPTED]
│       └── 2026-02-23_18-45_PatientName.wav   [BINARY, not encrypted]
├── exports/
│   ├── ClinicalFlow_Note_2026-02-23_18-50.pdf
│   ├── ClinicalFlow_Transcript_2026-02-23.txt
│   └── _temp_note.html           [temporary, deleted after PDF]
└── logs/
    ├── clinicalflow-2026-02-23.log
    └── (cleaned up after 30 days)
```

### What IS Encrypted

- `config.json` (API keys, settings)
- `sessions/active.json` (current session)
- `sessions/archive/*.json` (archived sessions)

### What IS NOT Encrypted

- `auth.json` (PIN hash — needed before decryption is possible)
- `sessions/archive/*.wav` (raw audio recordings)
- `exports/*.pdf`, `exports/*.txt` (user-exported files)
- `logs/*.log` (diagnostic logs — contain no PHI)

### Encryption Format

```
[16 bytes salt] [12 bytes nonce] [ciphertext with GCM auth tag]
```

Total overhead: 28 bytes per encrypted file.

---

## 20. Build from Source

### Prerequisites

- Node.js 18+
- Rust 1.77.2+ (via rustup)
- Xcode Command Line Tools
- macOS 11.0+

### Commands

```bash
cd /Users/aidengolub/Desktop/ClinicalFlowApp
npm install                                              # first time only
PATH="~/.cargo/bin:/usr/local/bin:$PATH" npm run dev     # dev mode
PATH="~/.cargo/bin:/usr/local/bin:$PATH" npm run build   # production DMG
```

### NPM Scripts

| Script | Command |
|--------|---------|
| `dev` | `tauri dev` |
| `build` | `tauri build` |
| `test` | `vitest run` |
| `test:watch` | `vitest watch` |

### Build Output

- **App Bundle:** `src-tauri/target/release/bundle/macos/ClinicalFlow.app`
- **DMG:** `src-tauri/target/release/bundle/macos/ClinicalFlow.dmg`

### Key Build Notes

- `withGlobalTauri: true` must be set in tauri.conf.json (required for vanilla JS)
- Tauri CLI version: `@tauri-apps/cli` ^2.10.0
- C++ compilation may require: `-isystem /Library/Developer/CommandLineTools/SDKs/MacOSX.sdk/usr/include/c++/v1`

---

## 21. JavaScript Module Map

| Module | Lines | Purpose |
|--------|-------|---------|
| `app.js` | 586 | Entry point, keyboard shortcuts, demo mode |
| `state.js` | 276 | Shared state, config manager, Tauri bridge |
| `auth.js` | 399 | PIN lock, welcome wizard, auto-lock |
| `audio.js` | 151 | Audio I/O, Deepgram/Whisper/WebSpeech engines |
| `recording.js` | 92 | Recording lifecycle & UI updates |
| `transcript.js` | 72 | Entry rendering, search, corrections |
| `speakers.js` | 32 | Speaker management & color assignment |
| `notes.js` | 937 | Note generation, rendering, export, coding |
| `templates.js` | 948 | Template registry, coding prompts |
| `dental-chart.js` | 759 | Interactive SVG dental chart, AI parsing |
| `settings.js` | 341 | Settings UI, Ollama integration, API keys |
| `ui.js` | 117 | DOM utilities, modals, toast notifications |
| `pure.js` | 118 | Pure functions (testable, no side effects) |
| `subscription.js` | 569 | Supabase auth, license gating, Stripe |
| `medical-dictionary.js` | 382 | 1,300+ medical term database |
| `languages.js` | 83 | 37 languages with Whisper code mapping |
| `env.js` | 6 | Environment config (Supabase URLs) |
| **Total** | **~6,065** | **17 modules** |

### Rust Modules (src-tauri/src/)

| Module | Lines | Purpose |
|--------|-------|---------|
| `lib.rs` | ~96 | App setup, command registration, dev tools |
| `audio.rs` | ~1013 | Audio capture, whisper-server, processing loop |
| `storage.rs` | ~749 | File I/O, sessions, archives, PDF export, logging |
| `auth.rs` | ~216 | PIN hashing, authentication, app lock |
| `crypto.rs` | ~84 | AES-256-GCM encryption/decryption |
| `logging.rs` | ~43 | Tracing setup, daily rotation |
| **Total** | **~2,200** | **6 modules** |

### Test Suites

| File | Lines | Coverage |
|------|-------|---------|
| `tests/pure.test.js` | 382 | Formatting, corrections, note parsing, medical highlighting |
| `tests/dental-chart.test.js` | 336 | Tooth states, surfaces, AI parsing, acronym protection |
| `tests/templates.test.js` | — | Template registry, section validation |

**Test framework:** Vitest 4.0.18 with Node environment

---

## Appendix: Complete Codebase Stats

| Metric | Value |
|--------|-------|
| JavaScript modules | 17 |
| JavaScript LOC | ~6,065 |
| Rust modules | 6 |
| Rust LOC | ~2,200 |
| CSS | 116 KB |
| HTML | 80 KB |
| Note templates | 20 built-in |
| Correction patterns | 204 (6 languages) |
| Medical dictionary terms | 1,300+ |
| Supported languages | 37 |
| Tauri IPC commands | 26 |
| Keyboard shortcuts | 10 |
| Tooth states | 8 |
| Speaker roles | 3 |
| Sidecar binaries | 3 |
| Whisper models | 2 (small + small.en, 465 MB each) |
