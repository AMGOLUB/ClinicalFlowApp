import { describe, it, expect, beforeEach, vi } from 'vitest';

/* Mock state.js to avoid window references in Node */
const _mockApp = {
  dentalChart: { mode: 'adult', teeth: {} }
};

vi.mock('../src/state.js', () => ({
  App: _mockApp,
  cfg: { get: () => null, set: () => {} },
  __TAURI_READY__: false,
  tauriInvoke: null,
  tauriListen: null,
  CORRECTIONS_DICT: [],
  DEFAULT_CORRECTIONS: [],
  loadCorrectionsDictionary: () => {},
  _initTauri: () => {},
  getAbortCtrl: () => null,
  setAbortCtrl: () => {},
  GENERATION_TIMEOUT_MS: 60000,
  Config: {},
  ConfigFallback: {}
}));

const { isDentalTemplate, formatDentalChartForPrompt, TOOTH_STATES, parseDentalFindingsFromNote, applyParsedFindings } = await import('../src/dental-chart.js');

/* ── isDentalTemplate ── */

describe('isDentalTemplate', () => {
  it('returns true for dental_ prefixed IDs', () => {
    expect(isDentalTemplate('dental_general')).toBe(true);
    expect(isDentalTemplate('dental_periodontal')).toBe(true);
    expect(isDentalTemplate('dental_endodontic')).toBe(true);
    expect(isDentalTemplate('dental_oral_surgery')).toBe(true);
    expect(isDentalTemplate('dental_prosthodontic')).toBe(true);
  });

  it('returns false for non-dental IDs', () => {
    expect(isDentalTemplate('soap')).toBe(false);
    expect(isDentalTemplate('hpi')).toBe(false);
    expect(isDentalTemplate('problem')).toBe(false);
    expect(isDentalTemplate('cardiology')).toBe(false);
  });

  it('returns false for falsy values', () => {
    expect(isDentalTemplate(null)).toBe(false);
    expect(isDentalTemplate(undefined)).toBe(false);
    expect(isDentalTemplate('')).toBe(false);
  });
});

/* ── TOOTH_STATES ── */

