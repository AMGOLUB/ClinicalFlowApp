import { describe, it, expect } from 'vitest';
import {
  fmt, wc, rInt, estimateTokens, escPure,
  hlTerms, applyLiveCorrections, MED_TERMS, MED_RX,
  formatNoteMarkdown, extractCorrectedNote, postProcessNote,
  parseOllamaResponse, debounce, wait
} from '../src/pure.js';

/* ── Formatting ── */

describe('fmt (time formatting)', () => {
  it('formats 0 seconds', () => {
    expect(fmt(0)).toBe('00:00');
  });
  it('formats 90 seconds as 01:30', () => {
    expect(fmt(90)).toBe('01:30');
  });
  it('formats 3661 seconds as 61:01', () => {
    expect(fmt(3661)).toBe('61:01');
  });
  it('formats 59 seconds', () => {
    expect(fmt(59)).toBe('00:59');
  });
  it('formats 60 seconds as 01:00', () => {
    expect(fmt(60)).toBe('01:00');
  });
});

describe('wc (word count)', () => {
  it('returns 0 for empty string', () => {
    expect(wc('')).toBe(0);
  });
  it('returns 0 for null', () => {
    expect(wc(null)).toBe(0);
  });
  it('returns 0 for undefined', () => {
    expect(wc(undefined)).toBe(0);
  });
  it('returns 0 for whitespace only', () => {
    expect(wc('   ')).toBe(0);
  });
  it('counts simple words', () => {
    expect(wc('hello world')).toBe(2);
  });
  it('handles extra spaces', () => {
    expect(wc('  spaced  out  ')).toBe(2);
  });
  it('counts single word', () => {
    expect(wc('hello')).toBe(1);
  });
});

