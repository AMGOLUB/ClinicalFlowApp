# ClinicalFlow — Phase 4: Ollama Integration Hardening

## Overview

Verify and harden the Ollama LLM connection inside the Tauri desktop app. The existing frontend already has a complete Ollama integration (model discovery, streaming note generation, two-pass verification, post-processing). This phase ensures it works reliably inside Tauri's webview, adds startup health checks, improves error handling, and makes the end-to-end pipeline bulletproof: Record → Transcribe → Generate Note → Verify → Post-Process → Display.

**Prerequisites:** Phases 1-3 must be complete. The app opens in Tauri, transcription works (online or offline), and file system persistence is in place. Ollama must be installed separately on the machine (`brew install ollama` on macOS, then `ollama serve`).

---

## 4.1 Verify CSP Allows Localhost Fetch

The frontend's `streamOllamaResponse()` function makes a direct `fetch()` to `http://localhost:11434/api/generate`. This must be allowed by Tauri's Content Security Policy.

### 4.1.1 Check Current CSP

In `tauri.conf.json`, confirm the CSP includes `connect-src` for localhost:

```json
{
  "app": {
    "security": {
      "csp": "default-src 'self'; connect-src 'self' http://localhost:11434 ws://localhost:* wss://api.deepgram.com; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:"
    }
  }
}
```

**Critical items in `connect-src`:**
- `http://localhost:11434` — Ollama API (note generation)
- `ws://localhost:*` — Local WebSocket (if needed)
- `wss://api.deepgram.com` — Deepgram online transcription

### 4.1.2 Test It

1. Run `npm run tauri dev`
2. Make sure Ollama is running: `ollama serve` (in a separate terminal)
3. Open settings, click "Test Connection" for Ollama
4. If it shows "Connected — X models available" → CSP is fine, skip to 4.2
5. If it shows "Not connected" and the console shows a CSP error → fix the CSP string above

### 4.1.3 If CSP Blocks It — Rust Proxy (Fallback Only)

Only implement this if direct fetch does NOT work. Create `src-tauri/src/ollama_proxy.rs`:

```rust
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone)]
struct OllamaChunk {
    response: String,
    done: bool,
}

#[tauri::command]
async fn ollama_check(url: String) -> Result<String, String> {
    let client = reqwest::Client::new();
    let resp = client.get(format!("{}/api/tags", url))
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    let body = resp.text().await.map_err(|e| e.to_string())?;
    Ok(body)
}

#[tauri::command]
async fn ollama_generate(
    app: AppHandle,
    url: String,
    model: String,
    prompt: String,
    temperature: f64,
    num_ctx: u32,
) -> Result<String, String> {
    let client = reqwest::Client::new();

    let body = serde_json::json!({
        "model": model,
        "prompt": prompt,
        "stream": true,
        "options": {
            "temperature": temperature,
            "num_ctx": num_ctx
        }
    });

    let resp = client.post(format!("{}/api/generate", url))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Ollama request failed: {}", e))?;

    let mut full_text = String::new();
    let mut stream = resp.bytes_stream();

    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        let text = String::from_utf8_lossy(&chunk);

        for line in text.lines() {
            if line.trim().is_empty() { continue; }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                if let Some(response) = json.get("response").and_then(|r| r.as_str()) {
                    full_text.push_str(response);
                    // Emit chunk to frontend for live streaming
                    let _ = app.emit("ollama_chunk", OllamaChunk {
                        response: response.to_string(),
                        done: json.get("done").and_then(|d| d.as_bool()).unwrap_or(false),
                    });
                }
            }
        }
    }

    Ok(full_text)
}
```

**Additional Cargo.toml dependencies (only if using proxy):**
```toml
reqwest = { version = "0.12", features = ["json", "stream"] }
futures-util = "0.3"
```

**Frontend change (only if using proxy):** Replace the `fetch()` call in `streamOllamaResponse()` with Tauri invoke + event listener:

