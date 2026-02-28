/* ============================================================
   CLINICALFLOW — Interactive Dental Chart Module
   SVG tooth chart with two-tier popup (state + surfaces),
   adult/primary toggle, and AI prompt serialization.
   ============================================================ */
import { App } from './state.js';

/* ── Constants ── */

export const TOOTH_STATES = [
  { id: 'healthy',  label: 'Healthy',       color: '#34D399' },
  { id: 'decay',    label: 'Decay/Caries',  color: '#F87171' },
  { id: 'missing',  label: 'Missing',       color: '#64748B' },
  { id: 'restored', label: 'Restored',      color: '#60A5FA' },
  { id: 'implant',  label: 'Implant',       color: '#A78BFA' },
  { id: 'rct',      label: 'Root Canal',    color: '#FBBF24' },
  { id: 'fracture', label: 'Fracture',      color: '#FB923C' },
  { id: 'impacted', label: 'Impacted',      color: '#E879F9' },
];

/* ── Perio Constants & Setters ── */

export const PERIO_SITES = ['MB','B','DB','ML','L','DL'];
const MULTI_ROOTED = new Set([
  '1','2','3','4','5','12','13','14','15','16',
  '17','18','19','20','21','28','29','30','31','32',
  'A','B','I','J','K','L','S','T'
]);

function _ensurePerio(toothId) {
  if (!App.dentalChart) App.dentalChart = { mode: 'adult', teeth: {} };
  if (!App.dentalChart.teeth) App.dentalChart.teeth = {};
  if (!App.dentalChart.teeth[toothId]) App.dentalChart.teeth[toothId] = { state: 'healthy' };
  if (!App.dentalChart.teeth[toothId].perio)
    App.dentalChart.teeth[toothId].perio = {
      depths: [0,0,0,0,0,0],
      bop: [false,false,false,false,false,false],
      recession: 0,
      mobility: 0,
      furcation: 0
    };
  return App.dentalChart.teeth[toothId].perio;
}

export function setPerioDepths(toothId, depths, bopFlags) {
  const p = _ensurePerio(toothId);
  for (let i = 0; i < 6; i++) {
    if (depths[i] != null) p.depths[i] = depths[i];
    if (bopFlags?.[i] != null) p.bop[i] = bopFlags[i];
  }
}

export function setPerioSiteDepth(toothId, siteIdx, depth, bop) {
  const p = _ensurePerio(toothId);
  p.depths[siteIdx] = depth;
  if (bop != null) p.bop[siteIdx] = bop;
}

export function setPerioMobility(toothId, grade) {
  _ensurePerio(toothId).mobility = grade;
}

export function setPerioFurcation(toothId, cls) {
  if (MULTI_ROOTED.has(String(toothId))) _ensurePerio(toothId).furcation = cls;
}

export function setPerioRecession(toothId, mm) {
  _ensurePerio(toothId).recession = mm;
}

export function isMultiRooted(toothId) {
  return MULTI_ROOTED.has(String(toothId));
}

const SURFACE_STATES = ['decay', 'restored', 'fracture'];

const WIDTHS = { molar3: 20, molar: 22, premolar: 18, canine: 16, latIncisor: 14, centIncisor: 16 };
const GAP = 2, MID_GAP = 4, CROWN_H = 26, RX = 3;

/* ── Tooth Data ── */

const ADULT_UPPER = [
  { id: '1',  type: 'molar3',     name: 'UR 3rd Molar' },
  { id: '2',  type: 'molar',      name: 'UR 2nd Molar' },
  { id: '3',  type: 'molar',      name: 'UR 1st Molar' },
  { id: '4',  type: 'premolar',   name: 'UR 2nd Premolar' },
  { id: '5',  type: 'premolar',   name: 'UR 1st Premolar' },
  { id: '6',  type: 'canine',     name: 'UR Canine' },
  { id: '7',  type: 'latIncisor', name: 'UR Lateral Incisor' },
  { id: '8',  type: 'centIncisor',name: 'UR Central Incisor' },
  { id: '9',  type: 'centIncisor',name: 'UL Central Incisor' },
  { id: '10', type: 'latIncisor', name: 'UL Lateral Incisor' },
  { id: '11', type: 'canine',     name: 'UL Canine' },
  { id: '12', type: 'premolar',   name: 'UL 1st Premolar' },
  { id: '13', type: 'premolar',   name: 'UL 2nd Premolar' },
  { id: '14', type: 'molar',      name: 'UL 1st Molar' },
  { id: '15', type: 'molar',      name: 'UL 2nd Molar' },
  { id: '16', type: 'molar3',     name: 'UL 3rd Molar' },
];

const ADULT_LOWER = [
  { id: '32', type: 'molar3',     name: 'LR 3rd Molar' },
  { id: '31', type: 'molar',      name: 'LR 2nd Molar' },
  { id: '30', type: 'molar',      name: 'LR 1st Molar' },
  { id: '29', type: 'premolar',   name: 'LR 2nd Premolar' },
  { id: '28', type: 'premolar',   name: 'LR 1st Premolar' },
  { id: '27', type: 'canine',     name: 'LR Canine' },
  { id: '26', type: 'latIncisor', name: 'LR Lateral Incisor' },
  { id: '25', type: 'centIncisor',name: 'LR Central Incisor' },
  { id: '24', type: 'centIncisor',name: 'LL Central Incisor' },
  { id: '23', type: 'latIncisor', name: 'LL Lateral Incisor' },
  { id: '22', type: 'canine',     name: 'LL Canine' },
  { id: '21', type: 'premolar',   name: 'LL 1st Premolar' },
  { id: '20', type: 'premolar',   name: 'LL 2nd Premolar' },
  { id: '19', type: 'molar',      name: 'LL 1st Molar' },
  { id: '18', type: 'molar',      name: 'LL 2nd Molar' },
  { id: '17', type: 'molar3',     name: 'LL 3rd Molar' },
];

const PRIMARY_UPPER = [
  { id: 'A', type: 'molar',      name: 'UR 2nd Molar (primary)' },
  { id: 'B', type: 'molar',      name: 'UR 1st Molar (primary)' },
  { id: 'C', type: 'canine',     name: 'UR Canine (primary)' },
  { id: 'D', type: 'latIncisor', name: 'UR Lateral Incisor (primary)' },
  { id: 'E', type: 'centIncisor',name: 'UR Central Incisor (primary)' },
  { id: 'F', type: 'centIncisor',name: 'UL Central Incisor (primary)' },
  { id: 'G', type: 'latIncisor', name: 'UL Lateral Incisor (primary)' },
  { id: 'H', type: 'canine',     name: 'UL Canine (primary)' },
  { id: 'I', type: 'molar',      name: 'UL 1st Molar (primary)' },
  { id: 'J', type: 'molar',      name: 'UL 2nd Molar (primary)' },
];

