# ClinicalFlow — Cloud AI Integration (Claude API for Note Generation + Verification)

## Overview

Add Claude API as the **online** AI engine for both note generation (Pass 1) and verification (Pass 2), with Ollama remaining as the **offline** fallback. Same dual-mode pattern as transcription: cloud when available for best quality, local when offline.

**Architecture:**
```
Online (Claude API)          Offline (Ollama)
┌─────────────────┐         ┌─────────────────┐
│ Pass 1: Generate │         │ Pass 1: Generate │
│ Haiku 4.5        │         │ llama3.1:8b      │
│ ~1.3¢/note       │         │ Free, local      │
├─────────────────┤         ├─────────────────┤
│ Pass 2: Verify   │         │ Pass 2: Verify   │
│ Haiku 4.5        │         │ llama3.1:8b      │
│ ~0.3¢/note       │         │ Free, local      │
└─────────────────┘         └─────────────────┘
       ↓                            ↓
   Same prompt engineering, same post-processor,
   same UI, same output format
```

**Cost estimate:** ~1.3 cents per encounter ($0.33/day for 25 patients). Negligible.

---

## 1. Settings UI Changes (index.html)

Replace the current AI Engine toggle (Ollama / Rule-Based) with a three-option selector and add a Claude API key field.

### 1.1 Replace the Engine Toggle

Find this block (around line 738):
```html
<div class="ai-engine-toggle" id="aiEngineToggle">
  <button class="ai-engine-option active" data-engine="ollama">Ollama (AI)</button>
  <button class="ai-engine-option" data-engine="rules">Rule-Based</button>
</div>
```

Replace with:
```html
<div class="ai-engine-toggle" id="aiEngineToggle">
  <button class="ai-engine-option" data-engine="cloud">Cloud AI</button>
  <button class="ai-engine-option active" data-engine="ollama">Ollama (Local)</button>
  <button class="ai-engine-option" data-engine="rules">Rule-Based</button>
</div>
```

### 1.2 Add Cloud AI Settings Panel

Add this BEFORE the `<div id="ollamaSettings">` block:

```html
<div id="cloudAISettings" style="display:none;">
  <div class="settings-row settings-row-stacked">
    <div class="settings-row-info">
      <div class="settings-row-label">Anthropic API Key</div>
      <div class="settings-row-desc">Powers cloud-based note generation and verification. Get a key at <a href="https://console.anthropic.com" target="_blank" rel="noopener">console.anthropic.com</a></div>
    </div>
    <div class="api-key-input-group">
      <input type="password" class="api-key-input" id="claudeKeyInput" placeholder="sk-ant-..." autocomplete="off" spellcheck="false">
      <button class="btn btn-primary btn-sm" id="claudeKeySave">Save</button>
    </div>
    <div class="ollama-status disconnected" id="claudeStatus">
      <span class="ollama-status-dot"></span>
      <span id="claudeStatusText">No API key</span>
    </div>
  </div>

  <div class="settings-row" style="margin-top: 12px;">
    <div class="settings-row-info">
      <div class="settings-row-label">Verification pass</div>
      <div class="settings-row-desc">Double-checks note against transcript for accuracy</div>
    </div>
    <div class="toggle" id="settingClaudeVerify" data-setting="claudeVerify" role="switch" aria-checked="true" tabindex="0">
      <div class="toggle-knob"></div>
    </div>
  </div>

  <div class="ollama-help">
    Uses Claude Haiku 4.5 for fast, accurate clinical notes. Typical cost: ~1¢ per encounter. Your transcript data is sent to Anthropic's API — do not use if your facility prohibits cloud processing of clinical audio.
  </div>
</div>
```

### 1.3 Toggle Visibility Logic

In the engine toggle event handler, show/hide the right settings panel:

