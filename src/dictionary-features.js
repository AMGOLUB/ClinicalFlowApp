/* ============================================================
   CLINICALFLOW — Dictionary-Powered Features
   Tooltips, phrase palette, autocomplete, tooth labels
   ============================================================ */
import { App, tauriInvoke } from './state.js';
import { D, toast, esc } from './ui.js';
import {
  MEDICATIONS_GENERIC, MEDICATIONS_BRAND,
  DENTAL_CONDITIONS, DENTAL_PROCEDURES, DENTAL_ANATOMY,
  RADIOLOGY_MODALITIES, RADIOLOGY_CONTRAST, RADIOLOGY_FINDINGS,
  RADIOLOGY_PROCEDURES, RADIOLOGY_SCORING, RADIOLOGY_ANATOMY, RADIOLOGY_DEVICES
} from './medical-dictionary.js';

/* ── Lazy-loaded dictionary data ── */
let _medDict = null;
let _dentalDict = null;
let _radDict = null;
let _dictLoaded = false;

async function _loadDict(name) {
  try {
    if (window.__TAURI__) {
      const raw = await tauriInvoke('load_dictionary', { name });
      return JSON.parse(raw);
    } else {
      const r = await fetch(`${name}.json`);
      if (!r.ok) return null;
      return r.json();
    }
  } catch { return null; }
}

export async function loadDictionaries() {
  if (_dictLoaded) return;
  const [med, dental, rad] = await Promise.all([
    _loadDict('medical-dictionary'),
    _loadDict('dental-dictionary'),
    _loadDict('radiology-dictionary')
  ]);
  _medDict = med;
  _dentalDict = dental;
  _radDict = rad;
  _dictLoaded = true;
  _buildLookups();
}

/* ── Lookup Maps (built once after load) ── */
const _abbrMap = new Map();   // abbreviation → expansion
const _medMap = new Map();    // medication name → {generic, brand, class}
const _scoringMap = new Map();// scoring system → {categories, descriptors}
const _toothMap = new Map();  // "#N" → {name, type, location}

function _buildLookups() {
  // Abbreviations — merge from all dictionaries
  if (_medDict?.abbreviations) {
    const abbrs = _medDict.abbreviations;
    for (const [k, v] of Object.entries(abbrs)) {
      _abbrMap.set(k.toLowerCase(), v);
    }
  }
  if (_radDict?.abbreviations) {
    const sections = _radDict.abbreviations;
    for (const cat of Object.values(sections)) {
      if (typeof cat === 'object' && !Array.isArray(cat)) {
        for (const [k, v] of Object.entries(cat)) {
          _abbrMap.set(k.toLowerCase(), v);
        }
      }
    }
  }
  if (_dentalDict?.abbreviations) {
    const abbrs = _dentalDict.abbreviations;
    if (typeof abbrs === 'object') {
      for (const [k, v] of Object.entries(abbrs)) {
        if (typeof v === 'string') _abbrMap.set(k.toLowerCase(), v);
        else if (typeof v === 'object' && !Array.isArray(v)) {
          for (const [k2, v2] of Object.entries(v)) {
            _abbrMap.set(k2.toLowerCase(), v2);
          }
        }
      }
    }
  }

  // Medications — build from medical-dictionary.json
  if (_medDict?.medications) {
    for (const m of _medDict.medications) {
      const entry = { generic: m.generic, brand: m.brand, class: m.class };
      _medMap.set(m.generic.toLowerCase(), entry);
      // Map brand names too
      if (m.brand) {
        for (const b of m.brand.split(',')) {
          _medMap.set(b.trim().toLowerCase(), entry);
        }
      }
    }
  }

  // Scoring systems from radiology dictionary
  if (_radDict?.scoring_systems) {
    for (const [name, data] of Object.entries(_radDict.scoring_systems)) {
      _scoringMap.set(name.toLowerCase(), { name, ...data });
    }
  }

  // Tooth numbering from dental dictionary
  if (_dentalDict?.tooth_numbering?.permanent_teeth) {
    for (const t of _dentalDict.tooth_numbering.permanent_teeth) {
      _toothMap.set(t.number, { name: t.name, type: t.type, location: t.location });
    }
  }
}

