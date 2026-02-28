# ClinicalFlow — Claude Code Project Rules

## Security: session.json vs config.json Boundary

**This is a hard rule. Violating it breaks the security model.**

- `session.json` — Encrypted with a compiled-in app key (not PIN-derived). Stores **ONLY**:
  - Supabase auth tokens (access_token, refresh_token)
  - User email
  - License key UUID
  - Encrypted license blob from the server
  - Cached subscription status/tier metadata

- `config.json` — Encrypted with the user's PIN via AES-256-GCM + PBKDF2 (100k iterations). Stores **everything else**:
  - API keys (Deepgram, Anthropic)
  - All application settings
  - Any data that could be considered PHI-adjacent

**NEVER store transcript data, patient information, clinical notes, dental chart data, or any PHI in session.json.** The session.json encryption key is embedded in the binary and provides only at-rest protection against casual disk reads — it is NOT equivalent to PIN-based encryption.

## Build

- Rust cargo: `/Users/aidengolub/.cargo/bin/cargo`
- Dev launch: `cd /Users/aidengolub/Desktop/ClinicalFlowApp && PATH="/Users/aidengolub/.cargo/bin:/usr/local/bin:$PATH" npm run dev`

## Tauri v2 Notes

- `withGlobalTauri: true` must be set in tauri.conf.json
- `use tauri::Manager;` required for `app.get_webview_window()`
- Don't add `?v=X` cache-busting to script tags