```javascript
async function streamOllamaResponse(prompt, renderEl, temperature, numCtx) {
  if (ollamaAbortCtrl) { ollamaAbortCtrl.abort(); ollamaAbortCtrl = null; }

  let fullText = '';

  if (window.__TAURI__) {
    // Listen for streaming chunks from Rust
    const unlisten = await tauriListen('ollama_chunk', (event) => {
      const { response, done } = event.payload;
      fullText += response;
      if (renderEl) {
        renderEl.innerHTML = formatNoteMarkdown(fullText);
        renderEl.closest('.note-section')?.scrollIntoView({ block: 'end', behavior: 'smooth' });
      }
    });

    try {
      fullText = await tauriInvoke('ollama_generate', {
        url: App.ollamaUrl,
        model: App.ollamaModel,
        prompt: prompt,
        temperature: temperature || 0.3,
        numCtx: numCtx || 4096
      });
    } finally {
      unlisten();
    }
  } else {
    // Original browser fetch code (keep as-is for dev mode)
    // ... existing fetch() code ...
  }

  return fullText;
}
```

**Again: only do this if direct fetch fails.** The direct approach is simpler and the existing code already works.

---

## 4.2 Ollama Startup Health Check

Add an automatic check when the app launches so the user knows immediately if Ollama is available.

### 4.2.1 Frontend: Auto-Check on Init

Add to the `init()` function in app.js, after config is loaded:

```javascript
// In init(), after loadOllamaSettings():
if (App.aiEngine === 'ollama') {
  // Non-blocking check — don't await, let it run in background
  ollamaCheck().then(() => {
    if (App.ollamaConnected) {
      console.log('[ClinicalFlow] Ollama connected:', App.ollamaModels.length, 'models');
    } else {
      // Show a persistent but non-intrusive warning
      toast('Ollama not detected. Start it with "ollama serve" or switch to rule-based notes in Settings.', 'warning', 8000);
    }
  }).catch(e => {
    console.warn('[ClinicalFlow] Ollama check failed:', e);
  });
}
```

### 4.2.2 Smarter Retry Logic

The current `ollamaCheck()` tries once and gives up. Add retry with backoff for situations where Ollama is still starting up:

```javascript
async function ollamaCheckWithRetry(maxRetries = 3, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await ollamaCheck();
    if (App.ollamaConnected) return true;

    if (attempt < maxRetries) {
      console.log(`[ClinicalFlow] Ollama not ready, retry ${attempt}/${maxRetries} in ${delayMs}ms...`);
      await wait(delayMs);
      delayMs *= 1.5; // Backoff
    }
  }
  return false;
}
```

Replace the init call:
```javascript
// OLD:
ollamaCheck();
// NEW:
ollamaCheckWithRetry(3, 2000);
```

This handles the common case where the user opens ClinicalFlow right after boot, before Ollama has fully started.

---

## 4.3 Model Recommendation & Validation

### 4.3.1 Recommended Models

ClinicalFlow works best with these Ollama models (in order of recommendation):

| Model | Size | RAM | Quality | Speed | Best For |
|-------|------|-----|---------|-------|----------|
| `llama3.1:8b` | 4.7GB | ~6GB | Very good | Fast | **Default — best balance** |
| `mistral:7b` | 4.1GB | ~5GB | Good | Fast | Lower RAM machines |
| `llama3.1:70b` | 40GB | ~48GB | Excellent | Slow | Best quality, needs powerful machine |
| `gemma2:9b` | 5.4GB | ~7GB | Very good | Medium | Alternative to Llama |
| `qwen2.5:7b` | 4.4GB | ~6GB | Very good | Fast | Tested with ClinicalFlow prompts |

### 4.3.2 Model Validation on Selection

When the user selects a model, validate it can handle clinical notes:

```javascript
// Add after model selection in the settings event handler:
D.ollamaModelSelect.addEventListener('change', async (e) => {
  App.ollamaModel = e.target.value;
  cfg.set('ms-ollama-model', App.ollamaModel);

  // Warn if model seems too small
  const smallModels = ['tinyllama', 'phi', 'gemma:2b', 'qwen2.5:0.5b', 'qwen2.5:1.5b'];
  if (smallModels.some(m => App.ollamaModel.toLowerCase().includes(m))) {
    toast('⚠ Small models may produce lower quality clinical notes. 7B+ models recommended.', 'warning', 6000);
  }
});
```