/* ── Tooltip Infrastructure ── */
let _tooltipEl = null;
let _hideTimer = null;

function _ensureTooltip() {
  if (_tooltipEl) return _tooltipEl;
  _tooltipEl = document.createElement('div');
  _tooltipEl.className = 'cf-tooltip';
  _tooltipEl.setAttribute('role', 'tooltip');
  document.body.appendChild(_tooltipEl);
  _tooltipEl.addEventListener('mouseenter', () => clearTimeout(_hideTimer));
  _tooltipEl.addEventListener('mouseleave', () => _hideTooltip());
  return _tooltipEl;
}

function _showTooltip(html, anchor) {
  const tip = _ensureTooltip();
  clearTimeout(_hideTimer);
  tip.innerHTML = html;
  tip.classList.add('visible');
  // Position near anchor
  const rect = anchor.getBoundingClientRect();
  const tipW = 300;
  let left = rect.left + rect.width / 2 - tipW / 2;
  if (left < 8) left = 8;
  if (left + tipW > window.innerWidth - 8) left = window.innerWidth - tipW - 8;
  let top = rect.bottom + 6;
  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
  tip.style.maxWidth = tipW + 'px';
  // If overflows bottom, show above
  requestAnimationFrame(() => {
    const tipRect = tip.getBoundingClientRect();
    if (tipRect.bottom > window.innerHeight - 8) {
      tip.style.top = (rect.top - tipRect.height - 6) + 'px';
    }
  });
}

function _hideTooltip() {
  _hideTimer = setTimeout(() => {
    if (_tooltipEl) _tooltipEl.classList.remove('visible');
  }, 150);
}

/* ── Tooltip Content Builders ── */

function _abbrTooltipHTML(term) {
  const key = term.toLowerCase();
  const expansion = _abbrMap.get(key);
  if (!expansion) return null;
  return `<div class="cf-tip-label">Abbreviation</div><div class="cf-tip-term">${esc(term)}</div><div class="cf-tip-def">${esc(expansion)}</div>`;
}

function _medTooltipHTML(term) {
  const key = term.toLowerCase();
  const med = _medMap.get(key);
  if (!med) return null;
  return `<div class="cf-tip-label">Medication</div><div class="cf-tip-term">${esc(med.generic)}</div>${med.brand ? `<div class="cf-tip-row"><span class="cf-tip-key">Brand:</span> ${esc(med.brand)}</div>` : ''}${med.class ? `<div class="cf-tip-row"><span class="cf-tip-key">Class:</span> ${esc(med.class)}</div>` : ''}`;
}

function _scoringTooltipHTML(term) {
  const key = term.toLowerCase();
  const sys = _scoringMap.get(key);
  if (!sys) return null;
  let html = `<div class="cf-tip-label">Scoring System</div><div class="cf-tip-term">${esc(sys.name)}</div>`;
  if (sys.categories) {
    const cats = typeof sys.categories === 'object' ? Object.entries(sys.categories) : [];
    if (cats.length > 0) {
      html += '<div class="cf-tip-cats">';
      for (const [k, v] of cats.slice(0, 8)) {
        html += `<div class="cf-tip-cat"><span class="cf-tip-cat-key">${esc(k)}</span> ${esc(v)}</div>`;
      }
      if (cats.length > 8) html += `<div class="cf-tip-cat">... +${cats.length - 8} more</div>`;
      html += '</div>';
    }
  }
  return html;
}