const PRIMARY_LOWER = [
  { id: 'T', type: 'molar',      name: 'LR 2nd Molar (primary)' },
  { id: 'S', type: 'molar',      name: 'LR 1st Molar (primary)' },
  { id: 'R', type: 'canine',     name: 'LR Canine (primary)' },
  { id: 'Q', type: 'latIncisor', name: 'LR Lateral Incisor (primary)' },
  { id: 'P', type: 'centIncisor',name: 'LR Central Incisor (primary)' },
  { id: 'O', type: 'centIncisor',name: 'LL Central Incisor (primary)' },
  { id: 'N', type: 'latIncisor', name: 'LL Lateral Incisor (primary)' },
  { id: 'M', type: 'canine',     name: 'LL Canine (primary)' },
  { id: 'L', type: 'molar',      name: 'LL 1st Molar (primary)' },
  { id: 'K', type: 'molar',      name: 'LL 2nd Molar (primary)' },
];

function _teethForMode(mode) {
  return mode === 'primary'
    ? { upper: PRIMARY_UPPER, lower: PRIMARY_LOWER }
    : { upper: ADULT_UPPER, lower: ADULT_LOWER };
}

function _isPosterior(type) {
  return type === 'molar3' || type === 'molar' || type === 'premolar';
}

function _surfacesFor(toothId, mode) {
  const { upper, lower } = _teethForMode(mode);
  const t = [...upper, ...lower].find(x => x.id === toothId);
  if (!t) return [];
  return _isPosterior(t.type) ? ['M', 'O', 'D', 'B', 'L'] : ['M', 'I', 'D', 'F', 'L'];
}

/* ── View Mode (Chart / Perio) ── */

let _viewMode = 'chart';
export function setViewMode(m) { _viewMode = m; }
export function getViewMode() { return _viewMode; }

/* ── SVG Generation ── */

function _archWidth(teeth) {
  let w = 0;
  const half = teeth.length / 2;
  for (let i = 0; i < teeth.length; i++) {
    w += WIDTHS[teeth[i].type];
    if (i < teeth.length - 1) w += (i === half - 1) ? MID_GAP : GAP;
  }
  return w;
}

function _buildArch(teeth, startY, labelY, labelAbove) {
  const VW = 480;
  const totalW = _archWidth(teeth);
  let x = (VW - totalW) / 2;
  const half = teeth.length / 2;
  let svg = '';
  const positions = {};
  for (let i = 0; i < teeth.length; i++) {
    const t = teeth[i];
    const w = WIDTHS[t.type];
    const cx = x + w / 2;
    positions[t.id] = { x, y: startY, w, cx };
    svg += `<g class="tooth-group" data-tooth="${t.id}">`;
    svg += `<rect class="tooth-hit" x="${x - 1}" y="${startY - 2}" width="${w + 2}" height="${CROWN_H + 4}" fill="transparent"/>`;
    svg += `<rect class="tooth-outline" x="${x}" y="${startY}" width="${w}" height="${CROWN_H}" rx="${RX}"/>`;
    svg += `<text class="tooth-label" x="${cx}" y="${labelY}">${t.id}</text>`;
    svg += '</g>';
    x += w + (i === half - 1 ? MID_GAP : GAP);
  }
  return { svg, positions };
}

function buildToothChartSVG(mode, perioMode) {
  const { upper, lower } = _teethForMode(mode);
  const VW = 480, VH = perioMode ? 230 : 200;
  const upperY = perioMode ? 50 : 40;
  const lowerY = perioMode ? 130 : 120;
  const upperLabelY = upperY - 6;
  const lowerLabelY = lowerY + CROWN_H + 14;
  let svg = `<svg viewBox="0 0 ${VW} ${VH}" xmlns="http://www.w3.org/2000/svg" class="dental-chart-svg">`;
  svg += `<text class="arch-label" x="${VW / 2}" y="${perioMode ? 16 : 16}">UPPER</text>`;
  svg += `<text class="arch-label" x="${VW / 2}" y="${VH - 2}">LOWER</text>`;
  svg += `<line x1="${VW / 2}" y1="22" x2="${VW / 2}" y2="${VH - 10}" stroke="var(--border-subtle)" stroke-width="1" stroke-dasharray="3,3" opacity="0.4"/>`;
  const upperResult = _buildArch(upper, upperY, upperLabelY, true);
  const lowerResult = _buildArch(lower, lowerY, lowerLabelY, false);
  svg += upperResult.svg;
  svg += lowerResult.svg;
  if (perioMode) {
    svg += _buildPerioOverlay(upperResult.positions, true, upperY);
    svg += _buildPerioOverlay(lowerResult.positions, false, lowerY);
  }
  svg += '</svg>';
  return svg;
}

/* ── Perio SVG Overlay — "Pill & Layer" Model ── */

/* Pill dimensions */
const PILL_W = 12, PILL_H = 10, PILL_RX = 3;
const BOP_R = 2; /* BOP indicator radius */

function _depthColor(d) {
  if (d <= 3) return '#34D399';
  if (d === 4) return '#FBBF24';
  return '#F87171';
}

/* A single depth "pill": <g> containing background <rect> + foreground <text> + optional BOP circle */
/* spreadIdx: -1 (left), 0 (center), 1 (right) — used for hover expansion */
function _pill(x, y, depth, bop, spreadIdx) {
  const bg = _depthColor(depth);
  const tx = depth >= 10 ? '5.5' : '7'; /* font-size adjustment for 2-digit numbers */
  let s = `<g class="perio-pill" data-dx="${spreadIdx || 0}">`;
  s += `<rect x="${x}" y="${y}" width="${PILL_W}" height="${PILL_H}" rx="${PILL_RX}" fill="${bg}" opacity="0.9"/>`;
  s += `<text x="${x + PILL_W / 2}" y="${y + PILL_H - 2.5}" text-anchor="middle" font-size="${tx}" font-weight="700" fill="#0B0F14" class="perio-depth-text">${depth}</text>`;
  if (bop) {
    /* BOP: red circle anchored to top-right corner of pill */
    s += `<circle cx="${x + PILL_W - 1}" cy="${y + 1}" r="${BOP_R}" fill="#DC2626" stroke="#0B0F14" stroke-width="0.5"/>`;
  }
  s += `</g>`;
  return s;
}

/* Badge pill for mobility / recession — smaller, distinct color */
function _badgePill(cx, y, label, bgColor) {
  const bw = label.length * 5 + 6;
  let s = `<g class="perio-badge-pill">`;
  s += `<rect x="${cx - bw / 2}" y="${y}" width="${bw}" height="9" rx="2" fill="${bgColor}" opacity="0.85"/>`;
  s += `<text x="${cx}" y="${y + 7}" text-anchor="middle" font-size="5.5" font-weight="700" fill="#0B0F14">${label}</text>`;
  s += `</g>`;
  return s;
}

