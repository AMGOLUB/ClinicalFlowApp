/* ============================================================
   CLINICALFLOW — PMS Bridge (Frontend)
   Collects clinical data, translates to PMS payload format,
   and invokes Tauri backend commands for database sync.
   ============================================================ */
import { App, cfg } from './state.js';
import { toast, esc, D } from './ui.js';
import { PERIO_SITES } from './dental-chart.js';

/* ── Configuration ── */

const PMS_SYSTEMS = [
  { id: 'opendental', label: 'Open Dental', supported: true },
  { id: 'dentrix',    label: 'Dentrix',     supported: false },
  { id: 'eaglesoft',  label: 'Eaglesoft',    supported: false },
];

export function getPmsSystems() { return PMS_SYSTEMS; }

export function loadPmsConfig() {
  const raw = cfg.get('pms-config', null);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function savePmsConfig(config) {
  cfg.set('pms-config', JSON.stringify(config));
}

/* ── Payload Builder (The Collector) ── */

export function buildClinicalPayload() {
  const teeth = App.dentalChart?.teeth || {};
  const perio_measurements = [];
  const perio_extras = [];

  for (const [id, d] of Object.entries(teeth)) {
    if (!d.perio) continue;
    const p = d.perio;
    const toothNum = parseInt(id);
    if (isNaN(toothNum)) continue;

    /* 6-point probing depths + BOP */
    for (let i = 0; i < 6; i++) {
      if (p.depths[i] > 0) {
        perio_measurements.push({
          tooth_num: toothNum,
          site_index: i,
          depth: p.depths[i],
          bop: p.bop[i] || false,
        });
      }
    }

    /* Extras: mobility, furcation, recession */
    if (p.mobility > 0 || p.furcation > 0 || p.recession > 0) {
      perio_extras.push({
        tooth_num: toothNum,
        mobility: p.mobility || 0,
        furcation: p.furcation || 0,
        recession: p.recession || 0,
      });
    }
  }

  /* Procedures from coding results */
  const procedures = [];
  if (App.codingResults?.cdt) {
    for (const c of App.codingResults.cdt) {
      procedures.push({
        tooth_num: c.tooth || '0',
        cdt_code: c.code,
        description: c.description,
        surfaces: null, /* TODO: extract from dental chart */
      });
    }
  }

  /* ICD-10 codes */
  const icd10_codes = (App.codingResults?.icd10 || []).map(c => c.code);

  /* Clinical note text */
  const note_text = App.noteSections?.sections
    ?.map(s => {
      const el = document.getElementById(`section-${s.key}`);
      return s.title + ':\n' + (el ? el.innerText : s.content);
    })
    .join('\n\n') || '';

  return {
    patient_id: App.pmsPatientId || null,
    provider_id: App.pmsProviderId || null,
    note_text,
    procedures,
    perio_measurements,
    perio_extras,
    icd10_codes,
  };
}

/* ── Sync Workflow ── */

async function _invoke(cmd, args) {
  if (!window.__TAURI__?.core?.invoke) {
    throw new Error('Tauri API not available');
  }
  return window.__TAURI__.core.invoke(cmd, args);
}

export async function testPmsConnection() {
  const config = loadPmsConfig();
  if (!config) {
    toast('Configure PMS connection in Settings first.', 'warning');
    return false;
  }

  try {
    const result = await _invoke('pms_test_connection', { config });
    if (result.success) {
      toast(`Connected to ${config.system}`, 'success');
      _updateSyncStatus('connected', result.message);
      return true;
    } else {
      toast(`Connection failed: ${result.message}`, 'error');
      _updateSyncStatus('error', result.message);
      return false;
    }
  } catch (e) {
    toast(`PMS connection error: ${e}`, 'error');
    _updateSyncStatus('error', String(e));
    return false;
  }
}

export async function syncToPms(syncType = 'all') {
  const config = loadPmsConfig();
  if (!config) {
    toast('Configure PMS connection in Settings first.', 'warning');
    return;
  }

  const payload = buildClinicalPayload();
  _updateSyncStatus('syncing', 'Syncing...');

  const cmdMap = {
    all: 'pms_sync_all',
    perio: 'pms_sync_perio',
    procedures: 'pms_sync_procedures',
    note: 'pms_sync_note',
  };
  const cmd = cmdMap[syncType] || 'pms_sync_all';

  try {
    const result = await _invoke(cmd, { config, payload });
    if (result.success) {
      toast(`Synced to ${config.system}: ${result.message}`, 'success');
      _updateSyncStatus('success', result.message);
      _showSyncConfirmation(result);
    } else {
      toast(`Sync failed: ${result.message}`, 'error');
      _updateSyncStatus('error', result.message);
    }
  } catch (e) {
    toast(`PMS sync error: ${e}`, 'error');
    _updateSyncStatus('error', String(e));
  }
}

/* ── UI Helpers ── */

function _updateSyncStatus(status, message) {
  const badge = document.getElementById('pmsSyncStatus');
  if (!badge) return;
  badge.className = 'pms-sync-badge';
  badge.classList.add(`pms-sync-${status}`);
  const text = badge.querySelector('.pms-sync-text');
  if (text) text.textContent = message;
}

function _showSyncConfirmation(result) {
  const panel = document.getElementById('pmsSyncConfirm');
  if (!panel) return;
  panel.style.display = 'block';
  panel.innerHTML = `
    <div class="pms-confirm-header">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#34D399" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      <span class="pms-confirm-title">Sync Complete</span>
    </div>
    <div class="pms-confirm-body">
      <div class="pms-confirm-stat">${result.rows_written} row${result.rows_written !== 1 ? 's' : ''} written</div>
      ${result.details.map(d => `<div class="pms-confirm-detail">${esc(d)}</div>`).join('')}
    </div>
  `;
  setTimeout(() => { panel.style.display = 'none'; }, 8000);
}

/* ── Settings Panel Renderer ── */

export function renderPmsSettings() {
  const container = document.getElementById('pmsSettingsPanel');
  if (!container) return;

  const config = loadPmsConfig() || { system: 'opendental', host: 'localhost', port: 3306, database: 'opendental', username: '', password: '' };

  container.innerHTML = `
    <div class="settings-row settings-row-stacked">
      <div class="settings-row-info">
        <div class="settings-row-label">System</div>
        <div class="settings-row-desc">Practice management software to sync with</div>
      </div>
      <div class="api-key-input-group">
        <select id="pmsSystemSelect" class="ollama-model-select">
          ${PMS_SYSTEMS.map(s => `<option value="${s.id}" ${s.id === config.system ? 'selected' : ''} ${!s.supported ? 'disabled' : ''}>${s.label}${!s.supported ? ' (Coming Soon)' : ''}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="settings-row settings-row-stacked">
      <div class="settings-row-info">
        <div class="settings-row-label">Connection</div>
        <div class="settings-row-desc">MySQL database host and port for Open Dental</div>
      </div>
      <div class="api-key-input-group">
        <input type="text" class="input" id="pmsHost" value="${esc(config.host)}" placeholder="localhost or 192.168.1.x" autocomplete="off" aria-label="Database host" style="flex:2;">
        <input type="number" class="input" id="pmsPort" value="${config.port}" placeholder="3306" autocomplete="off" aria-label="Database port" style="flex:0.7;min-width:70px;">
      </div>
    </div>

    <div class="settings-row settings-row-stacked">
      <div class="settings-row-info">
        <div class="settings-row-label">Database</div>
        <div class="settings-row-desc">Open Dental database name</div>
      </div>
      <div class="api-key-input-group">
        <input type="text" class="input" id="pmsDatabase" value="${esc(config.database)}" placeholder="opendental" autocomplete="off" aria-label="Database name">
      </div>
    </div>

    <div class="settings-row settings-row-stacked">
      <div class="settings-row-info">
        <div class="settings-row-label">Credentials</div>
        <div class="settings-row-desc">MySQL username and password</div>
      </div>
      <div class="api-key-input-group">
        <input type="text" class="input" id="pmsUsername" value="${esc(config.username)}" placeholder="Username" autocomplete="off" aria-label="Database username">
        <input type="password" class="input" id="pmsPassword" value="${config.password}" placeholder="Password" autocomplete="off" aria-label="Database password">
      </div>
    </div>

    <div class="settings-row settings-row-stacked">
      <div class="api-key-input-group">
        <button class="btn btn-primary btn-sm" id="pmsSaveBtn" style="flex:none;">Save</button>
        <button class="btn btn-secondary btn-sm" id="pmsTestBtn" style="flex:none;">Test Connection</button>
      </div>
      <div class="api-key-status disconnected" id="pmsConnectionStatus">
        <span class="status-dot"></span>
        <span id="pmsStatusText">Not configured</span>
      </div>
    </div>
  `;

  document.getElementById('pmsSaveBtn')?.addEventListener('click', () => {
    const newConfig = {
      system: document.getElementById('pmsSystemSelect').value,
      host: document.getElementById('pmsHost').value.trim(),
      port: parseInt(document.getElementById('pmsPort').value) || 3306,
      database: document.getElementById('pmsDatabase').value.trim(),
      username: document.getElementById('pmsUsername').value.trim(),
      password: document.getElementById('pmsPassword').value,
    };
    savePmsConfig(newConfig);
    toast('PMS settings saved', 'success');
  });

  document.getElementById('pmsTestBtn')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('pmsConnectionStatus');
    const textEl = document.getElementById('pmsStatusText');
    statusEl.className = 'api-key-status checking';
    textEl.textContent = 'Testing...';

    /* Save before testing */
    document.getElementById('pmsSaveBtn').click();

    const success = await testPmsConnection();
    if (success) {
      statusEl.className = 'api-key-status connected';
      textEl.textContent = 'Connected';
    } else {
      statusEl.className = 'api-key-status error';
      textEl.textContent = 'Connection failed';
    }
  });
}
