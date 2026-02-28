/* ============================================================
   CLINICALFLOW — Pure Utility Functions (zero imports, zero DOM)
   Testable in Node without any browser or Tauri environment.
   ============================================================ */

/* ── Formatting ── */

export const fmt = s => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
export const wc = t => t && t.trim() ? t.trim().split(/\s+/).length : 0;
export const rInt = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
export const wait = ms => new Promise(r => setTimeout(r, ms));
export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

/* ── HTML Escaping (Node-safe, no DOM) ── */

export function escPure(t) {
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ── Medical Term Highlighting (from comprehensive dictionary) ── */

export { hlTerms, MED_TERMS, MED_RX } from './medical-dictionary.js';

/* ── Transcript Corrections ── */

export function applyLiveCorrections(t, corrections) {
  for (const [pattern, replacement] of corrections) { t = t.replace(pattern, replacement); }
  return t;
}

/* ── Note Utilities ── */

export function estimateTokens(text) { return Math.ceil(text.length / 4); }

export function formatNoteMarkdown(text, escapeFn) {
  const esc = escapeFn || escPure;
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

export function extractCorrectedNote(verifyText) {
  const marker = 'CORRECTED NOTE:';
  const idx = verifyText.indexOf(marker);
  if (idx !== -1) return verifyText.substring(idx + marker.length).trim();
  const lowerIdx = verifyText.toLowerCase().indexOf('corrected note:');
  if (lowerIdx !== -1) return verifyText.substring(lowerIdx + 'corrected note:'.length).trim();
  return verifyText;
}

export function postProcessNote(text, transcript, corrections) {
  let result = text;
  for (const [pattern, replacement] of corrections) { result = result.replace(pattern, replacement); }
  if (/diabetes|blood sugar|glucose|A1C|fasting|hyperglycemia/i.test(result) || /diabetes|blood sugar|glucose|A1C|fasting/i.test(transcript)) {
    result = result.replace(/\bLipitor\b(?=.*(?:daily with breakfast|once daily|diabetes|blood sugar|glucose))/gi, 'glipizide');
  }
  const leakPatterns = [
    /^[-*\s]*If no (?:exam|symptoms|findings).*$/gm,
    /^[-*\s]*Use the.*section headers.*$/gm,
    /^[-*\s]*Output ONLY.*$/gm,
    /^[-*\s]*Do not (?:use the instructional|output these).*$/gm,
    /^[-*\s]*Generate the (?:note|clinical).*$/gm,
    /^[-*\s]*Use short clean labels.*$/gm,
    /^[-*\s]*Never echo.*instructions.*$/gm,
    /^[-*\s]*\[use (?:date|duration|speakers) (?:below|provided|above)\].*$/gmi,
    /^[-*\s]*\[(?:list all|all reasons|if mentioned|if any|exact numbers|every vital)\].*$/gmi,
  ];
  for (const pat of leakPatterns) { result = result.replace(pat, ''); }
  result = result.replace(/((?:blood pressure|BP|systolic)[:\s]*?)(\d{1,3})(\s*[/\\]\s*)(\d{1,3})/gi, (match, prefix, sys, sep, dia) => {
    const s = parseInt(sys), d = parseInt(dia);
    if (s < 50 && (s + 100) >= 80 && (s + 100) <= 250) return prefix + String(s + 100) + sep + dia;
    if (s < 50 && (s + 10) >= 80 && (s + 10) <= 250) return prefix + String(s + 10) + sep + dia;
    return match;
  });
  result = result.replace(/((?:heart rate|HR|pulse)[:\s]*)(\d{1,3})\s*(?:bpm|beats)/gi, (match, prefix, hr) => {
    const h = parseInt(hr);
    if (h < 10 && (h * 10) >= 40 && (h * 10) <= 200) return match.replace(hr, String(h * 10));
    return match;
  });
  result = result.replace(/^[-*\s]*(?:None stated|None discussed|Not mentioned|None documented|N\/A)\s*$/gm, '');
  result = result.replace(/\n{3,}/g, '\n\n').trim();
  return result;
}

export function parseOllamaResponse(text, noteFormat, noteTitle) {
  const _ft = { soap: 'SOAP Note', hpi: 'HPI-Focused Note', problem: 'Problem-Oriented Note' };
  const _title = noteTitle || _ft[noteFormat] || 'Clinical Note';
  try {
    const trimmed = text.trim();
    if (trimmed.startsWith('{')) {
      const json = JSON.parse(trimmed);
      const parts = Object.entries(json).map(([key, val], i) => ({ key: `ai-section-${i}`, title: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), content: typeof val === 'string' ? val : JSON.stringify(val, null, 2) }));
      if (parts.length > 0) { return { title: _title, sections: parts }; }
    }
  } catch (e) {}

  const headerPatterns = [/\*\*([A-Z][A-Z &/\-:()0-9]+(?:\[.*?\])?)\**/g, /^#{1,3}\s+([A-Z][A-Z &/\-:()0-9]+)/gm, /^={3,}\s*([A-Z][A-Z &/\-:()0-9]+)\s*={3,}/gm];
  let parts = [];
  for (const regex of headerPatterns) {
    let lastIdx = 0, lastTitle = null, match; regex.lastIndex = 0; const tempParts = [];
    while ((match = regex.exec(text)) !== null) { if (lastTitle !== null) { tempParts.push({ title: lastTitle, content: text.substring(lastIdx, match.index).trim() }); } lastTitle = match[1].trim(); lastIdx = match.index + match[0].length; }
    if (lastTitle !== null) { tempParts.push({ title: lastTitle, content: text.substring(lastIdx).trim() }); }
    if (tempParts.length > parts.length) parts = tempParts;
  }
  if (parts.length === 0) {
    const colonHeaders = /^([A-Z][A-Za-z &/\-()]+):$/gm; let lastIdx = 0, lastTitle = null, match;
    while ((match = colonHeaders.exec(text)) !== null) { if (lastTitle !== null) { parts.push({ title: lastTitle, content: text.substring(lastIdx, match.index).trim() }); } lastTitle = match[1].trim(); lastIdx = match.index + match[0].length; }
    if (lastTitle !== null) { parts.push({ title: lastTitle, content: text.substring(lastIdx).trim() }); }
  }
  if (parts.length === 0) { parts.push({ title: 'Clinical Note', content: text.trim() }); }
  const sections = parts.map((p, i) => ({ key: `ai-section-${i}`, title: p.title.replace(/\*+|#+|=+/g, '').trim(), content: p.content.replace(/^\n+|\n+$/g, '').replace(/\*\*([^*]+)\*\*/g, '$1') }));
  return { title: _title, sections };
}