function _buildPerioOverlay(positions, isUpper, archY) {
  const teeth = App.dentalChart?.teeth || {};
  let svg = '';
  for (const [id, pos] of Object.entries(positions)) {
    const d = teeth[id];
    if (!d?.perio) continue;
    const p = d.perio;
    const hasData = p.depths.some(v => v > 0);
    if (!hasData) continue;
    const { cx, w } = pos;
    /* Space 3 pills evenly across the tooth width */
    const pillSpacing = Math.min((w - PILL_W) / 2, PILL_W + 1);
    const pillOffsets = [-pillSpacing, 0, pillSpacing];

    /* Wrap all perio elements for this tooth in a group for hover expansion */
    const midY = archY + CROWN_H / 2;
    svg += `<g class="perio-tooth-data" data-perio-tooth="${id}" style="transform-origin:${cx}px ${midY}px">`;

    /* Buccal depths (sites 0-2) — above upper teeth, below lower teeth */
    const spreadDir = [-1, 0, 1]; /* left, center, right */
    const buccalY = isUpper ? archY - PILL_H - 3 : archY + CROWN_H + 3;
    for (let i = 0; i < 3; i++) {
      const depth = p.depths[i];
      if (depth <= 0) continue;
      const px = cx + pillOffsets[i] - PILL_W / 2;
      svg += _pill(px, buccalY, depth, p.bop[i], spreadDir[i]);
    }

    /* Lingual depths (sites 3-5) — below upper teeth, above lower teeth */
    const lingualY = isUpper ? archY + CROWN_H + 3 : archY - PILL_H - 3;
    for (let i = 3; i < 6; i++) {
      const depth = p.depths[i];
      if (depth <= 0) continue;
      const px = cx + pillOffsets[i - 3] - PILL_W / 2;
      svg += _pill(px, lingualY, depth, p.bop[i], spreadDir[i - 3]);
    }

    /* Mobility badge — purple pill */
    if (p.mobility > 0) {
      const mobY = isUpper ? archY + CROWN_H + 16 : archY - PILL_H - 14;
      svg += _badgePill(cx, mobY, `M${p.mobility}`, '#A78BFA');
    }

    /* Furcation indicator — orange triangle between roots */
    if (p.furcation > 0 && MULTI_ROOTED.has(String(id))) {
      const furcY = isUpper ? archY + CROWN_H + 26 : archY - PILL_H - 24;
      const fill = p.furcation >= 2 ? '#FB923C' : 'none';
      const opacity = p.furcation === 2 ? '0.5' : '1';
      svg += `<polygon points="${cx - 3},${furcY + 5} ${cx + 3},${furcY + 5} ${cx},${furcY}" fill="${fill}" fill-opacity="${opacity}" stroke="#FB923C" stroke-width="0.8"/>`;
    }

    /* Recession badge — orange pill */
    if (p.recession > 0) {
      const recY = isUpper
        ? archY + CROWN_H + (p.mobility > 0 ? 28 : 16)
        : archY - PILL_H - (p.mobility > 0 ? 24 : 14);
      svg += _badgePill(cx, recY, `R${p.recession}`, '#FB923C');
    }

    svg += '</g>';
  }
  return svg;
}

/* ── Rendering ── */

let _el = null;

export function renderDentalChart(containerEl) {
  _el = containerEl;
  const mode = App.dentalChart?.mode || 'adult';
  const perioMode = _viewMode === 'perio';
  containerEl.innerHTML = _modeToggleHTML(mode) + buildToothChartSVG(mode, perioMode);
  _applyStates();
  const legend = document.getElementById('dentalChartLegend');
  if (legend) _renderLegend(legend);
  containerEl.querySelectorAll('.tooth-group').forEach(g => {
    g.addEventListener('click', e => {
      e.stopPropagation();
      if (perioMode) _showPerioPopup(g.dataset.tooth, g);
      else _showPopup(g.dataset.tooth, g);
    });
    if (perioMode) {
      const SPREAD_PX = 6;
      g.addEventListener('mouseenter', () => {
        const overlay = containerEl.querySelector(`[data-perio-tooth="${g.dataset.tooth}"]`);
        if (!overlay) return;
        overlay.classList.add('perio-expanded');
        overlay.parentNode.appendChild(overlay);
        overlay.querySelectorAll('.perio-pill').forEach(pill => {
          const dx = Number(pill.dataset.dx) || 0;
          pill.style.transform = `translateX(${dx * SPREAD_PX}px)`;
        });
      });
      g.addEventListener('mouseleave', () => {
        const overlay = containerEl.querySelector(`[data-perio-tooth="${g.dataset.tooth}"]`);
        if (!overlay) return;
        overlay.classList.remove('perio-expanded');
        overlay.querySelectorAll('.perio-pill').forEach(pill => { pill.style.transform = ''; });
      });
    }
  });
  containerEl.querySelectorAll('.dental-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => switchDentitionMode(btn.dataset.mode));
  });
}

function _modeToggleHTML(active) {
  return `<div class="dental-mode-toggle"><button class="dental-mode-btn${active === 'adult' ? ' active' : ''}" data-mode="adult">Adult (1-32)</button><button class="dental-mode-btn${active === 'primary' ? ' active' : ''}" data-mode="primary">Primary (A-T)</button></div>`;
}

function _applyStates() {
  if (!_el) return;
  const teeth = App.dentalChart?.teeth || {};
  _el.querySelectorAll('.tooth-group').forEach(g => {
    const id = g.dataset.tooth;
    const d = teeth[id];
    const rect = g.querySelector('.tooth-outline');
    if (!rect) return;
    if (d && d.state && d.state !== 'healthy') {
      const s = TOOTH_STATES.find(x => x.id === d.state);
      rect.style.fill = s ? s.color : '';
      if (d.state === 'missing') rect.style.opacity = '0.35';
      else rect.style.opacity = '';
    } else {
      rect.style.fill = '';
      rect.style.opacity = '';
    }
  });
}

/* Render a non-interactive preview in the sidebar */
export function renderDentalPreview() {
  const el = document.getElementById('dentalChartPreview');
  if (!el) return;
  const mode = App.dentalChart?.mode || 'adult';
  const label = mode === 'adult' ? 'Adult' : 'Primary';
  el.innerHTML =
    `<div class="dental-preview-label">${label}</div>`
    + `<div class="dental-preview-row">`
    +   `<button class="dental-preview-chevron" data-pmode-prev>&#x25C2;</button>`
    +   `<div class="dental-preview-svg">${buildToothChartSVG(mode)}</div>`
    +   `<button class="dental-preview-chevron" data-pmode-next>&#x25B8;</button>`
    + `</div>`;
  /* Wire chevrons */
  el.querySelectorAll('[data-pmode-prev],[data-pmode-next]').forEach(btn => {
    btn.addEventListener('click', () => {
      switchDentitionMode(mode === 'adult' ? 'primary' : 'adult');
      renderDentalPreview();
    });
  });
  /* Apply tooth state colors */
  const teeth = App.dentalChart?.teeth || {};
  el.querySelectorAll('.tooth-group').forEach(g => {
    const id = g.dataset.tooth;
    const d = teeth[id];
    const rect = g.querySelector('.tooth-outline');
    if (!rect) return;
    if (d && d.state && d.state !== 'healthy') {
      const s = TOOTH_STATES.find(x => x.id === d.state);
      rect.style.fill = s ? s.color : '';
      if (d.state === 'missing') rect.style.opacity = '0.35';
      else rect.style.opacity = '';
    }
  });
}