```javascript
// When user clicks an engine option:
document.querySelectorAll('#aiEngineToggle .ai-engine-option').forEach(btn => {
  btn.addEventListener('click', () => {
    // Update active state
    document.querySelectorAll('#aiEngineToggle .ai-engine-option').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    App.aiEngine = btn.dataset.engine;
    cfg.set('ms-ai-engine', App.aiEngine);

    // Show/hide settings panels
    const cloudPanel = document.getElementById('cloudAISettings');
    const ollamaPanel = document.getElementById('ollamaSettings');
    if (cloudPanel) cloudPanel.style.display = App.aiEngine === 'cloud' ? '' : 'none';
    if (ollamaPanel) ollamaPanel.style.display = App.aiEngine === 'ollama' ? '' : 'none';
  });
});
```

---

## 2. App State Changes (app.js)

### 2.1 New State Variables

Add to the `App` object:

```javascript
const App = {
  // ... existing state ...

  // AI Engine: 'cloud', 'ollama', or 'rules'
  aiEngine: 'cloud',  // Change default from 'ollama' to 'cloud'

  // Claude API
  claudeKey: '',
  claudeVerify: true,  // Verification ON by default for cloud (it's fast + cheap)
};
```

### 2.2 Claude Key Save/Load

```javascript
function loadClaudeKey() {
  const key = cfg.get('ms-claude-key', '');
  App.claudeKey = key;
  const input = document.getElementById('claudeKeyInput');
  if (input) input.value = key ? '••••••••••••••••' : '';
  updClaudeStatus();
}

function saveClaudeKey() {
  const input = document.getElementById('claudeKeyInput');
  const key = input.value.trim();
  if (!key || key.includes('•')) {
    toast('Enter a valid API key.', 'warning');
    return;
  }
  if (!key.startsWith('sk-ant-')) {
    toast('Anthropic API keys start with sk-ant-', 'warning');
    return;
  }
  App.claudeKey = key;
  cfg.set('ms-claude-key', key);
  input.value = '••••••••••••••••';
  updClaudeStatus();
  toast('API key saved. Cloud AI is ready.', 'success');
}

function updClaudeStatus() {
  const dot = document.getElementById('claudeStatus');
  const text = document.getElementById('claudeStatusText');
  if (!dot || !text) return;
  if (App.claudeKey) {
    dot.className = 'ollama-status connected';
    text.textContent = 'API key saved — Cloud AI ready';
  } else {
    dot.className = 'ollama-status disconnected';
    text.textContent = 'No API key';
  }
}
```

### 2.3 Wire Up Events

In `initEvents()`:

```javascript
const claudeSaveBtn = document.getElementById('claudeKeySave');
if (claudeSaveBtn) {
  claudeSaveBtn.addEventListener('click', saveClaudeKey);
}

const claudeVerifyToggle = document.getElementById('settingClaudeVerify');
if (claudeVerifyToggle) {
  claudeVerifyToggle.addEventListener('click', () => {
    App.claudeVerify = !App.claudeVerify;
    claudeVerifyToggle.setAttribute('aria-checked', App.claudeVerify);
    claudeVerifyToggle.classList.toggle('active', App.claudeVerify);
    cfg.set('ms-claude-verify', App.claudeVerify ? '1' : '0');
  });
}
```

In `init()`, after loading other settings:

```javascript
loadClaudeKey();
App.claudeVerify = cfg.get('ms-claude-verify', '1') === '1';
```

---

## 3. Claude API Communication (app.js)

### 3.1 Core API Call Function

Add this new function. It handles both generation and verification via the Anthropic Messages API:

```javascript
async function streamClaudeResponse(prompt, renderEl, temperature, maxTokens) {
  if (!App.claudeKey) throw new Error('No Claude API key configured');

  // Cancel any existing in-flight request
  if (ollamaAbortCtrl) { ollamaAbortCtrl.abort(); ollamaAbortCtrl = null; }
  ollamaAbortCtrl = new AbortController();

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': App.claudeKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    signal: ollamaAbortCtrl.signal,
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens || 2048,
      temperature: temperature || 0.3,
      stream: true,
      messages: [
        { role: 'user', content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    if (response.status === 401) throw new Error('Invalid API key. Check your Anthropic key in Settings.');
    if (response.status === 429) throw new Error('Rate limited. Wait a moment and try again.');
    if (response.status === 529) throw new Error('Anthropic API is temporarily overloaded. Try again in a few seconds.');
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const event = JSON.parse(data);

          // Handle different SSE event types
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            fullText += event.delta.text;
            if (renderEl) {
              renderEl.innerHTML = formatNoteMarkdown(fullText);
              renderEl.closest('.note-section')?.scrollIntoView({ block: 'end', behavior: 'smooth' });
            }
          }

          // Handle errors in stream
          if (event.type === 'error') {
            throw new Error(event.error?.message || 'Stream error');
          }
        } catch (parseErr) {
          // Skip malformed JSON chunks (same as Ollama handler)
          if (parseErr.message !== 'Stream error') continue;
          throw parseErr;
        }
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      console.log('[ClinicalFlow] Claude generation cancelled');
      throw e;
    }
    throw e;
  } finally {
    ollamaAbortCtrl = null;
  }

  return fullText;
}
```

### 3.2 CSP Requirement

The Anthropic API call needs `https://api.anthropic.com` in the CSP `connect-src`. Update `tauri.conf.json`:

```json
"csp": "default-src 'self'; connect-src 'self' http://localhost:11434 https://api.anthropic.com wss://api.deepgram.com; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:"
```

### 3.3 Important: The `anthropic-dangerous-direct-browser-access` Header

The Anthropic API normally blocks requests from browsers (CORS). The header `anthropic-dangerous-direct-browser-access: true` tells Anthropic to allow it. This is an official Anthropic feature for exactly this use case — desktop apps and prototypes that call the API from a webview.

In a Tauri app, this is appropriate because:
- The API key is stored locally on the user's machine (not exposed to the internet)
- There's no web server serving this page to arbitrary users
- The user entered their own API key

If CORS is still blocked in the Tauri webview, fall back to routing through Rust (same pattern as the Ollama proxy in Phase 4). But try the direct approach first.

---

## 4. Update generateNote() Router (app.js)

Replace the existing `generateNote()` function:

```javascript
async function generateNote() {
  if (App.entries.length === 0) { toast('No transcript to generate from.', 'warning'); return; }
  if (App.isRecording) { toast('Stop recording first.', 'warning'); return; }

  if (App.aiEngine === 'cloud' && App.claudeKey) {
    await generateCloudNote();
  } else if (App.aiEngine === 'ollama' && App.ollamaConnected) {
    await generateOllamaNote();
  } else {
    // Fallback messaging
    if (App.aiEngine === 'cloud' && !App.claudeKey) {
      toast('No API key. Add your Anthropic key in Settings, or switch to Ollama.', 'warning', 5000);
    } else if (App.aiEngine === 'ollama' && !App.ollamaConnected) {
      toast('Ollama not connected. Using rule-based fallback.', 'warning', 4000);
    }
    await generateRuleBasedNote();
  }
}
```

---

## 5. Cloud Note Generation Function (app.js)

This mirrors `generateOllamaNote()` exactly — same UI flow, same prompt, same post-processing. The only difference is calling `streamClaudeResponse` instead of `streamOllamaResponse`.

