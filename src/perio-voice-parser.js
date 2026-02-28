/* ============================================================
   CLINICALFLOW — Voice Perio Charting Parser
   State machine that processes transcribed speech into
   periodontal charting data (depths, BOP, mobility, furcation,
   recession). Follows industry-standard quadrant walk:
   full buccal sweep then lingual sweep.

   Architecture:
     Phase 1 — Lexical Normalization (the Sieve)
       Raw ASR text is cleaned, phonetic collisions are split,
       word-numbers are converted, and tokens are standardized
       BEFORE any pattern extraction occurs.
     Phase 2 — Pattern Extraction (the Extractor)
       Regex patterns run against the normalized string.
       The state machine manages queue pointers and data offsets.
   ============================================================ */
import { App } from './state.js';
import { setPerioDepths, setPerioSiteDepth, setPerioMobility,
         setPerioFurcation, setPerioRecession, isMultiRooted,
         updateDentalSummary } from './dental-chart.js';

/* ── Quadrant Maps ── */

const QUADRANTS = {
  'upper right': ['1','2','3','4','5','6','7','8'],
  'upper left':  ['9','10','11','12','13','14','15','16'],
  'lower left':  ['17','18','19','20','21','22','23','24'],
  'lower right': ['25','26','27','28','29','30','31','32'],
};

/* ══════════════════════════════════════════════════════════════
   PHASE 1 — LEXICAL NORMALIZATION (the Sieve)
   Runs independently and absolutely prior to pattern extraction.
   All word-to-number conversion, phonetic collision splitting,
   and token standardization happens here.
   ══════════════════════════════════════════════════════════════ */

const WORD_NUMS = {
  zero:0, one:1, two:2, three:3, four:4, five:5,
  six:6, seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12
};

/* Phonetic collision overrides — ASR merges separate concepts into
   compound phrases during fast dictation. These MUST be resolved
   before regex extraction or the patterns will miss valid data. */