function _renderLegend(el) {
  el.innerHTML = TOOTH_STATES.map(s =>
    `<span class="dental-legend-chip"><span class="dental-legend-dot" style="background:${s.color}"></span>${s.label}</span>`
  ).join('');
}

export function switchDentitionMode(mode) {
  if (!App.dentalChart) App.dentalChart = { mode: 'adult', teeth: {} };
  App.dentalChart.mode = mode;
  if (_el) renderDentalChart(_el);
}

/* ── Two-Tier Popup ── */

let _popup = null;
let _activeToothId = null;  /* track which tooth's popup is open */

function _pulseToothGroup(toothGroup) {
  const outline = toothGroup.querySelector('.tooth-outline');
  if (!outline) return;
  outline.classList.add('tooth-pressed');
  setTimeout(() => outline.classList.remove('tooth-pressed'), 200);
}

function _showPopup(toothId, toothGroup) {
  /* Toggle: if same tooth clicked, close and return */
  if (_popup && _activeToothId === toothId) {
    _animatePopupOut();
    return;
  }
  /* Close existing popup (no animation — instant swap) */
  if (_popup) { _popup.remove(); _popup = null; _activeToothId = null; }

  /* Pulse the tooth */
  _pulseToothGroup(toothGroup);

  const mode = App.dentalChart?.mode || 'adult';
  const { upper, lower } = _teethForMode(mode);
  const info = [...upper, ...lower].find(t => t.id === toothId);
  if (!info) return;

  if (!App.dentalChart) App.dentalChart = { mode: 'adult', teeth: {} };
  if (!App.dentalChart.teeth) App.dentalChart.teeth = {};
  const cur = App.dentalChart.teeth[toothId] || { state: 'healthy' };
  const surfaces = _surfacesFor(toothId, mode);

  const div = document.createElement('div');
  div.className = 'tooth-popup';

  /* Title */
  const prefix = mode === 'primary' ? 'Tooth ' : 'Tooth #';
  div.innerHTML = `<div class="tooth-popup-title">${prefix}${toothId} — ${info.name}</div>`;

  /* Tier 1: State chips */
  const statesWrap = document.createElement('div');
  statesWrap.className = 'tooth-popup-states';
  for (const s of TOOTH_STATES) {
    const btn = document.createElement('button');
    btn.className = 'tooth-popup-option' + (cur.state === s.id ? ' active' : '');
    btn.innerHTML = `<span class="tooth-popup-dot" style="background:${s.color}"></span>${s.label}`;
    btn.addEventListener('click', () => _selectState(toothId, s.id, btn, div, surfaces));
    /* Press-down feedback */
    btn.addEventListener('mousedown', () => btn.classList.add('pressing'));
    btn.addEventListener('mouseup', () => btn.classList.remove('pressing'));
    btn.addEventListener('mouseleave', () => btn.classList.remove('pressing'));
    statesWrap.appendChild(btn);
  }
  div.appendChild(statesWrap);

  /* Tier 2: Surface checkboxes (shown if surface-requiring state) */
  const surfWrap = document.createElement('div');
  surfWrap.className = 'tooth-popup-surfaces';
  surfWrap.style.display = SURFACE_STATES.includes(cur.state) ? '' : 'none';
  surfWrap.innerHTML = '<div class="tooth-popup-surface-label">Surfaces:</div>';
  const chips = document.createElement('div');
  chips.className = 'tooth-surface-chips';
  for (const sf of surfaces) {
    const b = document.createElement('button');
    b.className = 'tooth-surface-chip' + ((cur.surfaces || []).includes(sf) ? ' active' : '');
    b.textContent = sf;
    b.addEventListener('click', () => _toggleSurface(toothId, sf, b));
    /* Press-down feedback */
    b.addEventListener('mousedown', () => b.classList.add('pressing'));
    b.addEventListener('mouseup', () => b.classList.remove('pressing'));
    b.addEventListener('mouseleave', () => b.classList.remove('pressing'));
    chips.appendChild(b);
  }
  surfWrap.appendChild(chips);
  div.appendChild(surfWrap);

  /* Position relative to container */
  const cRect = _el.getBoundingClientRect();
  const tRect = toothGroup.getBoundingClientRect();
  const popW = 210;
  let left = tRect.left - cRect.left + tRect.width / 2 - popW / 2;
  let top = tRect.bottom - cRect.top + 6;
  if (left < 2) left = 2;
  if (left + popW > cRect.width) left = cRect.width - popW;
  /* If popup would go below container, show above tooth */
  if (top + 200 > cRect.height + 80) top = tRect.top - cRect.top - 180;

  div.style.left = left + 'px';
  div.style.top = top + 'px';
  _el.style.position = 'relative';
  _el.appendChild(div);
  _popup = div;
  _activeToothId = toothId;

  /* Trigger entrance animation on next frame */
  requestAnimationFrame(() => div.classList.add('visible'));

  setTimeout(() => {
    document.addEventListener('click', _docClick);
    document.addEventListener('keydown', _docKey);
  }, 0);
}

function _docClick(e) { if (_popup && !_popup.contains(e.target)) _animatePopupOut(); }
function _docKey(e) { if (e.key === 'Escape') _animatePopupOut(); }

function _animatePopupOut() {
  if (!_popup) return;
  const el = _popup;
  el.classList.remove('visible');
  el.classList.add('closing');
  _activeToothId = null;
  document.removeEventListener('click', _docClick);
  document.removeEventListener('keydown', _docKey);
  el.addEventListener('transitionend', () => { el.remove(); }, { once: true });
  /* Safety fallback in case transitionend doesn't fire */
  setTimeout(() => { if (el.parentNode) el.remove(); }, 200);
  _popup = null;
}

function _hidePopup() {
  if (_popup) { _popup.remove(); _popup = null; _activeToothId = null; }
  document.removeEventListener('click', _docClick);
  document.removeEventListener('keydown', _docKey);
}

/* ── Perio Popup (click tooth in perio mode) ── */