```javascript
async function generateCloudNote() {
  const transcript = formatTxForPrompt();
  const prompt = buildClinicalPrompt(transcript, App.noteFormat);
  const doVerify = App.claudeVerify;
  console.log('[ClinicalFlow] Generating note via Cloud AI. Verification:', doVerify ? 'ON' : 'OFF');

  // Show generating state
  D.noteEmpty.style.display = 'none';
  D.noteSec.style.display = 'block';
  D.noteGen.style.display = 'none';
  updStatus('generating');

  // Create streaming section
  D.noteSec.innerHTML = '';
  const streamEl = document.createElement('div');
  streamEl.className = 'note-section';
  const passLabel = doVerify ? 'Pass 1/2' : '';
  streamEl.innerHTML = `<div class="note-section-header"><span class="note-section-title">${passLabel ? passLabel + ' — ' : ''}Generating note...</span></div><div class="note-section-body streaming" id="streamingNoteBody"></div>`;
  D.noteSec.appendChild(streamEl);
  const bodyEl = document.getElementById('streamingNoteBody');

  let fullText = '';

  try {
    // ── PASS 1: Generate the note ──
    fullText = await streamClaudeResponse(prompt, bodyEl, 0.3, 4096);
    bodyEl.classList.remove('streaming');

    // ── PASS 2: Verify (if enabled) ──
    if (doVerify && fullText.length > 50) {
      console.log('[ClinicalFlow] Starting cloud verification pass...');
      streamEl.querySelector('.note-section-title').textContent = 'Pass 2/2 — Verifying accuracy...';
      bodyEl.classList.add('streaming');

      const verifyPrompt = buildVerificationPrompt(transcript, fullText);
      const verifyText = await streamClaudeResponse(verifyPrompt, null, 0.1, 2048);

      const hasCorrections = verifyText.toLowerCase().includes('corrected note');
      if (hasCorrections) {
        fullText = extractCorrectedNote(verifyText);
        toast('Verification — corrections applied', 'success');
      } else {
        toast('Verification — note is accurate', 'success');
      }
      bodyEl.classList.remove('streaming');
    }

    // Post-process: programmatic corrections
    fullText = postProcessNote(fullText, transcript);

    // Parse final note into sections
    const sections = parseOllamaResponse(fullText);
    App.noteSections = sections;
    App.noteGenerated = true;
    renderNoteSec(sections);
    D.regenBtn.style.display = 'flex';
    D.copyBtn.style.display = 'flex';
    D.expPdfBtn.style.display = 'flex';
    D.expBtn.style.display = 'inline-flex';
    updStatus('ready');
    toast('Clinical note ready for review', 'success');

  } catch (e) {
    if (e.name === 'AbortError') {
      console.log('[ClinicalFlow] Note generation was cancelled');
      toast('Generation cancelled', 'info');
      updStatus('ready');
      return;
    }

    console.error('[ClinicalFlow] Cloud generation error:', e);

    // If we got partial text, show it
    if (fullText && fullText.trim().length > 100) {
      toast('Cloud AI disconnected. Showing partial note.', 'warning', 6000);
      fullText = postProcessNote(fullText, transcript);
      const sections = parseOllamaResponse(fullText);
      App.noteSections = sections;
      App.noteGenerated = true;
      renderNoteSec(sections);
      const warningEl = document.createElement('div');
      warningEl.className = 'note-warning';
      warningEl.textContent = '⚠ This note may be incomplete — connection was interrupted. Review carefully.';
      D.noteSec.prepend(warningEl);
      updStatus('ready');
      return;
    }

    // No partial text — try Ollama fallback, then rule-based
    if (bodyEl) bodyEl.classList.remove('streaming');

    if (App.ollamaConnected) {
      toast(`Cloud AI failed: ${e.message}. Falling back to Ollama.`, 'warning', 6000);
      await generateOllamaNote();
    } else {
      toast(`Cloud AI failed: ${e.message}. Using rule-based fallback.`, 'error', 6000);
      await generateRuleBasedNote();
    }
  }
}
```

---

## 6. Fallback Chain

The generation now has a three-tier fallback:

```
Cloud AI (Claude Haiku 4.5)
    ↓ fails/no key
Ollama (Local LLM)
    ↓ fails/not running
Rule-Based (Deterministic)
    ↓ always works
```

This is handled in the `catch` block of `generateCloudNote()` above and in the `generateNote()` router.

---

## 7. Config Persistence