### 4.3.3 First-Run Model Check

If Ollama is connected but has NO models installed, guide the user:

```javascript
// In ollamaCheck(), after successfully connecting:
if (App.ollamaConnected && App.ollamaModels.length === 0) {
  toast('Ollama is running but has no models. Open a terminal and run: ollama pull llama3.1:8b', 'warning', 10000);
}
```

---

## 4.4 Generation Error Handling Improvements

### 4.4.1 Timeout Protection

The current code has no timeout on note generation. A bad model or huge context could hang forever. Add a timeout:

```javascript
// In generateOllamaNote(), wrap the generation call:
const GENERATION_TIMEOUT_MS = 120000; // 2 minutes max

const timeoutPromise = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('Note generation timed out after 2 minutes')), GENERATION_TIMEOUT_MS)
);

try {
  fullText = await Promise.race([
    streamOllamaResponse(prompt, bodyEl, 0.3, 4096),
    timeoutPromise
  ]);
  // ... rest of generation logic
} catch(e) {
  if (e.message.includes('timed out')) {
    toast('Generation timed out. Try a smaller model or shorter transcript.', 'error', 8000);
    updStatus('ready');
    return;
  }
  throw e;
}
```

### 4.4.2 Context Window Overflow Detection

If the transcript is too long for the model's context window, the generation will fail or produce garbage. Detect this:

```javascript
// In generateOllamaNote(), before calling streamOllamaResponse:
function estimateTokens(text) {
  // Rough estimate: 1 token ≈ 4 characters for English
  return Math.ceil(text.length / 4);
}

const promptTokens = estimateTokens(prompt);
const contextWindow = 4096; // Default, some models support 8192+

if (promptTokens > contextWindow * 0.85) {
  toast('⚠ Transcript is very long. Note quality may be affected. Consider summarizing key points.', 'warning', 6000);
}

// If the transcript is extremely long, increase num_ctx
const numCtx = promptTokens > 3000 ? 8192 : 4096;
fullText = await streamOllamaResponse(prompt, bodyEl, 0.3, numCtx);
```

### 4.4.3 Empty Response Handling

Sometimes Ollama returns an empty or near-empty response. Handle gracefully:

```javascript
// After streamOllamaResponse returns:
if (!fullText || fullText.trim().length < 50) {
  console.warn('[ClinicalFlow] Ollama returned empty/short response:', fullText);
  toast('Ollama returned an incomplete note. Retrying...', 'warning', 4000);

  // One automatic retry with slightly higher temperature
  fullText = await streamOllamaResponse(prompt, bodyEl, 0.5, 4096);

  if (!fullText || fullText.trim().length < 50) {
    toast('Generation failed after retry. Falling back to rule-based note.', 'error', 6000);
    await generateRuleBasedNote();
    return;
  }
}
```

---

## 4.5 Ollama Connection Lost During Generation

If Ollama crashes or the connection drops mid-generation, handle it without losing what was already transcribed:

```javascript
// In the catch block of generateOllamaNote():
} catch(e) {
  if (e.name === 'AbortError') {
    console.log('[ClinicalFlow] Note generation was cancelled');
    toast('Generation cancelled', 'info');
    updStatus('ready');
    return;
  }

  console.error('[ClinicalFlow] Ollama generation error:', e);

  // If we got partial text, offer to keep it
  if (fullText && fullText.trim().length > 100) {
    toast('Ollama disconnected mid-generation. Showing partial note.', 'warning', 6000);
    fullText = postProcessNote(fullText, transcript);
    const sections = parseOllamaResponse(fullText);
    App.noteSections = sections;
    App.noteGenerated = true;
    renderNoteSec(sections);

    // Add a visible warning to the note
    const warningEl = document.createElement('div');
    warningEl.className = 'note-warning';
    warningEl.textContent = '⚠ This note is incomplete — Ollama disconnected during generation. Review carefully.';
    D.noteSec.prepend(warningEl);

    updStatus('ready');
    return;
  }

  // No partial text — fall back to rule-based
  if (bodyEl) bodyEl.classList.remove('streaming');
  toast(`Ollama error: ${e.message}. Falling back to rule-based.`, 'error', 6000);
  await generateRuleBasedNote();
}
```