function _showPerioPopup(toothId, toothGroup) {
  if (_popup && _activeToothId === toothId) { _animatePopupOut(); return; }
  if (_popup) { _popup.remove(); _popup = null; _activeToothId = null; }

  _pulseToothGroup(toothGroup);
  const mode = App.dentalChart?.mode || 'adult';
  const { upper, lower } = _teethForMode(mode);
  const info = [...upper, ...lower].find(t => t.id === toothId);
  if (!info) return;

  const p = App.dentalChart?.teeth?.[toothId]?.perio || { depths:[0,0,0,0,0,0], bop:[false,false,false,false,false,false], recession:0, mobility:0, furcation:0 };
  const prefix = mode === 'primary' ? 'Tooth ' : 'Tooth #';

  const div = document.createElement('div');
  div.className = 'tooth-popup perio-popup';
  div.innerHTML = `<div class="tooth-popup-title">${prefix}${toothId} — Perio</div>`;

  /* Depth inputs — 2 rows of 3 */
  const labels = ['MB','B','DB','ML','L','DL'];
  const dWrap = document.createElement('div');
  dWrap.className = 'perio-popup-depths';
  dWrap.innerHTML = '<div class="perio-popup-label">Depths (mm)</div>';
  const grid = document.createElement('div');
  grid.className = 'perio-depth-grid';
  for (let i = 0; i < 6; i++) {
    const cell = document.createElement('div');
    cell.className = 'perio-depth-cell';
    cell.innerHTML = `<label class="perio-depth-lbl">${labels[i]}</label><input type="number" min="0" max="15" class="perio-depth-input" data-idx="${i}" value="${p.depths[i] || ''}"><label class="perio-bop-lbl"><input type="checkbox" class="perio-bop-check" data-idx="${i}" ${p.bop[i] ? 'checked' : ''}> BOP</label>`;
    grid.appendChild(cell);
  }
  dWrap.appendChild(grid);
  div.appendChild(dWrap);

  /* Mobility / Recession / Furcation */
  const extras = document.createElement('div');
  extras.className = 'perio-popup-extras';
  extras.innerHTML = `<div class="perio-extra-row"><label>Mobility</label><select class="perio-select" id="perioMob"><option value="0" ${p.mobility===0?'selected':''}>—</option><option value="1" ${p.mobility===1?'selected':''}>Grade 1</option><option value="2" ${p.mobility===2?'selected':''}>Grade 2</option><option value="3" ${p.mobility===3?'selected':''}>Grade 3</option></select></div><div class="perio-extra-row"><label>Recession (mm)</label><input type="number" min="0" max="15" class="perio-select" id="perioRec" value="${p.recession || ''}"></div>${MULTI_ROOTED.has(String(toothId)) ? `<div class="perio-extra-row"><label>Furcation</label><select class="perio-select" id="perioFurc"><option value="0" ${p.furcation===0?'selected':''}>—</option><option value="1" ${p.furcation===1?'selected':''}>Class I</option><option value="2" ${p.furcation===2?'selected':''}>Class II</option><option value="3" ${p.furcation===3?'selected':''}>Class III</option></select></div>` : ''}`;
  div.appendChild(extras);

  /* Save button */
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-primary btn-sm perio-save-btn';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', () => {
    const depths = [], bops = [];
    div.querySelectorAll('.perio-depth-input').forEach(inp => { depths.push(parseInt(inp.value) || 0); });
    div.querySelectorAll('.perio-bop-check').forEach(chk => { bops.push(chk.checked); });
    setPerioDepths(toothId, depths, bops);
    const mob = parseInt(div.querySelector('#perioMob')?.value) || 0;
    setPerioMobility(toothId, mob);
    const rec = parseInt(div.querySelector('#perioRec')?.value) || 0;
    setPerioRecession(toothId, rec);
    const furcEl = div.querySelector('#perioFurc');
    if (furcEl) setPerioFurcation(toothId, parseInt(furcEl.value) || 0);
    updateDentalSummary();
    _hidePopup();
    if (_el) renderDentalChart(_el);
  });
  div.appendChild(saveBtn);

  /* Position */
  const cRect = _el.getBoundingClientRect();
  const tRect = toothGroup.getBoundingClientRect();
  const popW = 240;
  let left = tRect.left - cRect.left + tRect.width / 2 - popW / 2;
  let top = tRect.bottom - cRect.top + 6;
  if (left < 2) left = 2;
  if (left + popW > cRect.width) left = cRect.width - popW;
  if (top + 260 > cRect.height + 80) top = tRect.top - cRect.top - 260;

  div.style.left = left + 'px';
  div.style.top = top + 'px';
  _el.style.position = 'relative';
  _el.appendChild(div);
  _popup = div;
  _activeToothId = toothId;

  requestAnimationFrame(() => div.classList.add('visible'));
  setTimeout(() => {
    document.addEventListener('click', _docClick);
    document.addEventListener('keydown', _docKey);
  }, 0);
}

function _selectState(toothId, stateId, chipEl, popupEl, surfaces) {
  popupEl.querySelectorAll('.tooth-popup-option').forEach(c => c.classList.remove('active'));
  chipEl.classList.add('active');

  if (stateId === 'healthy') {
    delete App.dentalChart.teeth[toothId];
    _applyStates();
    updateDentalSummary();
    _hidePopup();
    return;
  }

  if (SURFACE_STATES.includes(stateId)) {
    const prev = App.dentalChart.teeth[toothId];
    App.dentalChart.teeth[toothId] = { state: stateId, surfaces: prev?.surfaces || [] };
    popupEl.querySelector('.tooth-popup-surfaces').style.display = '';
  } else {
    App.dentalChart.teeth[toothId] = { state: stateId };
    _applyStates();
    updateDentalSummary();
    _hidePopup();
    return;
  }
  _applyStates();
  updateDentalSummary();
}

function _toggleSurface(toothId, surface, btn) {
  const d = App.dentalChart.teeth[toothId];
  if (!d) return;
  if (!d.surfaces) d.surfaces = [];
  const idx = d.surfaces.indexOf(surface);
  if (idx >= 0) { d.surfaces.splice(idx, 1); btn.classList.remove('active'); }
  else { d.surfaces.push(surface); btn.classList.add('active'); }
  updateDentalSummary();
}

/* ── Reset ── */

export function resetDentalChart() {
  const mode = App.dentalChart?.mode || 'adult';
  App.dentalChart = { mode, teeth: {} };
  _hidePopup();
  if (_el) renderDentalChart(_el);
  updateDentalSummary();
}

/* ── Prompt Serialization ── */

export function formatDentalChartForPrompt() {
  const teeth = App.dentalChart?.teeth || {};
  const mode = App.dentalChart?.mode || 'adult';
  const entries = Object.entries(teeth).filter(([, d]) => d.state && d.state !== 'healthy');
  const perioTeeth = Object.entries(teeth).filter(([, d]) => d.perio?.depths?.some(v => v > 0));
  if (entries.length === 0 && perioTeeth.length === 0) return '';

  const modeLabel = mode === 'primary' ? 'Primary (Deciduous)' : 'Adult (Permanent)';
  const prefix = mode === 'primary' ? 'Tooth ' : 'Tooth #';

  entries.sort((a, b) => {
    if (mode === 'primary') return a[0].localeCompare(b[0]);
    return parseInt(a[0]) - parseInt(b[0]);
  });

  let out = `DENTAL CHART FINDINGS:\nDentition: ${modeLabel}\n`;
  for (const [id, d] of entries) {
    const lbl = TOOTH_STATES.find(s => s.id === d.state)?.label || d.state;
    let line = `${prefix}${id}: ${lbl}`;
    if (d.surfaces && d.surfaces.length > 0) line += ` — Surfaces: ${d.surfaces.join('')}`;
    out += line + '\n';
  }

  /* Periodontal charting data */
  if (perioTeeth.length > 0) {
    perioTeeth.sort((a, b) => {
      if (mode === 'primary') return a[0].localeCompare(b[0]);
      return parseInt(a[0]) - parseInt(b[0]);
    });
    out += '\n\nPERIODONTAL CHARTING:\n';
    for (const [id, d] of perioTeeth) {
      const p = d.perio;
      let line = `${prefix}${id}: Depths [${p.depths.join(',')}]`;
      const bopCount = p.bop.filter(Boolean).length;
      if (bopCount) line += ` BOP:${bopCount}/6`;
      if (p.recession) line += ` Recession:${p.recession}mm`;
      if (p.mobility) line += ` Mobility:Grade ${p.mobility}`;
      if (p.furcation) line += ` Furcation:Class ${p.furcation}`;
      out += line + '\n';
    }
  }

  return out.trim();
}

