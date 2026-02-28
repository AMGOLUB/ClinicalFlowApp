# ClinicalFlow — Phase 8: Polish & Harden

## Philosophy

The app already looks great. This phase is about removing every leftover web-app artifact, making the desktop experience feel seamless, and adding small professional touches. No redesign — just consistency, cleanup, and details that signal quality.

**Prerequisites:** Phases 1-7 complete. App builds and runs as a signed desktop app.

**Rule:** If it already works and looks good, don't touch it.

---

## 1. Audit & Remove Web-App Leftovers

Open the app and go through every screen with fresh eyes. Tell Claude Code to fix anything that still references the browser era.

### 1.1 Strings to Find and Replace

Search the entire codebase (app.js, index.html) for these patterns and replace them:

**Browser references — must be zero of these in the final app:**
- `"Browser ASR"` → `"Offline (Whisper)"` or remove entirely
- `"browser fallback"` → `"offline mode"`
- `"Use Chrome/Edge"` → remove entirely
- `"No speech recognition. Use Chrome/Edge or add Deepgram key."` → `"Add an API key in Settings for online transcription, or switch to offline mode."`
- `"Serve via HTTP, not file://"` → remove entirely (irrelevant in Tauri)
- `"Pop-up blocked! Allow pop-ups"` → should never appear in Tauri (Phase 5 eliminated popups)
- Any mention of `window.open` for PDF export in the Tauri path

**Brand references — user shouldn't see vendor names:**
- `"Deepgram Nova-3"` → `"Online Transcription"`
- `"Deepgram Medical"` → `"Online Transcription"`
- `"Deepgram connected — speak now"` → `"Online transcription connected — speak now"`
- `"Deepgram connection failed"` → `"Online transcription connection failed"`
- `"Deepgram auth failed. Check API key."` → `"Transcription API key invalid. Check Settings."`
- The Settings drawer can still say "Deepgram" next to the API key field (the user needs to know what service to sign up for), but the main UI should say "Online Transcription"

**Old project name — must be zero "MedScribe" or "ms-" visible to the user:**
- Any `MedScribe` text in the UI (should already be cleaned up, but verify)
- The `ms-` prefix on localStorage keys doesn't matter (users don't see it), but if Phase 3 migrated to file system, these should be gone

### 1.2 WebSpeech Engine Removal

The WebSpeech API engine (`initWebSpeech`, `startWebSpeech`, `stopWebSpeech`) was a browser-only fallback. In the desktop app:

- **If Tauri is detected:** WebSpeech should NEVER be called. The fallback chain is: Online (Deepgram) → Offline (Whisper) → Toast telling user to configure one
- **If running in browser (dev mode):** WebSpeech can still work as a dev convenience
- The code can stay in the file for browser dev mode, but no Tauri code path should ever reach it

Tell Claude Code:
> "Audit every code path that calls `startWebSpeech()`. In the Tauri path (`window.__TAURI__`), none of these should be reachable. If Deepgram fails and we're in Tauri, show a toast suggesting the user switch to offline mode instead of falling back to WebSpeech."

### 1.3 Connection Indicator

The header has a connection indicator (`#connectionIndicator` / `#connectionText`). Verify it shows the right states:

| State | Indicator Color | Text |
|-------|----------------|------|
| Online transcription active | Green | `Online — connected` |
| Online transcription, no key | Gray | `No API key configured` |
| Offline (Whisper) active | Blue | `Offline — Whisper ready` |
| Offline, Whisper not available | Orange | `Whisper not found` |
| Recording paused | Yellow | `Paused` |

If it currently shows "Browser ASR" or "Deepgram Nova-3" in any state, fix it.

---

## 2. Settings Drawer Polish

The settings drawer should be organized into clear groups with consistent styling. Based on what should exist after Phases 1-7, verify this structure:

### 2.1 Expected Settings Groups (Top to Bottom)

