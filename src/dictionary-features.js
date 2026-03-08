/* ============================================================
   CLINICALFLOW — Dictionary-Powered Features
   Tooltips, phrase palette, autocomplete, tooth labels
   ============================================================ */
import { App, cfg, tauriInvoke } from './state.js';
import { D, toast, esc } from './ui.js';
import { startInputDictation, isInputDictating, stopInputDictation } from './notes.js';
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
  } catch(e) { console.warn('[Dict] Failed to load', name, e); return null; }
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
  // Fallback: if JSON dicts failed, build basic lookups from inline imports
  if (_medMap.size === 0) _buildFallbackLookups();
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

/* Fallback: build basic med lookups from inline imports when JSON dicts fail to load */
function _buildFallbackLookups() {
  console.debug('[Dict] Using fallback inline lookups');
  for (const name of MEDICATIONS_GENERIC) {
    if (!_medMap.has(name.toLowerCase())) _medMap.set(name.toLowerCase(), { generic: name, brand: '', class: '' });
  }
  for (const name of MEDICATIONS_BRAND) {
    if (!_medMap.has(name.toLowerCase())) _medMap.set(name.toLowerCase(), { generic: name, brand: name, class: '' });
  }
  // Basic tooth numbering fallback
  if (_toothMap.size === 0) {
    const TOOTH_NAMES = ['','Central Incisor','Lateral Incisor','Canine','1st Premolar','2nd Premolar','1st Molar','2nd Molar','3rd Molar'];
    const QUADS = [{ start: 1, side: 'Upper Right' }, { start: 9, side: 'Upper Left' }, { start: 17, side: 'Lower Left' }, { start: 25, side: 'Lower Right' }];
    for (const q of QUADS) {
      for (let i = 0; i < 8; i++) {
        const num = q.start + i;
        _toothMap.set(num, { name: TOOTH_NAMES[i + 1] || `Tooth ${num}`, type: i < 3 ? 'Anterior' : 'Posterior', location: q.side });
      }
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
  if (!App.settings.dictionaryFeatures) return;
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

/* ── Favorite Phrases Persistence ── */

function _favKey() {
  const fmt = App.noteFormat || 'soap';
  return `ms-favorite-phrases-${fmt}`;
}

function _loadFavorites() {
  try {
    const raw = cfg.get(_favKey(), '[]');
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

function _saveFavorites(favs) {
  cfg.set(_favKey(), JSON.stringify(favs));
}

function _isFavorite(text) {
  return _loadFavorites().includes(text);
}

function _toggleFavorite(text) {
  const favs = _loadFavorites();
  const idx = favs.indexOf(text);
  if (idx >= 0) { favs.splice(idx, 1); }
  else { favs.unshift(text); }
  _saveFavorites(favs);
  return idx < 0; // returns true if now favorited
}

function _addCustomPhrase(text) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const favs = _loadFavorites();
  if (favs.includes(trimmed)) return false;
  favs.unshift(trimmed);
  _saveFavorites(favs);
  return true;
}

function _removeCustomPhrase(text) {
  const favs = _loadFavorites();
  const idx = favs.indexOf(text);
  if (idx >= 0) { favs.splice(idx, 1); _saveFavorites(favs); }
}

function _isBuiltInPhrase(text) {
  const phrases = _getPhrases();
  for (const group of phrases) {
    for (const p of group.items) {
      if ((typeof p === 'string' ? p : p.phrase || p) === text) return true;
    }
  }
  return false;
}

function _buildPalette() {
  if (_paletteEl) _paletteEl.remove();
  _paletteEl = document.createElement('div');
  _paletteEl.className = 'cf-phrase-palette';
  _paletteEl.innerHTML = `<div class="cf-palette-header"><span>Quick Phrases</span><div class="cf-palette-header-actions"><span class="cf-palette-grip" title="Drag to move">&#x2261;&#x2261;</span><button class="cf-palette-close">&times;</button></div></div><div class="cf-palette-body"></div>`;
  const body = _paletteEl.querySelector('.cf-palette-body');

  // Custom phrase input
  const inputRow = document.createElement('div');
  inputRow.className = 'cf-palette-add-row';
  inputRow.innerHTML = `<textarea class="cf-palette-add-input" placeholder="Add custom phrase..." maxlength="200" rows="1"></textarea><button class="cf-palette-mic-btn" title="Dictate phrase"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg></button><button class="cf-palette-add-btn" title="Add phrase">+</button>`;
  const input = inputRow.querySelector('textarea');
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 80) + 'px'; });
  const addBtn = inputRow.querySelector('.cf-palette-add-btn');
  const micBtn = inputRow.querySelector('.cf-palette-mic-btn');
  micBtn.addEventListener('click', () => {
    if (isInputDictating()) { stopInputDictation(); }
    else { startInputDictation(input, micBtn); }
  });
  const doAdd = () => {
    if (_addCustomPhrase(input.value)) {
      input.value = '';
      _buildPalette();
      _paletteEl.classList.add('visible');
      toast('Phrase added', 'success');
    } else if (input.value.trim()) {
      toast('Phrase already exists', 'warning');
    }
  };
  addBtn.addEventListener('click', doAdd);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
  body.appendChild(inputRow);

  // Favorites section
  const favs = _loadFavorites();
  if (favs.length > 0) {
    const favCat = document.createElement('div');
    favCat.className = 'cf-palette-cat';
    favCat.innerHTML = `<div class="cf-palette-cat-title cf-palette-fav-title">★ Favorites</div>`;
    for (let fi = 0; fi < favs.length; fi++) {
      const text = favs[fi];
      const row = document.createElement('div');
      row.className = 'cf-palette-item-row';
      row.dataset.favIdx = fi;
      const btn = document.createElement('button');
      btn.className = 'cf-palette-item cf-palette-item--fav';
      btn.textContent = text;
      btn.addEventListener('click', () => _insertPhrase(text));
      btn.addEventListener('dblclick', (e) => {
        e.preventDefault(); e.stopPropagation();
        btn.contentEditable = 'true';
        btn.classList.add('editing');
        btn.focus();
        // Select all text
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(btn);
        sel.removeAllRanges(); sel.addRange(range);
        const commit = () => {
          btn.contentEditable = 'false';
          btn.classList.remove('editing');
          const newText = btn.textContent.trim();
          if (newText && newText !== text) {
            const favs = _loadFavorites();
            const idx = favs.indexOf(text);
            if (idx !== -1) { favs[idx] = newText; _saveFavorites(favs); }
            toast('Phrase updated', 'success');
          } else if (!newText) {
            btn.textContent = text; // revert if emptied
          }
          btn.removeEventListener('blur', commit);
        };
        btn.addEventListener('blur', commit);
        btn.addEventListener('keydown', (ke) => {
          if (ke.key === 'Enter') { ke.preventDefault(); btn.blur(); }
          if (ke.key === 'Escape') { btn.textContent = text; btn.blur(); }
        });
      });

      // Drag handle
      const drag = document.createElement('span');
      drag.className = 'cf-palette-drag';
      drag.title = 'Drag to reorder';
      drag.textContent = '\u2261';
      drag.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        const rect = row.getBoundingClientRect();
        const offsetY = e.clientY - rect.top;
        const ghost = row.cloneNode(true);
        ghost.classList.add('cf-palette-ghost');
        ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;z-index:10000;pointer-events:none;opacity:0.85;`;
        document.body.appendChild(ghost);
        const placeholder = document.createElement('div');
        placeholder.className = 'cf-palette-placeholder';
        placeholder.style.height = rect.height + 'px';
        row.parentElement.insertBefore(placeholder, row);
        row.style.display = 'none';
        let raf = 0;
        const onMove = (ev) => {
          ev.preventDefault();
          cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => {
            ghost.style.top = (ev.clientY - offsetY) + 'px';
            const el = document.elementFromPoint(ev.clientX, ev.clientY);
            if (!el) return;
            const target = el.closest('.cf-palette-item-row[data-fav-idx]');
            if (target && target !== row) {
              const tr = target.getBoundingClientRect();
              if (ev.clientY < tr.top + tr.height / 2) target.parentElement.insertBefore(placeholder, target);
              else target.parentElement.insertBefore(placeholder, target.nextSibling);
            }
          });
        };
        const onUp = () => {
          cancelAnimationFrame(raf);
          ghost.remove();
          row.style.display = '';
          placeholder.parentElement.insertBefore(row, placeholder);
          placeholder.remove();
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          // Read new order from DOM and persist
          const newFavs = [];
          favCat.querySelectorAll('.cf-palette-item-row[data-fav-idx]').forEach(r => {
            const idx = parseInt(r.dataset.favIdx, 10);
            if (favs[idx] !== undefined) newFavs.push(favs[idx]);
          });
          _saveFavorites(newFavs);
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });

      const star = document.createElement('button');
      star.className = 'cf-palette-star active';
      star.textContent = '★';
      star.title = 'Remove from favorites';
      star.addEventListener('click', (e) => {
        e.stopPropagation();
        _toggleFavorite(text);
        _buildPalette();
        _paletteEl.classList.add('visible');
      });
      row.appendChild(drag);
      row.appendChild(btn);
      row.appendChild(star);
      // If it's a custom phrase (not in built-in list), show delete button
      if (!_isBuiltInPhrase(text)) {
        const del = document.createElement('button');
        del.className = 'cf-palette-delete';
        del.textContent = '×';
        del.title = 'Delete custom phrase';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          _removeCustomPhrase(text);
          _buildPalette();
          _paletteEl.classList.add('visible');
          toast('Phrase removed', 'success');
        });
        row.appendChild(del);
      }
      favCat.appendChild(row);
    }
    body.appendChild(favCat);
  }

  // Built-in phrase categories
  const phrases = _getPhrases();
  for (const group of phrases) {
    const cat = document.createElement('div');
    cat.className = 'cf-palette-cat';
    cat.innerHTML = `<div class="cf-palette-cat-title">${esc(group.category)}</div>`;
    for (const phrase of group.items) {
      const text = typeof phrase === 'string' ? phrase : phrase.phrase || phrase;
      const row = document.createElement('div');
      row.className = 'cf-palette-item-row';
      const btn = document.createElement('button');
      btn.className = 'cf-palette-item';
      btn.textContent = text;
      btn.addEventListener('click', () => _insertPhrase(text));
      const star = document.createElement('button');
      star.className = 'cf-palette-star' + (_isFavorite(text) ? ' active' : '');
      star.textContent = _isFavorite(text) ? '★' : '☆';
      star.title = _isFavorite(text) ? 'Remove from favorites' : 'Add to favorites';
      star.addEventListener('click', (e) => {
        e.stopPropagation();
        _toggleFavorite(text);
        _buildPalette();
        _paletteEl.classList.add('visible');
      });
      row.appendChild(btn);
      row.appendChild(star);
      cat.appendChild(row);
    }
    body.appendChild(cat);
  }
  _paletteEl.querySelector('.cf-palette-close').addEventListener('click', closePalette);

  // ── Draggable window ──
  const header = _paletteEl.querySelector('.cf-palette-header');
  header.style.cursor = 'grab';
  let _dragState = null;
  header.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.cf-palette-close')) return;
    e.preventDefault();
    header.style.cursor = 'grabbing';
    header.setPointerCapture(e.pointerId);
    const rect = _paletteEl.getBoundingClientRect();
    // Switch from CSS-positioned to explicit top/left on first drag
    _paletteEl.style.right = 'auto';
    _paletteEl.style.bottom = 'auto';
    _paletteEl.style.left = rect.left + 'px';
    _paletteEl.style.top = rect.top + 'px';
    _dragState = { startX: e.clientX, startY: e.clientY, origLeft: rect.left, origTop: rect.top };
    _curX = rect.left; _curY = rect.top; _targetX = rect.left; _targetY = rect.top;
    _paletteEl.classList.add('dragging');
    _animFrame = requestAnimationFrame(_renderLoop);
  });
  const SNAP_DIST = 48; // px — snap zone near edges
  const SNAP_PAD = 12;  // px — gap from edge when snapped
  let _snappedEdge = null;
  let _targetX = 0, _targetY = 0, _curX = 0, _curY = 0;
  let _animFrame = 0;

  function _renderLoop() {
    if (!_dragState) return;
    // Lerp current position toward target — 0.25 = smooth, responsive
    _curX += (_targetX - _curX) * 0.25;
    _curY += (_targetY - _curY) * 0.25;
    // Snap to exact pixel when close enough to avoid endless sub-pixel jitter
    if (Math.abs(_targetX - _curX) < 0.5) _curX = _targetX;
    if (Math.abs(_targetY - _curY) < 0.5) _curY = _targetY;
    _paletteEl.style.left = _curX + 'px';
    _paletteEl.style.top = _curY + 'px';
    _animFrame = requestAnimationFrame(_renderLoop);
  }

  header.addEventListener('pointermove', (e) => {
    if (!_dragState) return;
    const dx = e.clientX - _dragState.startX;
    const dy = e.clientY - _dragState.startY;
    let newLeft = _dragState.origLeft + dx;
    let newTop = _dragState.origTop + dy;
    const w = _paletteEl.offsetWidth, h = _paletteEl.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    newLeft = Math.max(0, Math.min(vw - w, newLeft));
    newTop = Math.max(0, Math.min(vh - h, newTop));
    // Snap to edges
    _snappedEdge = null;
    if (newLeft < SNAP_DIST) { newLeft = SNAP_PAD; _snappedEdge = 'l'; }
    else if (newLeft > vw - w - SNAP_DIST) { newLeft = vw - w - SNAP_PAD; _snappedEdge = (_snappedEdge || '') + 'r'; }
    if (newTop < SNAP_DIST) { newTop = SNAP_PAD; _snappedEdge = (_snappedEdge || '') + 't'; }
    else if (newTop > vh - h - SNAP_DIST) { newTop = vh - h - SNAP_PAD; _snappedEdge = (_snappedEdge || '') + 'b'; }
    _paletteEl.classList.toggle('snapping', !!_snappedEdge);
    _targetX = newLeft;
    _targetY = newTop;
  });
  const endDrag = () => {
    if (!_dragState) return;
    _dragState = null;
    cancelAnimationFrame(_animFrame);
    // Settle to final target
    _paletteEl.style.left = _targetX + 'px';
    _paletteEl.style.top = _targetY + 'px';
    header.style.cursor = 'grab';
    _paletteEl.classList.remove('dragging');
    // Animate snap landing
    if (_snappedEdge) {
      _paletteEl.classList.add('snap-land');
      setTimeout(() => _paletteEl.classList.remove('snap-land'), 250);
    }
    _paletteEl.classList.remove('snapping');
    _snappedEdge = null;
    // Remember position
    try { localStorage.setItem('cf-palette-pos', JSON.stringify({ left: parseInt(_paletteEl.style.left), top: parseInt(_paletteEl.style.top) })); } catch(e) {}
  };
  header.addEventListener('pointerup', endDrag);
  header.addEventListener('pointercancel', endDrag);

  // Restore saved position
  try {
    const saved = JSON.parse(localStorage.getItem('cf-palette-pos'));
    if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
      const w = 320, h = 440; // max dimensions
      const left = Math.max(0, Math.min(window.innerWidth - w, saved.left));
      const top = Math.max(0, Math.min(window.innerHeight - h, saved.top));
      _paletteEl.style.right = 'auto';
      _paletteEl.style.bottom = 'auto';
      _paletteEl.style.left = left + 'px';
      _paletteEl.style.top = top + 'px';
    }
  } catch(e) {}

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
  if (!App.settings.dictionaryFeatures) return;
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
  if (!App.settings.dictionaryFeatures) return;
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
  if (!container || !App.settings.dictionaryFeatures) return;
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
      if (!App.settings.dictionaryFeatures) return;
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