export function isDentalTemplate(formatId) {
  return !!formatId && formatId.startsWith('dental_');
}

/* ── Export Helpers (PDF / text) ── */

export function buildDentalChartExportSVG() {
  const teeth = App.dentalChart?.teeth || {};
  const mode = App.dentalChart?.mode || 'adult';
  const entries = Object.entries(teeth).filter(([, d]) => d.state && d.state !== 'healthy');
  const hasPerio = Object.values(teeth).some(d => d.perio?.depths?.some(v => v > 0));
  if (entries.length === 0 && !hasPerio) return '';

  const { upper, lower } = _teethForMode(mode);
  const VW = 480, VH = 200;
  const teethMap = Object.fromEntries(entries);
  const usedStates = [...new Set(entries.map(([, d]) => d.state))];

  function archSVG(archTeeth, startY, labelY) {
    const totalW = _archWidth(archTeeth);
    let x = (VW - totalW) / 2;
    const half = archTeeth.length / 2;
    let s = '';
    for (let i = 0; i < archTeeth.length; i++) {
      const t = archTeeth[i];
      const w = WIDTHS[t.type];
      const cx = x + w / 2;
      const d = teethMap[t.id];
      let fill = '#fff';
      let opacity = 1;
      if (d) {
        const st = TOOTH_STATES.find(z => z.id === d.state);
        if (st) fill = st.color;
        if (d.state === 'missing') opacity = 0.35;
      }
      s += `<rect x="${x}" y="${startY}" width="${w}" height="${CROWN_H}" rx="${RX}" fill="${fill}" fill-opacity="${opacity}" stroke="#94A3B8" stroke-width="1"/>`;
      s += `<text x="${cx}" y="${labelY}" text-anchor="middle" font-size="9" font-family="system-ui,sans-serif" font-weight="600" fill="#334155">${t.id}</text>`;
      x += w + (i === half - 1 ? MID_GAP : GAP);
    }
    return s;
  }

  let svg = `<svg viewBox="0 0 ${VW} ${VH}" xmlns="http://www.w3.org/2000/svg" width="100%">`;
  svg += `<text x="${VW / 2}" y="14" text-anchor="middle" font-size="10" font-family="system-ui,sans-serif" font-weight="700" fill="#64748B" letter-spacing="0.1em">UPPER</text>`;
  svg += `<text x="${VW / 2}" y="${VH - 2}" text-anchor="middle" font-size="10" font-family="system-ui,sans-serif" font-weight="700" fill="#64748B" letter-spacing="0.1em">LOWER</text>`;
  svg += `<line x1="${VW / 2}" y1="20" x2="${VW / 2}" y2="${VH - 10}" stroke="#CBD5E1" stroke-width="1" stroke-dasharray="3,3"/>`;
  svg += archSVG(upper, 38, 32);
  svg += archSVG(lower, 118, 158);
  svg += '</svg>';

  /* Legend — only show states that are present */
  let legend = '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;">';
  for (const sid of usedStates) {
    const st = TOOTH_STATES.find(z => z.id === sid);
    if (!st) continue;
    legend += `<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;color:#64748B;"><span style="width:8px;height:8px;border-radius:50%;background:${st.color};display:inline-block;"></span>${st.label}</span>`;
  }
  legend += '</div>';

  return `<div style="margin-bottom:20px;"><h3 style="font-size:14px;font-weight:700;color:#0891B2;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px 0;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">Dental Chart</h3>${svg}${legend}</div>`;
}

export function buildDentalFindingsExportHTML() {
  const teeth = App.dentalChart?.teeth || {};
  const mode = App.dentalChart?.mode || 'adult';
  const entries = Object.entries(teeth).filter(([, d]) => d.state && d.state !== 'healthy');
  const perioEntries = Object.entries(teeth).filter(([, d]) => d.perio?.depths?.some(v => v > 0));
  if (entries.length === 0 && perioEntries.length === 0) return '';

  const modeLabel = mode === 'primary' ? 'Primary (Deciduous)' : 'Adult (Permanent)';
  const prefix = mode === 'primary' ? 'Tooth ' : 'Tooth #';

  let html = '';

  /* Tooth state findings */
  if (entries.length > 0) {
    entries.sort((a, b) => {
      if (mode === 'primary') return a[0].localeCompare(b[0]);
      return parseInt(a[0]) - parseInt(b[0]);
    });

    let lines = `<div style="font-size:12px;color:#64748B;margin-bottom:8px;">Dentition: ${modeLabel}</div>`;
    for (const [id, d] of entries) {
      const lbl = TOOTH_STATES.find(s => s.id === d.state)?.label || d.state;
      const color = TOOTH_STATES.find(s => s.id === d.state)?.color || '#334155';
      let text = `${prefix}${id}: <span style="color:${color};font-weight:600;">${lbl}</span>`;
      if (d.surfaces && d.surfaces.length > 0) text += ` — Surfaces: ${d.surfaces.join('')}`;
      lines += `<div style="font-size:13px;line-height:1.8;color:#334155;">${text}</div>`;
    }
    html += `<div style="margin-bottom:20px;"><h3 style="font-size:14px;font-weight:700;color:#0891B2;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px 0;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">Dental Chart Findings</h3>${lines}</div>`;
  }

  /* Periodontal findings — clinical narrative */
  if (perioEntries.length > 0) {
    perioEntries.sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
    const totalBop = perioEntries.reduce((s, [, d]) => s + d.perio.bop.filter(Boolean).length, 0);
    const totalSites = perioEntries.length * 6;
    const bopPct = Math.round((totalBop / totalSites) * 100);
    const maxDepth = Math.max(...perioEntries.flatMap(([, d]) => d.perio.depths));
    const sites4plus = perioEntries.reduce((s, [, d]) => s + d.perio.depths.filter(v => v >= 4).length, 0);
    const sites5plus = perioEntries.reduce((s, [, d]) => s + d.perio.depths.filter(v => v >= 5).length, 0);
    const teethWithMobility = perioEntries.filter(([, d]) => d.perio.mobility > 0);
    const teethWithRecession = perioEntries.filter(([, d]) => d.perio.recession > 0);
    const teethWithFurcation = perioEntries.filter(([, d]) => d.perio.furcation > 0);

    let narrative = '';

    /* Summary paragraph */
    narrative += `<p style="font-size:13px;line-height:1.7;color:#334155;margin:0 0 8px 0;">Periodontal charting was completed on ${perioEntries.length} teeth. Probing depths ranged from ${Math.min(...perioEntries.flatMap(([,d]) => d.perio.depths.filter(v => v > 0)))}mm to ${maxDepth}mm. `;
    if (sites5plus > 0) {
      const deep = perioEntries.filter(([, d]) => d.perio.depths.some(v => v >= 5));
      narrative += `Pathologic pocketing (≥5mm) was noted at ${sites5plus} site${sites5plus > 1 ? 's' : ''} involving ${deep.map(([id]) => prefix + id).join(', ')}. `;
    }
    if (sites4plus > 0 && sites4plus !== sites5plus) {
      narrative += `A total of ${sites4plus} site${sites4plus > 1 ? 's' : ''} measured ≥4mm. `;
    }
    narrative += `Bleeding on probing was ${bopPct}% (${totalBop} of ${totalSites} sites examined).`;
    narrative += `</p>`;

    /* Per-tooth findings for teeth with notable pathology */
    const notable = perioEntries.filter(([, d]) => {
      const p = d.perio;
      return p.depths.some(v => v >= 4) || p.bop.some(Boolean) || p.mobility > 0 || p.recession > 0 || p.furcation > 0;
    });
    if (notable.length > 0) {
      const SITE_NAMES = ['mesiobuccal','buccal','distobuccal','mesiolingual','lingual','distolingual'];
      let details = '';
      for (const [id, d] of notable) {
        const p = d.perio;
        const deepSites = p.depths.map((v, i) => ({ v, i })).filter(x => x.v >= 4);
        const bopSites = p.bop.map((v, i) => ({ v, i })).filter(x => x.v);
        let line = `${prefix}${id}: `;
        const parts = [];
        if (deepSites.length > 0) {
          parts.push(deepSites.map(s => `${s.v}mm ${SITE_NAMES[s.i]}`).join(', '));
        }
        if (bopSites.length > 0) {
          parts.push(`BOP at ${bopSites.map(s => SITE_NAMES[s.i]).join(', ')}`);
        }
        if (p.recession > 0) parts.push(`${p.recession}mm recession`);
        if (p.mobility > 0) parts.push(`Grade ${p.mobility} mobility`);
        if (p.furcation > 0) parts.push(`Class ${p.furcation} furcation involvement`);
        line += parts.join('; ') + '.';
        details += `<div style="font-size:12px;line-height:1.6;color:#334155;padding-left:12px;">${line}</div>`;
      }
      narrative += details;
    }

    /* Additional findings paragraph */
    const addl = [];
    if (teethWithMobility.length > 0) {
      addl.push(`Mobility was detected on ${teethWithMobility.map(([id, d]) => `${prefix}${id} (Grade ${d.perio.mobility})`).join(', ')}`);
    }
    if (teethWithRecession.length > 0) {
      addl.push(`Gingival recession was noted on ${teethWithRecession.map(([id, d]) => `${prefix}${id} (${d.perio.recession}mm)`).join(', ')}`);
    }
    if (teethWithFurcation.length > 0) {
      addl.push(`Furcation involvement was identified on ${teethWithFurcation.map(([id, d]) => `${prefix}${id} (Class ${d.perio.furcation})`).join(', ')}`);
    }
    if (addl.length > 0) {
      narrative += `<p style="font-size:13px;line-height:1.7;color:#334155;margin:8px 0 0 0;">${addl.join('. ')}.</p>`;
    }

    html += `<div style="margin-bottom:20px;"><h3 style="font-size:14px;font-weight:700;color:#0891B2;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px 0;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">Periodontal Charting</h3>${narrative}</div>`;
  }

  return html;
}