function _toothTooltipHTML(term) {
  // Match tooth numbers like #19, #3, tooth 19, etc.
  const match = term.match(/#?(\d{1,2})/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  const tooth = _toothMap.get(num);
  if (!tooth) return null;
  return `<div class="cf-tip-label">Tooth #${num}</div><div class="cf-tip-term">${esc(tooth.name)}</div><div class="cf-tip-row"><span class="cf-tip-key">Type:</span> ${esc(tooth.type)}</div><div class="cf-tip-row"><span class="cf-tip-key">Location:</span> ${esc(tooth.location)}</div>`;
}

/* ── Event Delegation for Tooltips ── */

function _handleTermHover(e) {
  const span = e.target.closest('.medication-term, .medical-term, .procedure-term, .anatomy-term, .dental-term');
  if (!span) return;
  const text = span.textContent.trim();
  let html = null;

  // Try abbreviation first (short terms are likely abbreviations)
  if (text.length <= 8) html = _abbrTooltipHTML(text);
  // Try medication
  if (!html && span.classList.contains('medication-term')) html = _medTooltipHTML(text);
  // Try scoring system
  if (!html) html = _scoringTooltipHTML(text);
  // Try abbreviation for longer terms too
  if (!html) html = _abbrTooltipHTML(text);

  if (html) _showTooltip(html, span);
}

function _handleTermLeave(e) {
  const span = e.target.closest('.medication-term, .medical-term, .procedure-term, .anatomy-term, .dental-term');
  if (span) _hideTooltip();
}

/* ── Phrase Palette ── */

let _paletteEl = null;
let _paletteVisible = false;

function _getPhrases() {
  const fmt = App.noteFormat || 'soap';
  const phrases = [];
  if (fmt.startsWith('radiology') && _radDict) {
    if (_radDict.normal_findings_phrases) {
      for (const [cat, arr] of Object.entries(_radDict.normal_findings_phrases)) {
        if (Array.isArray(arr)) {
          phrases.push({ category: cat.replace(/_/g, ' '), items: arr.slice(0, 12) });
        }
      }
    }
    if (_radDict.report_structure) {
      const rs = _radDict.report_structure;
      if (rs.findings_phrases) phrases.push({ category: 'Findings Phrases', items: rs.findings_phrases.slice(0, 10) });
      if (rs.recommendation_phrases) phrases.push({ category: 'Recommendations', items: rs.recommendation_phrases.slice(0, 10) });
    }
  } else if (fmt.startsWith('dental') && _dentalDict) {
    // Use standard dental phrases from conditions
    const dentalPhrases = [
      'No dental caries observed',
      'Gingival tissues appear healthy with no signs of inflammation',
      'Oral hygiene is fair, with moderate plaque accumulation',
      'Probing depths within normal limits (1-3mm)',
      'No evidence of bone loss on radiographic examination',
      'All restorations appear intact and functional',
      'Soft tissue examination within normal limits',
      'Occlusion is Class I with no premature contacts',
      'TMJ examination unremarkable, no clicking or crepitus',
      'Patient reports no pain or sensitivity'
    ];
    phrases.push({ category: 'Standard Findings', items: dentalPhrases });
  } else {
    // General medical phrases
    const generalPhrases = [
      'Patient is alert and oriented x3',
      'No acute distress',
      'Heart regular rate and rhythm, no murmurs',
      'Lungs clear to auscultation bilaterally',
      'Abdomen soft, non-tender, non-distended',
      'Extremities without edema',
      'Neurologically intact',
      'Skin warm and dry, no rashes',
      'Range of motion full and symmetric',
      'Deep tendon reflexes 2+ bilaterally'
    ];
    phrases.push({ category: 'Physical Exam', items: generalPhrases });
    const rosNeg = [
      'Denies fever, chills, or night sweats',
      'Denies chest pain, palpitations, or dyspnea',
      'Denies nausea, vomiting, or diarrhea',
      'Denies headache, dizziness, or vision changes',
      'Denies dysuria, frequency, or urgency'
    ];
    phrases.push({ category: 'ROS Negatives', items: rosNeg });
  }
  return phrases;
}

function _buildPalette() {
  if (_paletteEl) _paletteEl.remove();
  _paletteEl = document.createElement('div');
  _paletteEl.className = 'cf-phrase-palette';
  _paletteEl.innerHTML = `<div class="cf-palette-header"><span>Quick Phrases</span><button class="cf-palette-close">&times;</button></div><div class="cf-palette-body"></div>`;
  const body = _paletteEl.querySelector('.cf-palette-body');
  const phrases = _getPhrases();
  for (const group of phrases) {
    const cat = document.createElement('div');
    cat.className = 'cf-palette-cat';
    cat.innerHTML = `<div class="cf-palette-cat-title">${esc(group.category)}</div>`;
    for (const phrase of group.items) {
      const btn = document.createElement('button');
      btn.className = 'cf-palette-item';
      btn.textContent = typeof phrase === 'string' ? phrase : phrase.phrase || phrase;
      btn.addEventListener('click', () => _insertPhrase(typeof phrase === 'string' ? phrase : phrase.phrase || phrase));
      cat.appendChild(btn);
    }
    body.appendChild(cat);
  }
  _paletteEl.querySelector('.cf-palette-close').addEventListener('click', closePalette);
  document.body.appendChild(_paletteEl);
}

function _insertPhrase(text) {
  // Insert into currently focused/active note section
  const activeEl = document.activeElement;
  if (activeEl && activeEl.closest('.note-section-body')) {
    // Insert at cursor in contentEditable
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
    }
    toast('Phrase inserted', 'success');
  } else {
    // Copy to clipboard as fallback
    navigator.clipboard.writeText(text).then(() => toast('Phrase copied', 'success')).catch(() => {});
  }
}