---

## 4.6 End-to-End Test Flow

After all changes, test this exact sequence:

### Test 1: Happy Path
```
1. Start Ollama: ollama serve
2. Launch app: npm run tauri dev
3. Verify Ollama shows "Connected — X models available" in settings
4. Record a test encounter (online or offline transcription)
5. Click "Generate Note"
6. Verify: note streams in word by word
7. Verify: note has proper SOAP/HPI sections
8. Verify: medical terms are correctly spelled (check post-processor output)
9. Click "Copy Note" — verify clipboard has the full note
10. Click "Export PDF" — verify PDF generates
```

### Test 2: Ollama Not Running
```
1. Stop Ollama (kill the process)
2. Launch app
3. Verify: warning toast appears about Ollama not detected
4. Record a transcript
5. Click "Generate Note"
6. Verify: falls back to rule-based note with a warning message
7. Start Ollama: ollama serve
8. Click "Test Connection" in settings
9. Verify: shows "Connected"
10. Click "Regenerate Note"
11. Verify: now generates with Ollama
```

### Test 3: Verification Pass
```
1. Enable two-pass verification in settings
2. Record a transcript with medical terms
3. Click "Generate Note"
4. Verify: UI shows "Pass 1/2 — Generating..."
5. Verify: UI updates to "Pass 2/2 — Verifying accuracy..."
6. Verify: final note appears with corrections if any were found
```

### Test 4: Long Transcript
```
1. Use demo mode or record a 5+ minute encounter
2. Click "Generate Note"
3. Verify: generation completes within 2 minutes
4. Verify: note is coherent and covers the full encounter
5. Verify: no timeout error
```

### Test 5: Ollama Crash Mid-Generation
```
1. Start recording, build a transcript
2. Click "Generate Note"
3. While text is streaming in, kill Ollama: pkill ollama
4. Verify: app shows partial note with "incomplete" warning
5. Verify: app does not crash
6. Verify: transcript is still intact
```

---

## 4.7 CSS Addition (Optional)

Add a style for the incomplete note warning:

```css
.note-warning {
  background: rgba(255, 170, 0, 0.15);
  border: 1px solid rgba(255, 170, 0, 0.3);
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 12px;
  font-size: 0.85rem;
  color: var(--text-secondary);
}
```

---

## 4.8 What NOT To Touch

- **Do NOT modify `buildClinicalPrompt()` or `buildVerificationPrompt()`** — the prompt engineering is tested and production-ready
- **Do NOT modify `postProcessNote()`** — the medical term corrections and safety rules are calibrated
- **Do NOT modify `parseOllamaResponse()`** — the resilient parser handles multiple response formats
- **Do NOT change the streaming UI pattern** (creating a div, streaming into it, then parsing into sections) — this is the tested flow
- **Do NOT add streaming cancellation to the verification pass** — it's intentionally short and should always complete

---

## 4.9 Files Modified Summary

| File | Changes |
|------|---------|
| `src/app.js` | Startup health check with retry, model validation, generation timeout, context overflow detection, empty response retry, partial note recovery, connection lost handling |
| `src/styles.css` | `.note-warning` class (1 block) |
| `src-tauri/src/ollama_proxy.rs` | **Only if CSP blocks direct fetch** — Rust proxy for Ollama streaming |
| `src-tauri/Cargo.toml` | **Only if proxy needed** — add `reqwest`, `futures-util` |
| `tauri.conf.json` | Verify CSP includes `http://localhost:11434` in `connect-src` |

**Expected outcome after Phase 4:** The full pipeline works end-to-end inside Tauri. Record a conversation → transcription appears in real-time → click Generate Note → clinical note streams in → sections are parsed and displayed → PDF can be exported. If Ollama goes down at any point, the app degrades gracefully without crashing or losing data.