/* ── Parse AI-generated note for dental findings ── */

const _STATE_PATTERNS = [
  [/caries|decay|cavit(?:y|ies)|carious|deminerali[sz]/i, 'decay'],
  [/missing|extracted|absent|edentulous|avulsed|congenitally\s*(?:absent|missing)|previously\s*(?:removed|extracted)/i, 'missing'],
  [/restor(?:ed|ation)|filling|(?<!recommend\s)crown(?:ed)?|composite|amalgam|onlay|inlay|veneer|pfm|post[\s-]*(?:and[\s-]*)?core|bridge\s*abutment|existing\s*(?:restoration|amalgam|composite)/i, 'restored'],
  [/implant/i, 'implant'],
  [/root\s*canal|rct|endodontic(?:ally)?\s*(?:treat|fail|retreat|therap)|periapical\s*(?:pathology|abscess|radiolucency|lesion)|pulp\s*(?:necrosis|necro)|irreversible\s*pulpitis|apical\s*periodontitis/i, 'rct'],
  [/fracture[ds]?|crack(?:ed)?|chipped/i, 'fracture'],
  [/impacted|unerupted|(?:full|partial)\s*bony/i, 'impacted'],
];

const _SURFACE_NAME_MAP = {
  mesial:'M', mesio:'M', occlusal:'O', occluso:'O', distal:'D', disto:'D',
  buccal:'B', bucco:'B', lingual:'L', linguo:'L',
  incisal:'I', inciso:'I', facial:'F', labial:'F'
};

function _matchState(text) {
  for (const [re, id] of _STATE_PATTERNS) {
    if (re.test(text)) return id;
  }
  return null;
}

/* Clinical acronyms that collide with surface letter codes — must NOT be parsed as surfaces */
const _PROTECTED_ACRONYMS = /\b(?:FPD|RPD|ZOE|FGC|PFM|MTA|SDF|BOP|CAL|TMD|TMJ|GBI|OHI|DI|CI|CEJ|PDL|IPR)\b/gi;

function _extractSurfaces(text) {
  const out = [];
  /* Strip protected clinical acronyms before surface extraction */
  const clean = text.replace(_PROTECTED_ACRONYMS, '___');
  /* Short abbreviation like MOD, MO, MODBL — word-bounded, with negative lookahead for clinical acronyms */
  const abbr = clean.match(/(?:surfaces?[:\s]*)?\b(?!(?:FPD|RPD|ZOE|FGC|PFM|MTA|SDF|BOP|CAL|TMD|TMJ)\b)([MODBLIF]{2,5})\b/i);
  if (abbr) {
    for (const ch of abbr[1].toUpperCase()) {
      if ('MODBLIF'.includes(ch) && !out.includes(ch)) out.push(ch);
    }
    return out;
  }
  /* Compound hyphenated adjectives: mesio-occluso-distal, disto-occlusal, etc. */
  const compoundRe = /\b(mesio|disto|bucco|linguo|inciso|occlu[sz]o)[-\s]*(occluso|occlusal|distal|mesial|lingual|buccal|labial|facial|incisal)(?:[-\s]*(distal|mesial|lingual|buccal|labial|facial|occlusal|incisal))?\b/gi;
  let cm;
  while ((cm = compoundRe.exec(clean)) !== null) {
    for (let i = 1; i <= 3; i++) {
      if (!cm[i]) continue;
      const w = cm[i].toLowerCase().replace(/o$/, 'al'); /* mesio→mesial etc. */
      const code = _SURFACE_NAME_MAP[cm[i].toLowerCase()] || _SURFACE_NAME_MAP[w];
      if (code && !out.includes(code)) out.push(code);
    }
  }
  if (out.length) return out;
  /* Written-out surface names (standalone words) */
  for (const [name, code] of Object.entries(_SURFACE_NAME_MAP)) {
    if (new RegExp(`\\b${name}(?:ly)?\\b`, 'i').test(clean)) {
      if (!out.includes(code)) out.push(code);
    }
  }
  return out;
}