describe('TOOTH_STATES', () => {
  it('has 8 states', () => {
    expect(TOOTH_STATES).toHaveLength(8);
  });

  it('includes all required states', () => {
    const ids = TOOTH_STATES.map(s => s.id);
    expect(ids).toContain('healthy');
    expect(ids).toContain('decay');
    expect(ids).toContain('missing');
    expect(ids).toContain('restored');
    expect(ids).toContain('implant');
    expect(ids).toContain('rct');
    expect(ids).toContain('fracture');
    expect(ids).toContain('impacted');
  });

  it('each state has id, label, and hex color', () => {
    for (const state of TOOTH_STATES) {
      expect(state.id).toBeTruthy();
      expect(state.label).toBeTruthy();
      expect(state.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

/* ── formatDentalChartForPrompt ── */

describe('formatDentalChartForPrompt', () => {
  beforeEach(() => {
    _mockApp.dentalChart = { mode: 'adult', teeth: {} };
  });

  it('returns empty string when no teeth have findings', () => {
    expect(formatDentalChartForPrompt()).toBe('');
  });

  it('formats a single tooth state without surfaces', () => {
    _mockApp.dentalChart.teeth['14'] = { state: 'missing' };
    const result = formatDentalChartForPrompt();
    expect(result).toContain('DENTAL CHART FINDINGS');
    expect(result).toContain('Tooth #14: Missing');
    expect(result).toContain('Adult (Permanent)');
  });

  it('formats a tooth with surfaces', () => {
    _mockApp.dentalChart.teeth['3'] = { state: 'decay', surfaces: ['M', 'O', 'D'] };
    const result = formatDentalChartForPrompt();
    expect(result).toContain('Tooth #3: Decay');
    expect(result).toContain('Surfaces: MOD');
  });

  it('formats multiple teeth sorted numerically', () => {
    _mockApp.dentalChart.teeth['19'] = { state: 'restored', surfaces: ['O'] };
    _mockApp.dentalChart.teeth['3'] = { state: 'decay', surfaces: ['M', 'O', 'D'] };
    const result = formatDentalChartForPrompt();
    const lines = result.split('\n');
    const toothLines = lines.filter(l => l.startsWith('Tooth'));
    expect(toothLines[0]).toContain('#3');
    expect(toothLines[1]).toContain('#19');
  });

  it('formats primary dentition with letter IDs', () => {
    _mockApp.dentalChart.mode = 'primary';
    _mockApp.dentalChart.teeth['A'] = { state: 'decay', surfaces: ['O'] };
    const result = formatDentalChartForPrompt();
    expect(result).toContain('Primary (Deciduous)');
    expect(result).toContain('Tooth A: Decay');
  });
});

/* ── parseDentalFindingsFromNote ── */

describe('parseDentalFindingsFromNote', () => {
  it('returns empty object for empty/null input', () => {
    expect(parseDentalFindingsFromNote('')).toEqual({});
    expect(parseDentalFindingsFromNote(null)).toEqual({});
    expect(parseDentalFindingsFromNote(undefined)).toEqual({});
  });

  it('parses "Tooth #N: Condition" format', () => {
    const text = 'Tooth #3: Decay/Caries — Surfaces: MOD\nTooth #14: Missing';
    const findings = parseDentalFindingsFromNote(text);
    expect(findings['3']).toEqual({ state: 'decay', surfaces: ['M', 'O', 'D'] });
    expect(findings['14']).toEqual({ state: 'missing' });
  });

  it('parses inline "#N condition" format', () => {
    const text = 'Assessment:\n#19 restored with composite\n#30 root canal treated';
    const findings = parseDentalFindingsFromNote(text);
    expect(findings['19'].state).toBe('restored');
    expect(findings['30'].state).toBe('rct');
  });

  it('parses condition-first format: "caries on teeth 3, 14"', () => {
    const text = 'Caries on teeth 3, 14 and 19';
    const findings = parseDentalFindingsFromNote(text);
    expect(findings['3'].state).toBe('decay');
    expect(findings['14'].state).toBe('decay');
    expect(findings['19'].state).toBe('decay');
  });

  it('extracts written-out surface names', () => {
    const text = 'Tooth #3: Decay involving mesial and occlusal surfaces';
    const findings = parseDentalFindingsFromNote(text);
    expect(findings['3'].surfaces).toContain('M');
    expect(findings['3'].surfaces).toContain('O');
  });

  it('rejects invalid tooth numbers (>32 or <1)', () => {
    const text = 'Tooth #0: Decay\nTooth #33: Missing\nTooth #15: Fracture';
    const findings = parseDentalFindingsFromNote(text);
    expect(findings['0']).toBeUndefined();
    expect(findings['33']).toBeUndefined();
    expect(findings['15'].state).toBe('fracture');
  });

  it('handles a full AI-generated note with multiple sections', () => {
    const note = `DENTAL CHART FINDINGS:
Dentition: Adult (Permanent)
Tooth #3: Decay/Caries — Surfaces: MOD
Tooth #14: Missing
Tooth #19: Restored — Surfaces: O
Tooth #30: Root Canal

ASSESSMENT
1. Tooth #3: Class II caries involving mesial, occlusal, and distal surfaces
2. Tooth #14: Missing — evaluate for implant
3. Tooth #19: Existing amalgam restoration intact
4. Tooth #30: Previously endodontically treated`;
    const findings = parseDentalFindingsFromNote(note);
    expect(Object.keys(findings).length).toBe(4);
    expect(findings['3'].state).toBe('decay');
    expect(findings['14'].state).toBe('missing');
    expect(findings['19'].state).toBe('restored');
    expect(findings['30'].state).toBe('rct');
  });

  it('parses "Number N" format from transcripts', () => {
    const text = 'Number 3 — mesio-occluso-distal caries, recommend composite restoration. Number 14 — edentulous space.';
    const findings = parseDentalFindingsFromNote(text);
    expect(findings['3'].state).toBe('decay');
    expect(findings['14'].state).toBe('missing');
  });

  it('parses "Number N was previously extracted" format', () => {
    const text = 'Number 14 was previously extracted — edentulous space with mild alveolar ridge resorption.';
    const findings = parseDentalFindingsFromNote(text);
    expect(findings['14'].state).toBe('missing');
  });

  it('parses the full dental demo transcript', () => {
    const transcript = [
      'Number 3 — mesio-occluso-distal caries, recommend composite restoration.',
      'Number 30 — disto-occlusal caries approaching pulp, recommend indirect pulp cap.',
      'Number 19 — suspect endodontic failure with periapical pathology, refer to endodontist.',
      'Number 1 — full bony impacted upper right third molar.',
      'Number 14 — edentulous space, discuss replacement options.',
      'Number 14 was previously extracted — edentulous space with mild alveolar ridge resorption.',
    ].join('\n');
    const findings = parseDentalFindingsFromNote(transcript);
    expect(findings['3'].state).toBe('decay');
    expect(findings['30'].state).toBe('decay');
    expect(findings['19'].state).toBe('rct');
    expect(findings['1'].state).toBe('impacted');
    expect(findings['14'].state).toBe('missing');
    expect(Object.keys(findings).length).toBe(5);
  });
});

/* ── Acronym protection ── */

describe('acronym and anatomical hardening', () => {
  it('does not extract surfaces from clinical acronyms like FPD, RPD, SDF', () => {
    const text = 'Tooth #3: Decay — FPD planned for replacement. SDF applied.';
    const findings = parseDentalFindingsFromNote(text);
    expect(findings['3'].state).toBe('decay');
    /* Should not have extracted F, D from FPD or S, D, F from SDF */
    expect(findings['3'].surfaces || []).not.toContain('F');
  });

  it('still extracts real surfaces alongside acronyms', () => {
    const text = 'Tooth #3: Decay — mesial and occlusal surfaces. FPD planned.';
    const findings = parseDentalFindingsFromNote(text);
    expect(findings['3'].surfaces).toContain('M');
    expect(findings['3'].surfaces).toContain('O');
  });

  it('strips occlusal/buccal from anterior teeth (anatomical validation)', () => {
    const text = 'Tooth #8: Decay — occlusal and mesial surfaces';
    const findings = parseDentalFindingsFromNote(text);
    expect(findings['8'].state).toBe('decay');
    expect(findings['8'].surfaces).toContain('M');
    /* Tooth 8 is anterior — should NOT have O */
    expect(findings['8'].surfaces).not.toContain('O');
  });

  it('strips incisal/facial from posterior teeth (anatomical validation)', () => {
    const text = 'Tooth #3: Decay — incisal and distal surfaces';
    const findings = parseDentalFindingsFromNote(text);
    expect(findings['3'].state).toBe('decay');
    expect(findings['3'].surfaces).toContain('D');
    /* Tooth 3 is posterior — should NOT have I */
    expect(findings['3'].surfaces).not.toContain('I');
  });

  it('allows correct surfaces for anterior teeth (M, D, L, I, F)', () => {
    const text = 'Tooth #9: Decay — mesial and incisal surfaces';
    const findings = parseDentalFindingsFromNote(text);
    expect(findings['9'].surfaces).toContain('M');
    expect(findings['9'].surfaces).toContain('I');
  });

  it('allows correct surfaces for posterior teeth (M, O, D, B, L)', () => {
    const text = 'Tooth #30: Decay — mesio-occluso-distal surfaces';
    const findings = parseDentalFindingsFromNote(text);
    expect(findings['30'].surfaces).toContain('M');
    expect(findings['30'].surfaces).toContain('O');
    expect(findings['30'].surfaces).toContain('D');
  });
});

/* ── applyParsedFindings ── */

describe('applyParsedFindings', () => {
  beforeEach(() => {
    _mockApp.dentalChart = { mode: 'adult', teeth: {} };
  });

  it('returns 0 for empty findings', () => {
    expect(applyParsedFindings({})).toBe(0);
    expect(applyParsedFindings(null)).toBe(0);
  });

  it('applies findings to empty chart', () => {
    const findings = { '3': { state: 'decay', surfaces: ['M', 'O'] }, '14': { state: 'missing' } };
    const added = applyParsedFindings(findings);
    expect(added).toBe(2);
    expect(_mockApp.dentalChart.teeth['3'].state).toBe('decay');
    expect(_mockApp.dentalChart.teeth['14'].state).toBe('missing');
  });

  it('does not overwrite existing tooth entries', () => {
    _mockApp.dentalChart.teeth['3'] = { state: 'restored', surfaces: ['O'] };
    const findings = { '3': { state: 'decay', surfaces: ['M', 'O', 'D'] }, '14': { state: 'missing' } };
    const added = applyParsedFindings(findings);
    expect(added).toBe(1); /* only #14 added */
    expect(_mockApp.dentalChart.teeth['3'].state).toBe('restored'); /* unchanged */
    expect(_mockApp.dentalChart.teeth['14'].state).toBe('missing');
  });
});

/* ── Dental term highlighting ── */

describe('dental term highlighting', () => {
  /* hlTerms is from medical-dictionary.js which also imports state.js (mocked above) */
  let hlTerms;
  beforeEach(async () => {
    const mod = await import('../src/medical-dictionary.js');
    hlTerms = mod.hlTerms;
  });

  it('highlights dental conditions', () => {
    const result = hlTerms('Patient has periodontitis');
    expect(result).toContain('<span class="dental-term">periodontitis</span>');
  });

  it('highlights dental anatomy terms', () => {
    const result = hlTerms('Decay on the mesial surface');
    expect(result).toContain('<span class="dental-term">mesial</span>');
  });

  it('highlights dental procedures', () => {
    const result = hlTerms('Scheduled for root canal therapy');
    expect(result).toContain('<span class="dental-term">root canal therapy</span>');
  });

  it('is case insensitive', () => {
    const result = hlTerms('GINGIVITIS noted');
    expect(result).toContain('dental-term');
  });
});