const PHONETIC_OVERRIDES = [
  /* Number-word collisions: "for three" → "4 3", "to five" → "2 5" */
  [/\bfor\s+(\d)\b/gi, '4 $1'],
  [/\bto\s+(\d)\b/gi, '2 $1'],
  [/\bfor\s+(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi, '4 $1'],
  [/\bto\s+(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi, '2 $1'],
  /* "too" as 2 before a digit or number-word */
  [/\btoo\s+(\d)\b/gi, '2 $1'],
  [/\btoo\s+(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi, '2 $1'],
  /* "won" as 1 before a digit */
  [/\bwon\s+(\d)\b/gi, '1 $1'],
  /* "ate" as 8 in numeric context */
  [/\bate\s+(\d)\b/gi, '8 $1'],
  /* "free" → 3 when adjacent to digits */
  [/(\d)\s*free\b/gi, '$1 3'],
  [/\bfree\s+(\d)/gi, '3 $1'],
  /* "fore" → 4 in numeric context */
  [/\bfore\s+(\d)\b/gi, '4 $1'],
  /* "sex" → "6" — common ASR mishearing */
  [/\bsex\s+(\d)\b/gi, '6 $1'],
  /* "number bleeding" / "N bleeding" collision — ensure space between number and keyword */
  [/(\d)(bleed)/gi, '$1 $2'],
  [/(bleed(?:ing)?)\s*(\d)/gi, '$1 $2'],
  /* Ensure "tooth" / "number" commands have space before digit */
  [/\btooth(\d)/gi, 'tooth $1'],
  [/\bnumber(\d)/gi, 'number $1'],
  /* "switch" normalization */
  [/\bswitch\s*two\b/gi, 'switch to'],
  [/\bgo\s+(?:to\s+)?lingual\b/gi, 'switch to lingual'],
  [/\bgo\s+(?:to\s+)?buccal\b/gi, 'switch to buccal'],
  [/\bflip\s+(?:to\s+)?lingual\b/gi, 'switch to lingual'],
  [/\bflip\s+(?:to\s+)?buccal\b/gi, 'switch to buccal'],
  /* Quadrant aliases */
  [/\bUR\b/g, 'upper right'],
  [/\bUL\b/g, 'upper left'],
  [/\bLL\b/g, 'lower left'],
  [/\bLR\b/g, 'lower right'],
  /* "next tooth" / "skip" commands */
  [/\bnext\s*tooth\b/gi, '__NEXT_TOOTH__'],
  [/\bskip\b/gi, '__NEXT_TOOTH__'],
];

function _normalizePerioInput(text) {
  /* Step 1: Apply phonetic collision overrides */
  for (const [re, repl] of PHONETIC_OVERRIDES) {
    text = text.replace(re, repl);
  }

  /* Step 2: Word-to-number conversion */
  text = text.replace(
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi,
    m => String(WORD_NUMS[m.toLowerCase()])
  );

  /* Step 3: Collapse multiple spaces and trim */
  text = text.replace(/\s{2,}/g, ' ').trim();

  return text;
}

/* ══════════════════════════════════════════════════════════════
   STATE MACHINE
   Manages queue pointer, current tooth, and side state.
   ══════════════════════════════════════════════════════════════ */

class PerioVoiceContext {
  constructor() {
    this.currentTooth = null;
    this.currentSide = 'buccal';  // 'buccal' | 'lingual'
    this.quadrantQueue = [];      // teeth remaining in current walk
    this.queueIndex = 0;          // current position in queue
    this.lastSiteIdx = -1;        // last site index written (for retroactive BOP)
    this.lastTooth = null;        // last tooth written to (for retroactive BOP)
    this.explicitTooth = false;   // true when tooth was set by explicit command (not queue)
  }

  reset() {
    this.currentTooth = null;
    this.currentSide = 'buccal';
    this.quadrantQueue = [];
    this.queueIndex = 0;
    this.lastSiteIdx = -1;
    this.lastTooth = null;
    this.explicitTooth = false;
  }

  /* Advance to next tooth in quadrant queue (same side) */
  advanceTooth() {
    this.queueIndex++;
    if (this.queueIndex < this.quadrantQueue.length) {
      this.currentTooth = this.quadrantQueue[this.queueIndex];
    } else {
      /* Finished this side of the quadrant */
      this.currentTooth = null;
    }
  }

  /* Reposition queue pointer to a specific tooth (Fix 1: Dynamic Sequence Alignment).
     Instead of clearing the queue when the user jumps to a specific tooth,
     search the queue for that tooth's index and continue from there. */
  repositionTo(toothId) {
    const idx = this.quadrantQueue.indexOf(toothId);
    if (idx >= 0) {
      this.queueIndex = idx;
      this.currentTooth = toothId;
      this.explicitTooth = false; // still in queue mode
      return true;
    }
    return false;
  }
}

export const perioCtx = new PerioVoiceContext();

/* ══════════════════════════════════════════════════════════════
   PHASE 2 — PATTERN EXTRACTION (the Extractor)
   Regex patterns run against normalized text only.
   ══════════════════════════════════════════════════════════════ */

const RE_TOOTH = /(?:tooth|number)\s*#?(\d{1,2})\b/i;
const RE_QUADRANT = /\b(upper|lower)\s*(right|left)\b/i;
const RE_TRIPLET = /\b(\d{1,2})\s*[,\s-]\s*(\d{1,2})\s*[,\s-]\s*(\d{1,2})\b/;
const RE_BLEEDING_WITH_NUM = /(\d)\s*[-\s]*bleed|bleed(?:ing)?\s*[-\s]*(\d)/i;
const RE_BLEEDING_BARE = /\bbleed(?:ing)?\b/i;
const RE_MOBILITY = /\bmob(?:ility)?\s*(?:grade\s*)?([0-3])\b/i;
const RE_FURCATION = /\bfurc(?:ation)?\s*(?:class\s*)?([0-3])\b/i;
const RE_RECESSION = /\brecession\s*(\d{1,2})\b/i;
const RE_SWITCH_LINGUAL = /\b(?:switch\s*(?:to\s*)?)?(?:lingual|palatal)\b/i;
const RE_SWITCH_BUCCAL = /\b(?:switch\s*(?:to\s*)?)?(?:buccal|facial)\b/i;
const RE_NEXT_TOOTH = /__NEXT_TOOTH__/;

/* ── Main Entry Point ── */

export function processPerioEntry(text) {
  /* Phase 1: Normalize BEFORE any pattern extraction */
  text = _normalizePerioInput(text);
  let changed = false;

  /* Split into sentences/clauses for sequential processing */
  const clauses = text.split(/[.;]+/).map(s => s.trim()).filter(Boolean);
  for (const clause of clauses) {
    changed = _processClause(clause) || changed;
  }

  if (changed) updateDentalSummary();
}

function _processClause(text) {
  let changed = false;

  /* 0. "Next tooth" / "Skip" — advance queue without recording data */
  if (RE_NEXT_TOOTH.test(text)) {
    if (perioCtx.quadrantQueue.length > 0) {
      perioCtx.advanceTooth();
    }
    text = text.replace(RE_NEXT_TOOTH, '');
  }

  /* 1. Specific tooth override — with Dynamic Sequence Alignment (Fix 1).
     If the tooth is in the current quadrant queue, reposition the pointer
     instead of destroying the queue. The queue continues from the new position. */
  const toothMatch = RE_TOOTH.exec(text);
  if (toothMatch) {
    const id = toothMatch[1];
    if (parseInt(id) >= 1 && parseInt(id) <= 32) {
      /* Try to reposition within existing queue first */
      if (perioCtx.quadrantQueue.length > 0 && perioCtx.repositionTo(id)) {
        /* Successfully repositioned — queue and auto-advance preserved */
      } else {
        /* Tooth is outside current queue — enter explicit tooth mode */
        perioCtx.currentTooth = id;
        perioCtx.quadrantQueue = [];
        perioCtx.queueIndex = 0;
        perioCtx.explicitTooth = true;
      }
    }
  }

  /* 2. Quadrant command */
  const quadMatch = RE_QUADRANT.exec(text);
  if (quadMatch) {
    const key = quadMatch[1].toLowerCase() + ' ' + quadMatch[2].toLowerCase();
    const queue = QUADRANTS[key];
    if (queue) {
      perioCtx.quadrantQueue = [...queue];
      perioCtx.queueIndex = 0;
      perioCtx.currentTooth = queue[0];
      perioCtx.currentSide = 'buccal'; // reset to buccal at start of quadrant
      perioCtx.explicitTooth = false;
    }
  }

  /* 3. Side switch */
  if (RE_SWITCH_LINGUAL.test(text) && !RE_SWITCH_BUCCAL.test(text)) {
    perioCtx.currentSide = 'lingual';
    /* In quadrant walk, reset to first tooth for the new side */
    if (perioCtx.quadrantQueue.length > 0) {
      perioCtx.queueIndex = 0;
      perioCtx.currentTooth = perioCtx.quadrantQueue[0];
    }
  } else if (RE_SWITCH_BUCCAL.test(text) && !RE_SWITCH_LINGUAL.test(text)) {
    perioCtx.currentSide = 'buccal';
    if (perioCtx.quadrantQueue.length > 0) {
      perioCtx.queueIndex = 0;
      perioCtx.currentTooth = perioCtx.quadrantQueue[0];
    }
  }

  /* 4. Depth triplets — may have multiple in one clause.
     Fix 2 (State-Dependent Pointer Offsets): The destination address is
     siteOffset (0 for buccal, 3 for lingual) applied dynamically.
     In explicit tooth mode, after writing buccal, auto-flip to lingual
     so the next triplet routes to the other half without overwriting.
     In quadrant walk mode, advance to next tooth (same side). */
  let remaining = text;
  let tripletMatch;
  while ((tripletMatch = RE_TRIPLET.exec(remaining)) !== null) {
    if (!perioCtx.currentTooth) break;
    const depths = [
      parseInt(tripletMatch[1]),
      parseInt(tripletMatch[2]),
      parseInt(tripletMatch[3])
    ];
    /* Validate reasonable range (0-15mm) */
    if (depths.some(d => d < 0 || d > 15)) {
      remaining = remaining.slice(tripletMatch.index + tripletMatch[0].length);
      continue;
    }

    const siteOffset = perioCtx.currentSide === 'buccal' ? 0 : 3;
    const toothId = perioCtx.currentTooth;
    for (let i = 0; i < 3; i++) {
      setPerioSiteDepth(toothId, siteOffset + i, depths[i], null);
    }
    perioCtx.lastTooth = toothId;
    perioCtx.lastSiteIdx = siteOffset + 2; // last site written
    changed = true;

    /* Advance logic — differs by mode */
    if (perioCtx.quadrantQueue.length > 0) {
      /* Quadrant walk: advance to next tooth, same side */
      perioCtx.advanceTooth();
    } else if (perioCtx.explicitTooth) {
      /* Explicit tooth mode (Fix 2): flip side so next triplet
         writes to the other half of the SAME tooth's array.
         buccal [0-2] → lingual [3-5], then tooth is complete. */
      if (perioCtx.currentSide === 'buccal') {
        perioCtx.currentSide = 'lingual';
      } else {
        /* Both sides filled — clear explicit tooth */
        perioCtx.currentTooth = null;
        perioCtx.explicitTooth = false;
        perioCtx.currentSide = 'buccal'; // reset for next tooth
      }
    }

    remaining = remaining.slice(tripletMatch.index + tripletMatch[0].length);
  }

  /* 5. Bleeding markers */
  const bleedNumMatch = RE_BLEEDING_WITH_NUM.exec(text);
  if (bleedNumMatch) {
    /* "4 bleeding" or "bleeding 4" — find the tooth where depth=that number most recently */
    const num = parseInt(bleedNumMatch[1] || bleedNumMatch[2]);
    if (perioCtx.lastTooth) {
      const p = App.dentalChart?.teeth?.[perioCtx.lastTooth]?.perio;
      if (p) {
        const idx = p.depths.lastIndexOf(num);
        if (idx >= 0) { p.bop[idx] = true; changed = true; }
      }
    }
  } else if (RE_BLEEDING_BARE.test(text) && perioCtx.lastTooth) {
    /* Bare "bleeding" — retroactively tag the most recently entered site */
    const p = App.dentalChart?.teeth?.[perioCtx.lastTooth]?.perio;
    if (p && perioCtx.lastSiteIdx >= 0) {
      p.bop[perioCtx.lastSiteIdx] = true;
      changed = true;
    }
  }

  /* 6. Mobility */
  const mobMatch = RE_MOBILITY.exec(text);
  if (mobMatch && (perioCtx.currentTooth || perioCtx.lastTooth)) {
    const target = perioCtx.currentTooth || perioCtx.lastTooth;
    setPerioMobility(target, parseInt(mobMatch[1]));
    changed = true;
  }

  /* 7. Furcation */
  const furcMatch = RE_FURCATION.exec(text);
  if (furcMatch && (perioCtx.currentTooth || perioCtx.lastTooth)) {
    const target = perioCtx.currentTooth || perioCtx.lastTooth;
    setPerioFurcation(target, parseInt(furcMatch[1]));
    changed = true;
  }

  /* 8. Recession */
  const recMatch = RE_RECESSION.exec(text);
  if (recMatch && (perioCtx.currentTooth || perioCtx.lastTooth)) {
    const target = perioCtx.currentTooth || perioCtx.lastTooth;
    setPerioRecession(target, parseInt(recMatch[1]));
    changed = true;
  }

  return changed;
}