/* Validate surfaces against tooth anatomy (anterior vs posterior) */
const _ANTERIOR_TEETH = new Set(['6','7','8','9','10','11','22','23','24','25','26','27',
  'C','D','E','F','G','H','M','N','O','P','Q','R']);

function _validateSurfaces(toothId, surfaces) {
  if (!surfaces || !surfaces.length) return surfaces;
  const isAnterior = _ANTERIOR_TEETH.has(String(toothId));
  return surfaces.filter(s => {
    if (isAnterior) return s !== 'O' && s !== 'B'; /* anterior: no occlusal/buccal */
    return s !== 'I' && s !== 'F'; /* posterior: no incisal/facial */
  });
}

export function parseDentalFindingsFromNote(noteText) {
  if (!noteText) return {};
  const findings = {};

  /* Pattern 1: "Tooth/Number #N: Condition" — our serialized format + common AI + transcript */
  const lineRe = /(?:tooth|number)\s*#?(\d{1,2})\s*[:–—-]\s*([^\n]{3,})/gi;
  let m;
  while ((m = lineRe.exec(noteText)) !== null) {
    const id = m[1];
    const rest = m[2];
    const state = _matchState(rest);
    if (!state) continue;
    const surfaces = SURFACE_STATES.includes(state) ? _extractSurfaces(rest) : [];
    if (!findings[id]) {
      findings[id] = { state };
      if (surfaces.length) findings[id].surfaces = surfaces;
    }
  }

  /* Pattern 2: "#N caries/missing/etc" — inline references */
  const inlineRe = /#(\d{1,2})\s*(?:[:–—-]\s*)?([^\n,;]{3,40})/gi;
  while ((m = inlineRe.exec(noteText)) !== null) {
    const id = m[1];
    if (findings[id]) continue;
    const rest = m[2];
    const state = _matchState(rest);
    if (!state) continue;
    const surfaces = SURFACE_STATES.includes(state) ? _extractSurfaces(rest) : [];
    findings[id] = { state };
    if (surfaces.length) findings[id].surfaces = surfaces;
  }

  /* Pattern 3: "condition on/of tooth/teeth/number N, N, N" */
  const condFirstRe = /(?:caries|decay|missing|extracted|restored|restoration|filling|crown|implant|root\s*canal|rct|fracture[ds]?|crack(?:ed)?|impacted|edentulous)\s+(?:on|of|involving|at|for|in)?\s*(?:teeth?|numbers?|#)\s*#?([\d,\s#and]+)/gi;
  while ((m = condFirstRe.exec(noteText)) !== null) {
    const condText = m[0];
    const state = _matchState(condText);
    if (!state) continue;
    /* Extract surfaces from surrounding context (e.g. "mesio-distal caries on tooth #3") */
    const ctxStart = Math.max(0, m.index - 60);
    const ctx = noteText.slice(ctxStart, m.index + m[0].length);
    const surfaces = SURFACE_STATES.includes(state) ? _extractSurfaces(ctx) : [];
    const ids = m[1].match(/\d{1,2}/g) || [];
    for (const id of ids) {
      if (!findings[id]) {
        findings[id] = { state };
        if (surfaces.length) findings[id].surfaces = surfaces;
      }
    }
  }

  /* Pattern 4: "of/on number N" — context lookback for conditions mentioned earlier in sentence */
  const numRefRe = /(?:of|on)\s+number\s+(\d{1,2})\b/gi;
  while ((m = numRefRe.exec(noteText)) !== null) {
    const id = m[1];
    if (findings[id]) continue;
    /* Look at surrounding context (100 chars before + 60 after) for condition */
    const start = Math.max(0, m.index - 100);
    const end = Math.min(noteText.length, m.index + m[0].length + 60);
    const ctx = noteText.slice(start, end);
    const state = _matchState(ctx);
    if (!state) continue;
    const surfaces = SURFACE_STATES.includes(state) ? _extractSurfaces(ctx) : [];
    findings[id] = { state };
    if (surfaces.length) findings[id].surfaces = surfaces;
  }

  /* Pattern 5: "number N was previously extracted/edentulous" */
  const prevRe = /number\s+(\d{1,2})\s+(?:was\s+)?(?:previously\s+)?([^\n,.]{3,50})/gi;
  while ((m = prevRe.exec(noteText)) !== null) {
    const id = m[1];
    if (findings[id]) continue;
    const rest = m[2];
    const state = _matchState(rest);
    if (!state) continue;
    findings[id] = { state };
  }

  /* Validate: only accept adult tooth numbers 1-32, enforce anatomical surface constraints */
  const valid = {};
  for (const [id, data] of Object.entries(findings)) {
    const n = parseInt(id);
    if (n >= 1 && n <= 32) {
      const entry = { state: data.state };
      if (data.surfaces && data.surfaces.length) {
        const cleaned = _validateSurfaces(id, data.surfaces);
        if (cleaned.length) entry.surfaces = cleaned;
      }
      valid[String(n)] = entry;
    }
  }
  return valid;
}

export function applyParsedFindings(findings) {
  if (!findings || Object.keys(findings).length === 0) return 0;
  if (!App.dentalChart) App.dentalChart = { mode: 'adult', teeth: {} };
  if (!App.dentalChart.teeth) App.dentalChart.teeth = {};

  let added = 0;
  for (const [id, data] of Object.entries(findings)) {
    /* Only add findings for teeth the user hasn't already manually set */
    if (!App.dentalChart.teeth[id]) {
      App.dentalChart.teeth[id] = data;
      added++;
    }
  }

  if (added > 0) {
    updateDentalSummary();
    if (_el) _applyStates();
  }
  return added;
}

/* Update sidebar badge, preview, and modal footer with current findings */
export function updateDentalSummary() {
  if (typeof document === 'undefined') return;
  const teeth = App.dentalChart?.teeth || {};
  const count = Object.keys(teeth).length;

  // Sidebar badge
  const badgeEl = document.getElementById('dentalSummaryText');
  if (badgeEl) {
    badgeEl.textContent = count > 0 ? `${count} finding${count > 1 ? 's' : ''}` : '';
  }

  // Refresh the sidebar preview
  renderDentalPreview();

  // Modal footer
  const findingsEl = document.getElementById('dentalModalFindings');
  if (findingsEl) {
    if (count === 0) {
      findingsEl.textContent = 'No findings recorded';
      findingsEl.classList.remove('has-findings');
    } else {
      const entries = Object.entries(teeth);
      entries.sort((a, b) => {
        if (App.dentalChart.mode === 'primary') return a[0].localeCompare(b[0]);
        return parseInt(a[0]) - parseInt(b[0]);
      });
      const lines = entries.map(([id, d]) => {
        const lbl = TOOTH_STATES.find(s => s.id === d.state)?.label || d.state;
        let line = `#${id}: ${lbl}`;
        if (d.surfaces?.length) line += ` (${d.surfaces.join('')})`;
        return line;
      });
      findingsEl.textContent = lines.join(' · ');
      findingsEl.classList.add('has-findings');
    }
  }
}