export function togglePalette() {
  if (_paletteVisible) closePalette();
  else openPalette();
}

export function openPalette() {
  _buildPalette();
  _paletteEl.classList.add('visible');
  _paletteVisible = true;
}

export function closePalette() {
  if (_paletteEl) {
    _paletteEl.classList.remove('visible');
    _paletteVisible = false;
  }
}

/* ── Autocomplete for Note Editing ── */

let _acEl = null;
let _acTimer = null;

function _getAutocompleteSuggestions(prefix) {
  const lower = prefix.toLowerCase();
  const results = [];
  const fmt = App.noteFormat || 'soap';

  // Match against appropriate term lists based on template
  let lists = [];
  if (fmt.startsWith('radiology')) {
    lists = [RADIOLOGY_MODALITIES, RADIOLOGY_CONTRAST, RADIOLOGY_FINDINGS, RADIOLOGY_PROCEDURES, RADIOLOGY_ANATOMY, RADIOLOGY_DEVICES];
  } else if (fmt.startsWith('dental')) {
    lists = [DENTAL_CONDITIONS, DENTAL_PROCEDURES, DENTAL_ANATOMY];
  }
  // Always include general medical
  lists.push(MEDICATIONS_GENERIC, MEDICATIONS_BRAND);

  for (const list of lists) {
    for (const term of list) {
      if (term.toLowerCase().startsWith(lower) && term.toLowerCase() !== lower) {
        results.push(term);
        if (results.length >= 8) return results;
      }
    }
  }
  return results;
}

function _showAutocomplete(suggestions, anchor, replaceStart, replaceEnd) {
  _hideAutocomplete();
  if (suggestions.length === 0) return;
  _acEl = document.createElement('div');
  _acEl.className = 'cf-autocomplete';
  for (const s of suggestions) {
    const item = document.createElement('div');
    item.className = 'cf-ac-item';
    item.textContent = s;
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      _applyAutocomplete(s, replaceStart, replaceEnd);
    });
    _acEl.appendChild(item);
  }
  document.body.appendChild(_acEl);
  // Position near the text cursor
  const sel = window.getSelection();
  if (sel && sel.rangeCount) {
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    _acEl.style.left = rect.left + 'px';
    _acEl.style.top = (rect.bottom + 4) + 'px';
  }
}