describe('rInt (random integer)', () => {
  it('returns exact value when min equals max', () => {
    expect(rInt(1, 1)).toBe(1);
  });
  it('returns value in range', () => {
    for (let i = 0; i < 50; i++) {
      const v = rInt(0, 100);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe('estimateTokens', () => {
  it('estimates tokens as ceil(length/4)', () => {
    expect(estimateTokens('hello world!!')).toBe(Math.ceil(13 / 4));
  });
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });
  it('handles single character', () => {
    expect(estimateTokens('a')).toBe(1);
  });
});

describe('escPure (HTML escaping)', () => {
  it('escapes angle brackets', () => {
    expect(escPure('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });
  it('escapes ampersand', () => {
    expect(escPure('foo & bar')).toBe('foo &amp; bar');
  });
  it('escapes quotes', () => {
    expect(escPure("it's \"fine\"")).toBe("it&#39;s &quot;fine&quot;");
  });
  it('passes through normal text', () => {
    expect(escPure('hello world')).toBe('hello world');
  });
});

/* ── Medical Term Highlighting ── */

describe('hlTerms', () => {
  it('highlights medical conditions', () => {
    const result = hlTerms('Patient has hypertension');
    expect(result).toContain('<span class="medical-term">hypertension</span>');
  });
  it('highlights medications', () => {
    const result = hlTerms('Taking metformin daily');
    expect(result).toContain('<span class="medication-term">metformin</span>');
  });
  it('highlights procedures', () => {
    const result = hlTerms('Scheduled for colonoscopy');
    expect(result).toContain('<span class="procedure-term">colonoscopy</span>');
  });
  it('highlights anatomy terms', () => {
    const result = hlTerms('Pain in the femur');
    expect(result).toContain('<span class="anatomy-term">femur</span>');
  });
  it('leaves normal text unchanged', () => {
    const result = hlTerms('No medical terms here');
    expect(result).toBe('No medical terms here');
  });
  it('is case insensitive', () => {
    const result = hlTerms('HYPERTENSION noted');
    expect(result).toContain('<span class="medical-term">');
  });
  it('highlights multiple terms', () => {
    const result = hlTerms('diabetes and asthma');
    expect(result).toContain('<span class="medical-term">diabetes</span>');
    expect(result).toContain('<span class="medical-term">asthma</span>');
  });
  it('highlights multi-word terms as single unit', () => {
    const result = hlTerms('Diagnosed with coronary artery disease');
    expect(result).toContain('<span class="medical-term">coronary artery disease</span>');
  });
});

describe('MED_TERMS and MED_RX arrays', () => {
  it('MED_TERMS contains key conditions', () => {
    expect(MED_TERMS).toContain('hypertension');
    expect(MED_TERMS).toContain('diabetes');
    expect(MED_TERMS).toContain('pneumonia');
  });
  it('MED_TERMS has comprehensive coverage (300+ conditions)', () => {
    expect(MED_TERMS.length).toBeGreaterThanOrEqual(300);
  });
  it('MED_RX contains key medications', () => {
    expect(MED_RX).toContain('metformin');
    expect(MED_RX).toContain('lisinopril');
    expect(MED_RX).toContain('aspirin');
  });
  it('MED_RX has comprehensive coverage (190+ medications)', () => {
    expect(MED_RX.length).toBeGreaterThanOrEqual(190);
  });
});

/* ── Transcript Corrections ── */

describe('applyLiveCorrections', () => {
  const corrections = [
    [/\bblood presure\b/gi, 'blood pressure'],
    [/\bglycide\b/gi, 'glipizide'],
    [/\bmetforeman\b/gi, 'metformin'],
    [/\bcrepidus\b/gi, 'crepitus'],
  ];

  it('corrects misspelled medical terms', () => {
    expect(applyLiveCorrections('blood presure is high', corrections)).toBe('blood pressure is high');
  });
  it('corrects drug name misspellings', () => {
    expect(applyLiveCorrections('prescribing glycide', corrections)).toBe('prescribing glipizide');
  });
  it('is case insensitive', () => {
    expect(applyLiveCorrections('Blood Presure elevated', corrections)).toBe('blood pressure elevated');
  });
  it('leaves correct text unchanged', () => {
    expect(applyLiveCorrections('blood pressure is normal', corrections)).toBe('blood pressure is normal');
  });
  it('handles empty corrections list', () => {
    expect(applyLiveCorrections('some text', [])).toBe('some text');
  });
});

/* ── Note Formatting ── */

describe('formatNoteMarkdown', () => {
  it('converts bold markers to strong tags', () => {
    const result = formatNoteMarkdown('**bold** text', escPure);
    expect(result).toContain('<strong>bold</strong>');
  });
  it('converts newlines to br tags', () => {
    const result = formatNoteMarkdown('line1\nline2', escPure);
    expect(result).toContain('<br>');
  });
  it('escapes HTML in input', () => {
    const result = formatNoteMarkdown('<script>alert(1)</script>', escPure);
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });
  it('uses escPure by default when no escape fn provided', () => {
    const result = formatNoteMarkdown('**hello** <b>world</b>');
    expect(result).toContain('<strong>hello</strong>');
    expect(result).toContain('&lt;b&gt;');
  });
});

describe('extractCorrectedNote', () => {
  it('extracts text after CORRECTED NOTE marker', () => {
    expect(extractCorrectedNote('CORRECTED NOTE:\nFixed text here')).toBe('Fixed text here');
  });
  it('handles case-insensitive marker', () => {
    expect(extractCorrectedNote('corrected note:\nLower case')).toBe('Lower case');
  });
  it('returns full text if CLEAN', () => {
    expect(extractCorrectedNote('CLEAN')).toBe('CLEAN');
  });
  it('returns full text when no marker present', () => {
    expect(extractCorrectedNote('No issues found')).toBe('No issues found');
  });
  it('trims whitespace from extracted text', () => {
    expect(extractCorrectedNote('CORRECTED NOTE:   trimmed   ')).toBe('trimmed');
  });
});

/* ── Post-Processing ── */

describe('postProcessNote', () => {
  const corrections = [
    [/\bcrepidus\b/gi, 'crepitus'],
  ];

  it('applies corrections dictionary', () => {
    const result = postProcessNote('Found crepidus in knee', '', corrections);
    expect(result).toContain('crepitus');
    expect(result).not.toContain('crepidus');
  });

  it('strips prompt leak patterns', () => {
    const text = 'Real note content\nOutput ONLY these four sections\nMore content';
    const result = postProcessNote(text, '', []);
    expect(result).not.toContain('Output ONLY');
    expect(result).toContain('Real note content');
    expect(result).toContain('More content');
  });

  it('strips placeholder patterns', () => {
    const text = 'Note content\n[use date below]\n[if any]';
    const result = postProcessNote(text, '', []);
    expect(result).not.toContain('[use date below]');
    expect(result).not.toContain('[if any]');
  });

  it('corrects truncated blood pressure in diabetes context', () => {
    const result = postProcessNote('BP: 42/88', 'diabetes and blood sugar', []);
    expect(result).toContain('142/88');
  });

  it('does not modify valid blood pressure', () => {
    const result = postProcessNote('BP: 142/88', '', []);
    expect(result).toContain('142/88');
  });

  it('corrects truncated heart rate', () => {
    const result = postProcessNote('HR: 7 bpm', '', []);
    expect(result).toContain('70');
  });

  it('strips "None stated" filler lines', () => {
    const text = 'Content\nNone stated\nMore content';
    const result = postProcessNote(text, '', []);
    expect(result).not.toContain('None stated');
  });

  it('collapses triple newlines', () => {
    const text = 'A\n\n\n\nB';
    const result = postProcessNote(text, '', []);
    expect(result).toBe('A\n\nB');
  });

  it('replaces Lipitor with glipizide in diabetes context', () => {
    const result = postProcessNote('Lipitor daily with breakfast for blood sugar', 'diabetes', []);
    expect(result).toContain('glipizide');
    expect(result).not.toContain('Lipitor');
  });
});

/* ── Note Parsing ── */

describe('parseOllamaResponse', () => {
  it('parses **HEADER** delimited SOAP note', () => {
    const text = '**SUBJECTIVE**\nCC: headache\n**OBJECTIVE**\nVitals normal\n**ASSESSMENT**\nMigraine\n**PLAN**\nRest';
    const result = parseOllamaResponse(text, 'soap');
    expect(result.title).toBe('SOAP Note');
    expect(result.sections).toHaveLength(4);
    expect(result.sections[0].title).toBe('SUBJECTIVE');
    expect(result.sections[0].content).toContain('headache');
    expect(result.sections[1].title).toBe('OBJECTIVE');
    expect(result.sections[2].title).toBe('ASSESSMENT');
    expect(result.sections[3].title).toBe('PLAN');
  });

  it('parses JSON format response', () => {
    const text = JSON.stringify({ subjective: 'CC: pain', objective: 'Normal exam' });
    const result = parseOllamaResponse(text, 'soap');
    expect(result.title).toBe('SOAP Note');
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].title).toBe('Subjective');
    expect(result.sections[0].content).toBe('CC: pain');
  });

  it('falls back to single section for plain text', () => {
    const result = parseOllamaResponse('Just some plain text notes', 'soap');
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].title).toBe('Clinical Note');
    expect(result.sections[0].content).toBe('Just some plain text notes');
  });

  it('uses correct title for HPI format', () => {
    const text = '**CHIEF COMPLAINT**\nPain\n**HISTORY OF PRESENT ILLNESS**\nDetails';
    const result = parseOllamaResponse(text, 'hpi');
    expect(result.title).toBe('HPI-Focused Note');
  });

  it('uses correct title for problem format', () => {
    const result = parseOllamaResponse('Plain text', 'problem');
    expect(result.title).toBe('Problem-Oriented Note');
  });

  it('cleans markdown from section titles', () => {
    const text = '**SUBJECTIVE**\nContent\n**OBJECTIVE**\nMore';
    const result = parseOllamaResponse(text, 'soap');
    result.sections.forEach(s => {
      expect(s.title).not.toContain('**');
    });
  });

  it('parses markdown heading format', () => {
    const text = '## SUBJECTIVE\nCC: cough\n## OBJECTIVE\nExam normal';
    const result = parseOllamaResponse(text, 'soap');
    expect(result.sections.length).toBeGreaterThanOrEqual(2);
    expect(result.sections[0].title).toBe('SUBJECTIVE');
  });

  it('handles colon-delimited headers', () => {
    const text = 'Subjective:\nPatient reports pain\nObjective:\nNormal vitals';
    const result = parseOllamaResponse(text, 'soap');
    expect(result.sections.length).toBeGreaterThanOrEqual(2);
  });

  it('assigns section keys', () => {
    const text = '**SUBJECTIVE**\nCC\n**OBJECTIVE**\nExam';
    const result = parseOllamaResponse(text, 'soap');
    expect(result.sections[0].key).toBe('ai-section-0');
    expect(result.sections[1].key).toBe('ai-section-1');
  });

  it('uses custom noteTitle when provided', () => {
    const text = '**DATA**\nInfo\n**ASSESSMENT**\nEval';
    const result = parseOllamaResponse(text, 'dap', 'DAP Note (Psychiatry)');
    expect(result.title).toBe('DAP Note (Psychiatry)');
  });

  it('falls back to Clinical Note for unknown format without noteTitle', () => {
    const result = parseOllamaResponse('Plain text', 'custom_foo');
    expect(result.title).toBe('Clinical Note');
  });
});

/* ── Async Utilities ── */

describe('wait', () => {
  it('resolves after specified ms', async () => {
    const start = Date.now();
    await wait(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(40);
  });
});

describe('debounce', () => {
  it('delays function execution', async () => {
    let count = 0;
    const fn = debounce(() => count++, 50);
    fn(); fn(); fn();
    expect(count).toBe(0);
    await wait(80);
    expect(count).toBe(1);
  });
});