```
1. APPEARANCE
   - Theme toggle (Light / Dark)

2. TRANSCRIPTION
   - Mode toggle: Online | Offline
   - [Online] API Key field + Save button + status dot
   - [Online] Note: "Enter your Deepgram API key for medical transcription"
   - [Offline] Whisper Model selector (Small / Large V3 Turbo / Large V3)
   - [Both] Microphone device selector (if implemented)
   - [Both] Language selector

3. AI NOTE GENERATION
   - Engine toggle: Cloud AI | Ollama | Rule-Based
   - [Cloud AI] Claude API Key field + Save button + status dot
   - [Cloud AI] Note: "Uses Claude Haiku 4.5 (~$0.01/note)"
   - [Ollama] Server URL + Test button + status dot
   - [Ollama] Model selector + Refresh button
   - [Ollama] Help text: "Requires Ollama running locally..."
   - [All] Verification pass toggle

4. RECORDING
   - Auto-scroll transcript toggle
   - Show timestamps toggle
   - Auto-detect speakers toggle
   - Highlight medical terms toggle
```

### 2.2 Visual Consistency Check

Tell Claude Code:
> "Open the Settings drawer and check these visual details:
> - Every toggle switch uses the same component style (`.toggle` class)
> - Every API key input uses the same input group style (`.api-key-input-group`)
> - Every status indicator uses the same dot + text pattern
> - Group titles are consistent (same font size, weight, color)
> - Descriptions under each setting are the same font size and color
> - There's consistent spacing between groups (use the existing `settings-group` margin)
> - The Cloud AI section follows the exact same visual pattern as the Ollama section (input + button + status dot)
> - No orphaned borders, misaligned elements, or inconsistent padding"

### 2.3 API Key Security

Both API key inputs (Deepgram and Claude) should:
- Use `type="password"` to mask the key
- Show `••••••••••••••••` when a key is saved
- Have a "Save" button (not auto-save on every keystroke)
- Show a green status dot when saved, red when empty
- Never log the actual key value to console or log files

---

## 3. Sidebar Polish

### 3.1 Info Card Update

The sidebar has an info card at the bottom. Verify it says something relevant for the desktop app:

**Good:**
```
ClinicalFlow v1.0.0
AI-powered clinical documentation
```

**Bad (leftover from web version):**
```
MedScribe AI
Add a Deepgram API key in Settings, or use Chrome/Edge for browser fallback.
```

### 3.2 Demo Mode Label

The demo button hint should be clear:
```
Try it out — click to load a sample clinical encounter
```

Not:
```
Demo mode loads a pre-recorded transcript...
```
(Keep it short)

### 3.3 Note Format Radio Buttons

Verify the three note format options (SOAP, HPI, Problem-Oriented) have consistent styling and clear labels. These are already good — just confirm nothing broke during Phase implementations.

---

## 4. Recording & Playback Polish

### 4.1 Record Button States

The record button should have clear visual states:

| State | Appearance |
|-------|-----------|
| Ready to record | Red circle, steady |
| Recording | Red circle pulsing, timer counting up |
| Paused | Yellow/amber, timer paused |
| Processing (Whisper) | Optional: subtle processing indicator while chunk is being transcribed |

### 4.2 Timer Display

The timer in the header should:
- Show `00:00` when not recording
- Count up during recording
- Pause visually when paused
- Show the final duration after stopping

### 4.3 Audio Waveform

If the waveform visualizer exists, verify:
- It animates during recording
- It stops when paused
- It resets on new session
- It doesn't glitch or leave artifacts

---

## 5. Note Panel Polish

### 5.1 Note Section Headers

After generation, each section (SUBJECTIVE, OBJECTIVE, etc.) should:
- Have consistent uppercase styling
- Have a subtle bottom border
- Be visually distinct from the body text
- Use the accent color (teal/cyan `#0891B2`)

### 5.2 Editable Sections