Add to the config save/load functions (Phase 3's Config manager):

```javascript
// Keys to persist:
cfg.set('ms-ai-engine', App.aiEngine);          // 'cloud', 'ollama', or 'rules'
cfg.set('ms-claude-key', App.claudeKey);         // Anthropic API key
cfg.set('ms-claude-verify', App.claudeVerify ? '1' : '0');  // Cloud verification toggle

// Load:
App.aiEngine = cfg.get('ms-ai-engine', 'cloud');
App.claudeKey = cfg.get('ms-claude-key', '');
App.claudeVerify = cfg.get('ms-claude-verify', '1') === '1';
```

---

## 8. Testing Checklist

### Test 1: Cloud Generation Happy Path
```
1. Set engine to "Cloud AI" in settings
2. Enter your Anthropic API key (starts with sk-ant-)
3. Status shows "API key saved — Cloud AI ready"
4. Run the demo transcript
5. Click "Generate Note"
6. Verify: text streams in smoothly
7. Verify: note quality is noticeably better than Ollama
8. Verify: sections are well-structured
9. Verify: medical terms are correct
```

### Test 2: Cloud Verification
```
1. With Cloud AI selected and verification ON (default)
2. Generate a note
3. Verify: shows "Pass 1/2" then "Pass 2/2"
4. Verify: verification completes quickly (should be much faster than Ollama verification)
5. Verify: no contradictions, no miscategorized medications
```

### Test 3: Invalid API Key
```
1. Enter a fake API key "sk-ant-fake123"
2. Generate a note
3. Verify: error message about invalid API key
4. Verify: falls back to Ollama (if running) or rule-based
```

### Test 4: No Internet (Cloud Fallback)
```
1. Disconnect from internet
2. Try to generate a note with Cloud AI
3. Verify: fails gracefully
4. Verify: falls back to Ollama if running
5. Reconnect internet — verify cloud works again
```

### Test 5: Switch Between Engines
```
1. Generate a note with Cloud AI
2. Switch to Ollama in settings
3. Regenerate — verify it uses Ollama
4. Switch to Rule-Based
5. Regenerate — verify it uses rules
6. Switch back to Cloud — verify it uses Claude
```

### Test 6: Key Persistence
```
1. Enter and save API key
2. Close the app completely
3. Reopen the app
4. Check settings — key should show as saved (masked)
5. Generate a note — should work without re-entering key
```

---

## 9. What NOT To Touch

- `buildClinicalPrompt()` — same prompts work for both Claude and Ollama
- `buildVerificationPrompt()` — same verification logic for both
- `postProcessNote()` — always runs regardless of engine
- `parseOllamaResponse()` — name is misleading but it parses any LLM output, keep it
- `generateOllamaNote()` — keep it intact as the offline path
- `generateRuleBasedNote()` — keep as final fallback
- `streamOllamaResponse()` — keep for Ollama path, don't merge with Claude function

---

## 10. Files Modified Summary

| File | Changes |
|------|---------|
| `src/index.html` | Three-option engine toggle (Cloud / Ollama / Rule-Based), Claude API key field, cloud verification toggle, privacy note |
| `src/app.js` | `streamClaudeResponse()`, `generateCloudNote()`, updated `generateNote()` router, `loadClaudeKey()`, `saveClaudeKey()`, `updClaudeStatus()`, new state variables, event wiring |
| `tauri.conf.json` | Add `https://api.anthropic.com` to CSP `connect-src` |
| `src/styles.css` | No changes needed (reuses existing `.ai-engine-option`, `.api-key-input`, `.ollama-status` classes) |

---

## 11. Future Optimization: Prompt Caching

Once this is working, there's a cost optimization available. Anthropic supports prompt caching — if the system prompt (your clinical prompt template) is the same across calls, you can cache it and pay 90% less for that portion on subsequent calls. This would reduce the ~1.3¢/note cost even further. This is an optimization for later, not for initial implementation.