function _applyAutocomplete(term, replaceStart, replaceEnd) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  const range = document.createRange();
  range.setStart(replaceStart.node, replaceStart.offset);
  range.setEnd(replaceEnd.node, replaceEnd.offset);
  range.deleteContents();
  range.insertNode(document.createTextNode(term));
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
  _hideAutocomplete();
}

function _hideAutocomplete() {
  if (_acEl) { _acEl.remove(); _acEl = null; }
}

function _handleNoteInput(e) {
  clearTimeout(_acTimer);
  const el = e.target;
  if (!el.closest('.note-section-body')) return;

  _acTimer = setTimeout(() => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) { _hideAutocomplete(); return; }
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) { _hideAutocomplete(); return; }

    const text = node.textContent;
    const offset = range.startOffset;
    // Find the current word being typed
    let start = offset;
    while (start > 0 && /\S/.test(text[start - 1])) start--;
    const word = text.slice(start, offset);

    if (word.length < 3) { _hideAutocomplete(); return; }

    const suggestions = _getAutocompleteSuggestions(word);
    if (suggestions.length > 0) {
      _showAutocomplete(suggestions, el, { node, offset: start }, { node, offset });
    } else {
      _hideAutocomplete();
    }
  }, 200);
}

/* ── Tooth Number Highlighting in Notes ── */

export function addToothTooltips(container) {
  if (!container) return;
  // Find #N patterns and wrap them with tooltip triggers
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const toothRegex = /#(\d{1,2})\b/g;
  const nodesToProcess = [];
  let node;
  while ((node = walker.nextNode())) {
    if (toothRegex.test(node.textContent)) {
      nodesToProcess.push(node);
    }
    toothRegex.lastIndex = 0;
  }
  for (const textNode of nodesToProcess) {
    const frag = document.createDocumentFragment();
    let lastIdx = 0;
    const text = textNode.textContent;
    toothRegex.lastIndex = 0;
    let m;
    while ((m = toothRegex.exec(text))) {
      const num = parseInt(m[1], 10);
      if (num < 1 || num > 32) continue;
      if (m.index > lastIdx) frag.appendChild(document.createTextNode(text.slice(lastIdx, m.index)));
      const span = document.createElement('span');
      span.className = 'tooth-number-ref';
      span.dataset.tooth = num;
      span.textContent = m[0];
      frag.appendChild(span);
      lastIdx = toothRegex.lastIndex;
    }
    if (lastIdx < text.length) frag.appendChild(document.createTextNode(text.slice(lastIdx)));
    if (lastIdx > 0) textNode.parentNode.replaceChild(frag, textNode);
  }
}

/* ── Initialize All Dictionary Features ── */

export function initDictionaryFeatures() {
  // Tooltip event delegation on transcript and note containers
  const containers = [D.txContent, D.noteContent].filter(Boolean);
  for (const c of containers) {
    c.addEventListener('mouseover', _handleTermHover);
    c.addEventListener('mouseout', _handleTermLeave);
    // Tooth number tooltips
    c.addEventListener('mouseover', (e) => {
      const span = e.target.closest('.tooth-number-ref');
      if (!span) return;
      const html = _toothTooltipHTML(span.textContent);
      if (html) _showTooltip(html, span);
    });
    c.addEventListener('mouseout', (e) => {
      if (e.target.closest('.tooth-number-ref')) _hideTooltip();
    });
  }

  // Autocomplete on note editing
  if (D.noteContent) {
    D.noteContent.addEventListener('input', _handleNoteInput);
    D.noteContent.addEventListener('blur', () => setTimeout(_hideAutocomplete, 200), true);
  }

  // Load dictionaries in background
  loadDictionaries();
}

/* ── Export lookup functions for external use ── */
export function getAbbrExpansion(term) { return _abbrMap.get(term.toLowerCase()) || null; }
export function getMedInfo(term) { return _medMap.get(term.toLowerCase()) || null; }
export function getScoringInfo(term) { return _scoringMap.get(term.toLowerCase()) || null; }
export function getToothInfo(num) { return _toothMap.get(num) || null; }