Each section should be `contenteditable`. Verify:
- Clicking on the text lets you edit it
- Edits are preserved when exporting PDF or copying
- There's a subtle visual cue that sections are editable (optional: light border on hover)
- Edits survive if you switch between note formats and regenerate (they shouldn't — regenerating replaces everything, which is correct)

### 5.3 Generation Progress

During note generation (especially with Cloud AI streaming):
- Sections should appear progressively as they're generated
- There should be a loading/streaming indicator
- The "Generate Note" button should be disabled during generation
- If generation is aborted, partial content should be cleared cleanly

### 5.4 Empty States

When no note has been generated:
- The note panel should show a clear empty state
- Something like: "Generate a note from your transcript using the button below"
- Not a blank white/dark panel with nothing in it

---

## 6. Toast Notification Consistency

### 6.1 Tone Check

Every toast message should be:
- **Concise** — one sentence max
- **Actionable** — tell the user what to do, not just what went wrong
- **Consistent capitalization** — sentence case, not Title Case

**Good:**
- `"Recording started — speak now"`
- `"Note generated successfully"`
- `"API key saved"`
- `"Transcription error on last segment. Recording continues."`

**Bad:**
- `"Recording Started Successfully!"` (too formal, exclamation)
- `"Error: Ollama Connection Failed. Please Check Your Settings And Try Again."` (too long, title case)
- `"Something went wrong"` (not actionable)

### 6.2 Toast Duration

- Success messages: 3-4 seconds
- Warnings: 5-6 seconds
- Errors: 6-8 seconds (user needs time to read)
- Critical errors (mic denied, crash): 8-10 seconds

---

## 7. Keyboard Shortcut Polish

### 7.1 Verify All Shortcuts Work

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + R` | Start/stop recording |
| `Cmd/Ctrl + G` | Generate note |
| `Cmd/Ctrl + E` | Export PDF |
| `Cmd/Ctrl + Shift + C` | Copy note |
| `Cmd/Ctrl + N` | New session |
| `Cmd/Ctrl + ,` | Open settings |
| `Escape` | Close settings drawer |

### 7.2 Prevent Browser-Default Conflicts

In Tauri, `Cmd+R` might try to reload the webview. Make sure the app intercepts it:

```javascript
// Should already exist, but verify:
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
    e.preventDefault();
    // Toggle recording instead of reloading
  }
});
```

### 7.3 Help Dialog

The help button (?) should show all shortcuts in a clean modal or popover. Verify it exists and is up to date with the current shortcut map.

---

## 8. Theme Consistency

### 8.1 Dark Mode

Switch to dark mode and verify:
- All text is readable (no dark text on dark background)
- All inputs have visible borders
- The settings drawer background matches the app background
- Status dots are visible
- The PDF export uses its own inline styles (not affected by theme)
- Toast notifications are readable in both themes

### 8.2 Light Mode

Same checks in light mode:
- No washed-out text
- Borders and separators visible
- Accent color (teal) has sufficient contrast

---

## 9. Window Behavior

### 9.1 Minimum Window Size

Verify `tauri.conf.json` has:
```json
"minWidth": 1024,
"minHeight": 700
```

Resize the window to the minimum and verify nothing breaks:
- Sidebar doesn't overlap content
- Buttons don't wrap awkwardly
- Transcript and note panels are still usable

### 9.2 Panel Resize Handle

The drag handle between transcript and note panels should:
- Be visible (subtle line or dots)
- Show a resize cursor on hover
- Actually resize the panels
- Remember the ratio across restarts
- Not allow either panel to be resized to zero width

### 9.3 Sidebar Collapse

- Collapse button works
- Collapsed state persists across restarts
- Content doesn't spill out when collapsed
- Panels expand to fill the space

---

## 10. Loading & First-Launch Experience

### 10.1 First Launch

On first launch (no config, no saved session):
- App should open to an empty, clean state
- Settings drawer should NOT auto-open (let the user explore)
- A gentle toast could appear: `"Welcome to ClinicalFlow — add speakers and start recording, or try the demo"`
- Demo button should be easy to find

### 10.2 App Startup Speed

The app should feel instant:
- Window appears in <1 second
- UI is interactive immediately
- Background tasks (model download, memory check, log cleanup) should NOT block the UI
- No blank white screen before the app loads

If there's a flash of white before the UI renders, add a background color to the webview:

In `tauri.conf.json`:
```json
"windows": [{
  "title": "ClinicalFlow",
  "backgroundColor": "#0B0F14"
}]
```

This matches the dark theme background so there's no flash.

---

## 11. Error State Polish

### 11.1 Every Error Should Have a Recovery Path

Go through each error scenario and verify the user isn't stuck:

| Error | What User Sees | Recovery |
|-------|---------------|----------|
| No microphone | Toast: "No microphone found" | User plugs in mic, tries again |
| Mic permission denied | Toast: "Microphone access denied" | Instructions to enable in System Preferences |
| Deepgram key invalid | Toast: "API key invalid. Check Settings." | User opens Settings, re-enters key |
| Claude key invalid | Toast: "Cloud AI key invalid. Check Settings." | User opens Settings, re-enters key |
| Ollama not running | Toast: "Ollama not connected" | User starts Ollama, clicks Test |
| Whisper model missing | Toast: "Whisper model not found" | Download prompt or Settings link |
| Network lost mid-recording | Toast: "Connection lost — switching to offline" | Auto-fallback to Whisper |
| Note generation fails | Toast: "Generation failed — try again or switch engine" | User can regenerate or change engine |

### 11.2 No Silent Failures

Search for `catch(e){}` or `catch(()=>{})` — these swallow errors silently. Every catch should at minimum log to console. Critical ones should toast.

---

## 12. Accessibility Quick Pass

Not a full accessibility audit, but catch the low-hanging fruit:

- [ ] Every button has an `aria-label`
- [ ] Toggle switches have `role="switch"` and `aria-checked`
- [ ] Settings inputs have associated labels
- [ ] Focus is visible (outline) when tabbing through the UI
- [ ] The record button is reachable via keyboard
- [ ] Color is not the ONLY indicator of state (status dots should also have text)

---

## 13. Final Cleanup Checklist

### Code Cleanup
- [ ] No `console.log` statements left in production code (use `console.debug` or `tracing` instead)
- [ ] No commented-out code blocks longer than 5 lines
- [ ] No `TODO` or `FIXME` comments that are actually blocking
- [ ] No hardcoded test values (API keys, URLs, model names that shouldn't be there)

### Visual Cleanup
- [ ] Consistent font sizes across all panels
- [ ] Consistent spacing / padding in settings groups
- [ ] No text overflow or truncation anywhere
- [ ] Scrollbars appear only when needed and match the theme
- [ ] Icons are consistent style (all outline or all filled, not mixed)

### Functional Cleanup
- [ ] Every button does something (no dead buttons)
- [ ] Every toggle persists its state
- [ ] Settings changes take effect immediately (no "restart required")
- [ ] New Session actually clears everything
- [ ] Demo mode works from a completely fresh state

---

## How To Execute This Phase

This phase is different from the others. Instead of building new features, you're reviewing and polishing. Here's the workflow:

1. **Read through this doc with Claude Code open**
2. **For each section, tell Claude Code what to check and fix**
3. **Test each fix immediately before moving to the next**

Example prompts for Claude Code:

> "Search the entire codebase for 'Browser ASR', 'browser fallback', 'Chrome/Edge', 'MedScribe', and 'Nova-3'. Replace all user-facing instances with the desktop-appropriate labels from this list: [paste the table from section 1.1]"

> "In the Tauri code path, audit every place that calls startWebSpeech(). None of these should be reachable when window.__TAURI__ exists. Replace WebSpeech fallbacks with a toast telling the user to switch to offline mode."

> "Open the Settings drawer and verify every settings group has consistent styling: same input styles, same status dot pattern, same spacing. List any inconsistencies."

> "Check every toast message in the app. Make sure they're all sentence case, one sentence max, and include an action the user can take."

> "Add backgroundColor: '#0B0F14' to the window config in tauri.conf.json to prevent a white flash on launch."

---

## What NOT To Touch

- The clinical prompt system (SOAP/HPI/Problem-Oriented templates)
- The verification pass logic
- The medical term post-processor
- The note parser
- The core recording pipeline
- The panel resize / sidebar collapse mechanics
- Any CSS that already looks good

This phase is additive polish, not restructuring. If something works, leave it.
