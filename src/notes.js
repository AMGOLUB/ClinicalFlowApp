/* ============================================================
   CLINICALFLOW — Note Generation, Parsing, Rendering, Export
   ============================================================ */
import { App, cfg, tauriInvoke, __TAURI_READY__, getAbortCtrl, setAbortCtrl, GENERATION_TIMEOUT_MS, CORRECTIONS_DICT } from './state.js';
import { D, toast, updConn, updStatus, esc, fmt, fmtDate, fmtDT, wc, wait } from './ui.js';
import { applyLiveCorrections, MED_RX, MED_TERMS, hlTerms } from './transcript.js';
import { buildKeyterms } from './audio.js';
import { ROLES } from './speakers.js';
import { addToothTooltips } from './dictionary-features.js';
import { estimateTokens as _estimateTokens, formatNoteMarkdown as _formatNoteMarkdown,
         extractCorrectedNote, postProcessNote as _postProcessNote,
         parseOllamaResponse as _parseOllamaResponse } from './pure.js';
import { getTemplateRegistry, CODING_PROMPT, DENTAL_CODING_PROMPT, RADIOLOGY_CODING_PROMPT } from './templates.js';
import { formatDentalChartForPrompt, isDentalTemplate, parseDentalFindingsFromNote, applyParsedFindings, buildDentalChartExportSVG, buildDentalFindingsExportHTML } from './dental-chart.js';
import { getLanguageLabel, isEnglish, getWhisperCode } from './languages.js';
import { tauriListen } from './state.js';

/* Show note action buttons — core always, optional gated by settings */
export function updateNoteActions(){
  if(!App.noteGenerated) return;
  _showNoteActions();
}
function _showNoteActions(){
  D.regenBtn.style.display='flex';D.copyBtn.style.display='flex';D.expPdfBtn.style.display='flex';D.expBtn.style.display='inline-flex';
  if(D.copyEhrBtn)D.copyEhrBtn.style.display=App.settings.showCopyEhr?'flex':'none';
  if(D.expHl7Btn)D.expHl7Btn.style.display=App.settings.showExportHl7?'flex':'none';
  if(D.genNarrBtn)D.genNarrBtn.style.display=(App.settings.showNarrative&&isDentalTemplate(App.noteFormat))?'flex':'none';
  if(D.syncPmsBtn)D.syncPmsBtn.style.display=App.settings.showSyncPms?'flex':'none';
  if(D.phrasePaletteBtn)D.phrasePaletteBtn.style.display=App.settings.dictionaryFeatures?'flex':'none';
}

/* Build the clinical prompt for note generation */
export function buildClinicalPrompt(transcript,format){
  const registry=getTemplateRegistry(cfg);
  const tmpl=registry[format]||registry.soap;
  let formatInstr=tmpl.prompt;
  if(isDentalTemplate(format)){
    const chartData=formatDentalChartForPrompt();
    formatInstr=formatInstr.replace('{{DENTAL_CHART}}',
      chartData||'[No dental chart findings recorded]');
  }

  const langLabel = getLanguageLabel(App.language);
  const langInstr = isEnglish(App.language) ? '' :
`\nOUTPUT LANGUAGE: Write ALL clinical content in ${langLabel}. Keep section headers (like **SUBJECTIVE**, **OBJECTIVE**, etc.) in English for consistent parsing. Write all descriptions, findings, and narrative text in ${langLabel}. Medical terminology and drug names should remain in their standard international form.\n`;

  return `You are a medical scribe. Generate a clinical note from this transcript.
${langInstr}
CORE PRINCIPLE — EVIDENCE EXTRACTION:
Every line you write must be traceable to something explicitly said in the transcript. If you cannot point to a specific quote that supports a line, do not write that line.

STRICT OMISSION RULES:
1. If a section has no evidence in the transcript, OMIT THE ENTIRE SECTION HEADER. Do not write "None," "N/A," "Not mentioned," or "Not recorded."
2. A Pertinent Negative requires TWO things: the doctor ASKED about a symptom AND the patient said NO. If the doctor never asked, there is no pertinent negative. Absence of information is NOT a denial.
3. Never add generic medical advice, safety instructions, or return precautions that the doctor did not say.
4. Never add exam findings for body systems the doctor did not examine.
5. Never infer, assume, or fabricate any clinical content.

CONFIRMED vs DENIED:
- Patient says YES or describes having a symptom → Associated Symptom
- Patient says NO when asked about a specific symptom → Pertinent Negative (format: "Denies [symptom]")
- A symptom was never discussed → DO NOT DOCUMENT IT AT ALL

SAFETY RULE:
Scan for any language about self-harm, suicidal ideation, or harm to others (phrases like "better off dead," "hurting myself," "want to end it," "thoughts of suicide"). These must NEVER appear under Pertinent Negatives. If the patient expresses these, they MUST appear under Associated Symptoms and be flagged in the Assessment and Safety Plan.

ADDITIONAL RULES:
- Preserve exact drug names. Never substitute one drug for another.
- Patient-reported information goes in the history/subjective section. Provider observations and exam findings go in the examination/objective section.
- Capture ALL vital signs from any speaker.
- Capture ALL exam findings the doctor stated, including negative test results.
- Capture ALL orders: labs, imaging, tests, referrals.
- Capture ALL medication actions: continued, new, stopped, dose changes.
- Do not include these instructions in the note.

SPEAKER IDENTIFICATION:
Determine roles from context if not labeled. Symptom reporter = patient. Examiner/prescriber = provider. Vitals taker = nursing staff.

BEFORE WRITING, extract evidence:
A) Every distinct problem discussed — list ALL in Chief Complaint
B) Every question where the patient EXPLICITLY said NO → Pertinent Negatives (must have a quote)
C) Every number: vitals, scores, dosages, lab values, timeframes, measurements
D) Every medication: current, new, stopped, or dose-changed
E) Every order: labs, imaging, referrals, procedures
F) Every exam finding the doctor stated
G) Every specific instruction the doctor gave the patient
If you find no evidence for a section, skip it entirely.

TRANSCRIPTION AWARENESS:
Speech-to-text may garble medical terms. Use medical knowledge to correct obvious misspellings. Never replace one drug with a different drug. If unsure, keep the original wording.

FORMAT INSTRUCTIONS (follow these EXACTLY — use ONLY the section headers specified below, do NOT substitute with SOAP or any other format):
${formatInstr}

Visit Date: ${fmtDate(App.sessionStartTime||new Date())}
Session Duration: ${fmt(App.elapsed)}
Speakers: ${App.speakers.map(s=>`${s.name} (${s.role})`).join(', ')||'Unknown'}

TRANSCRIPT:
---
${transcript}
---

Generate the clinical note now. Only include information with direct evidence in the transcript. Omit any section that has no evidence.`;
}

export function formatTxForPrompt(){
  return App.entries.map(e=>{
    const role=e.spkRole==='doctor'?'Doctor':e.spkRole==='patient'?'Patient':e.spkName;
    const ts=fmt(e.ts);
    return `[${ts}] ${role}: ${e.text}`;
  }).join('\n');
}

export function buildVerificationPrompt(transcript,draftNote){
  const vLangLabel = getLanguageLabel(App.language);
  const vLangInstr = isEnglish(App.language) ? '' :
`\nThe note and transcript may be in ${vLangLabel}. Preserve the language of the draft note in your corrections. Keep section headers in English.\n`;
  return `You are a clinical note auditor. Compare this draft note against the transcript.
${vLangInstr}

TRANSCRIPT:
${transcript}

DRAFT NOTE:
${draftNote}

INSTRUCTIONS:
- NEVER flag section headers, labels, or structural formatting (like 'SUBJECTIVE', 'OBJECTIVE', 'ASSESSMENT', 'PLAN', 'Chief Complaint:', 'Vitals:', 'Current Medications:', 'Follow-up:', etc.) — these are structural elements, not clinical claims.
- NEVER flag the note's organizational structure. Only flag specific clinical FACTS that contradict or have no evidence in the transcript.
- Check ONLY for hallucinations: clinical claims in the note that have NO evidence in the transcript.
- Check medication names and vital sign numbers match exactly.
- Check pertinent negatives — remove any denial the patient never actually stated.
- CONTRADICTIONS: If the same finding appears in two contradictory places (e.g., patient reports a symptom AND denies it), remove the incorrect entry. Trust what the patient actually said in the transcript.
- WRONG SECTION: Check medication categorization — if a medication is being prescribed for the first time in this visit, it belongs under New Medications, NOT Current Medications. Current Medications are only what the patient was already taking before this encounter. Apply the same logic to all categorized lists.
- OMISSIONS: If the doctor explicitly prescribed, ordered, or recommended something in the transcript and it is missing from the Plan section, add it.

If no errors found, respond with exactly:
CLEAN

If errors found, respond with:
CORRECTED NOTE:
[the full corrected note with hallucinated facts removed — preserve ALL section headers and formatting exactly as they appear in the draft]`;
}

/* extractCorrectedNote imported from pure.js */

/* ── AI-Powered Dental Chart Extraction ── */

const _DENTAL_EXTRACT_PROMPT=`You are a dental informatics system. Extract per-tooth findings from the text and return ONLY a JSON object. No markdown, no explanation, no commentary.

STATES — use these exact string IDs:
  "decay"    = caries, cavities, carious lesion, demineralization, secondary/recurrent caries, incipient caries, Class I–V caries, interproximal caries, pit-and-fissure caries, cervical caries
  "missing"  = extracted, absent, edentulous space, previously removed, congenitally missing, lost, avulsed
  "restored" = filling, crown, composite, amalgam, onlay, inlay, veneer, porcelain-fused-to-metal (PFM), post-and-core, existing restoration, bridge abutment, temporary restoration
  "implant"  = dental implant, osseointegrated fixture, implant-supported crown/bridge
  "rct"      = root canal treatment/therapy, endodontic treatment/failure/retreat, periapical pathology/abscess/radiolucency, pulpitis (irreversible), pulp necrosis, apical periodontitis
  "fracture" = cracked tooth, fractured cusp, chipped tooth, vertical root fracture, craze line (symptomatic)
  "impacted" = full/partial bony impaction, soft tissue impaction, unerupted

SURFACES — include ONLY for "decay", "restored", or "fracture" states:
  M=mesial  O=occlusal  D=distal  B=buccal  L=lingual  I=incisal  F=facial/labial
  Compound adjectives: mesio-occluso-distal=["M","O","D"]  disto-occlusal=["D","O"]  mesio-lingual=["M","L"]  bucco-lingual=["B","L"]
  Always use SINGLE-LETTER codes in the output array, never full words.

RULES:
1. Tooth numbers 1–32 only (Universal/ADA numbering). "Number 3", "tooth #3", "#3" all mean tooth 3.
2. Only include teeth with pathological or treatment findings. Never include healthy teeth.
3. If a tooth appears multiple times, use the most clinically significant: decay > rct > fracture > restored > missing > implant > impacted.
4. Edentulous space / "previously extracted" / "was extracted" = "missing".
5. Periapical pathology / endodontic failure / suspect endodontic failure / pulp necrosis = "rct".
6. "Recommend composite restoration" or "recommend filling" still means the current state is "decay" (the treatment is planned, not yet done).
7. "Existing amalgam/composite restoration" or "previously restored" = "restored".
8. "Indirect pulp cap" for approaching pulp = "decay" (treatment is conservative, tooth is carious).
9. "Full bony impacted" / "partial bony impacted" / "soft tissue impacted" = "impacted".
10. Only include surfaces when explicitly described. Do not infer surfaces.
11. ABBREVIATION EXCLUSION: NEVER extract tooth surfaces from abbreviations that represent dental materials, prosthetics, procedures, or diagnoses. Explicitly ignore acronyms such as FPD (fixed partial denture), RPD (removable partial denture), ZOE (zinc oxide eugenol), FGC (full gold crown), PFM (porcelain-fused-to-metal), MTA (mineral trioxide aggregate), SDF (silver diamine fluoride), BOP (bleeding on probing), CAL (clinical attachment level/loss), TMD (temporomandibular disorder), TMJ (temporomandibular joint), MOD only counts as surfaces when describing a cavity/restoration location, NOT as a standalone abbreviation for a procedure.
12. ANTERIOR vs POSTERIOR SURFACE CONSTRAINTS: Teeth 6–11 and 22–27 are anterior teeth. They possess only Mesial (M), Distal (D), Lingual (L), Incisal (I), and Facial (F) surfaces. They NEVER have Occlusal (O) or Buccal (B) surfaces. All other teeth (1–5, 12–21, 28–32) are posterior and use Occlusal (O) and Buccal (B) instead of Incisal (I) and Facial (F). If the text says "occlusal" for an anterior tooth, ignore that surface. If the text says "incisal" for a posterior tooth, ignore that surface.

EXAMPLES:
Input: "Number 3 — mesio-occluso-distal caries, recommend composite restoration."
Output: {"3":{"state":"decay","surfaces":["M","O","D"]}}

Input: "Number 14 was previously extracted — edentulous space."
Output: {"14":{"state":"missing"}}

Input: "Number 19 — suspect endodontic failure with periapical pathology, refer to endodontist."
Output: {"19":{"state":"rct"}}

Input: "Number 30 — disto-occlusal caries approaching pulp, recommend indirect pulp cap."
Output: {"30":{"state":"decay","surfaces":["D","O"]}}

Input: "Number 1 — full bony impacted upper right third molar."
Output: {"1":{"state":"impacted"}}

Input: "Tooth #19: Existing amalgam restoration intact — Surfaces: O"
Output: {"19":{"state":"restored","surfaces":["O"]}}

If no dental findings exist, return exactly: {}

TEXT:
---
`;

/* Surface name → code map for normalizing AI output */
const _SURF_CODE_MAP={mesial:'M',occlusal:'O',distal:'D',buccal:'B',lingual:'L',incisal:'I',facial:'F',labial:'F'};
const _SURF_STATES_AI=new Set(['decay','restored','fracture']);

function _normalizeSurface(s){
  if(typeof s!=='string') return null;
  const t=s.trim().toLowerCase();
  if(t.length===1&&'modblif'.includes(t)) return t.toUpperCase();
  return _SURF_CODE_MAP[t]||null;
}

/* Pre-expand clinical acronyms that collide with surface codes before AI extraction */
const _ACRONYM_EXPANSIONS=[
  [/\bFPD\b/g,'fixed partial denture'],
  [/\bRPD\b/g,'removable partial denture'],
  [/\bZOE\b/g,'zinc oxide eugenol'],
  [/\bFGC\b/g,'full gold crown'],
  [/\bPFM\b/g,'porcelain-fused-to-metal'],
  [/\bMTA\b/g,'mineral trioxide aggregate'],
  [/\bSDF\b/g,'silver diamine fluoride'],
  [/\bBOP\b/g,'bleeding on probing'],
  [/\bCAL\b/g,'clinical attachment loss'],
  [/\bTMD\b/g,'temporomandibular disorder'],
  [/\bTMJ\b/g,'temporomandibular joint'],
  [/\bGBI\b/g,'gingival bleeding index'],
  [/\bOHI\b/g,'oral hygiene index'],
  [/\bIPR\b/g,'interproximal reduction'],
];

function _expandAcronyms(text){
  let out=text;
  for(const[re,expansion]of _ACRONYM_EXPANSIONS) out=out.replace(re,expansion);
  return out;
}

async function _aiExtractDentalFindings(noteText){
  if(!noteText||noteText.trim().length<20) return null;
  /* Pre-expand risky acronyms so AI never sees raw capital-letter abbreviations */
  const cleanText=_expandAcronyms(noteText);
  const prompt=_DENTAL_EXTRACT_PROMPT+cleanText+'\n---';
  try{
    let raw;
    if(App.aiEngine==='cloud'&&App.claudeKey){
      raw=await streamClaudeResponse(prompt,null,0.1,1024);
    }else if(App.aiEngine==='ollama'&&App.ollamaConnected){
      raw=await streamOllamaResponse(prompt,null,0.1,2048);
    }else{ return null; }
    if(!raw) return null;

    /* Strip markdown fences if present */
    const jsonMatch=raw.match(/\{[\s\S]*\}/);
    if(!jsonMatch){ console.warn('[ClinicalFlow] AI dental: no JSON found in response'); return null; }
    const parsed=JSON.parse(jsonMatch[0]);
    if(typeof parsed!=='object'||Array.isArray(parsed)) return null;

    /* Validate and normalize every entry */
    const VALID_STATES=['decay','missing','restored','implant','rct','fracture','impacted'];
    const _AI_ANTERIOR=new Set([6,7,8,9,10,11,22,23,24,25,26,27]);
    const out={};
    for(const[id,d]of Object.entries(parsed)){
      const n=parseInt(id);
      if(isNaN(n)||n<1||n>32) continue;
      if(!d||!VALID_STATES.includes(d.state)) continue;
      const entry={state:d.state};
      /* Only allow surfaces for decay/restored/fracture */
      if(_SURF_STATES_AI.has(d.state)&&Array.isArray(d.surfaces)&&d.surfaces.length){
        const normed=d.surfaces.map(_normalizeSurface).filter(Boolean);
        const unique=[...new Set(normed)];
        /* Enforce anatomical constraints: anterior teeth have no O/B, posterior no I/F */
        const isAnterior=_AI_ANTERIOR.has(n);
        const valid=unique.filter(s=>isAnterior?(s!=='O'&&s!=='B'):(s!=='I'&&s!=='F'));
        if(valid.length) entry.surfaces=valid;
      }
      out[String(n)]=entry;
    }
    if(Object.keys(out).length) console.debug('[ClinicalFlow] AI dental extraction:',JSON.stringify(out));
    return Object.keys(out).length?out:null;
  }catch(e){
    console.warn('[ClinicalFlow] AI dental extraction failed:',e.message);
    return null;
  }
}

function postProcessNote(text,transcript){
  return _postProcessNote(text, transcript, CORRECTIONS_DICT);
}

function estimateTokens(text){ return _estimateTokens(text); }

export function formatNoteMarkdown(text){
  return _formatNoteMarkdown(text, esc);
}

/* Ollama streaming helper */
async function streamOllamaResponse(prompt,renderEl,temperature,numCtx){
  const ctrl=getAbortCtrl();
  if(ctrl){ctrl.abort();setAbortCtrl(null);}
  const ac=new AbortController();
  setAbortCtrl(ac);

  const r=await fetch(App.ollamaUrl+'/api/generate',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    signal:ac.signal,
    body:JSON.stringify({model:App.ollamaModel,prompt:prompt,stream:true,options:{temperature:temperature||0.3,num_ctx:numCtx||4096}})
  });
  if(!r.ok){const err=await r.text();throw new Error(`Ollama returned ${r.status}: ${err}`);}
  const reader=r.body.getReader();const decoder=new TextDecoder();let fullText='';
  try{
    while(true){
      const{done,value}=await reader.read();if(done)break;
      const chunk=decoder.decode(value,{stream:true});
      const lines=chunk.split('\n').filter(l=>l.trim());
      for(const line of lines){
        try{const j=JSON.parse(line);if(j.response){fullText+=j.response;if(renderEl){renderEl.innerHTML=formatNoteMarkdown(fullText);renderEl.closest('.note-section')?.scrollIntoView({block:'end',behavior:'smooth'});}}}catch(e){}
      }
    }
  }catch(e){if(e.name==='AbortError'){console.debug('[ClinicalFlow] Generation cancelled');throw e;}throw e;}
  finally{setAbortCtrl(null);}
  return fullText;
}

/* Claude API streaming helper */
async function streamClaudeResponse(prompt,renderEl,temperature,maxTokens){
  if(!App.claudeKey)throw new Error('No Claude API key configured');
  const ctrl=getAbortCtrl();
  if(ctrl){ctrl.abort();setAbortCtrl(null);}
  const ac=new AbortController();
  setAbortCtrl(ac);

  const response=await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':App.claudeKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
    signal:ac.signal,
    body:JSON.stringify({model:App.cloudModel||'claude-haiku-4-5-20251001',max_tokens:maxTokens||2048,temperature:temperature||0.3,stream:true,messages:[{role:'user',content:prompt}]})
  });
  if(!response.ok){
    const err=await response.text();
    if(response.status===401)throw new Error('Invalid API key. Check your Anthropic key in Settings.');
    if(response.status===429)throw new Error('Rate limited. Wait a moment and try again.');
    if(response.status===529)throw new Error('Anthropic API is temporarily overloaded. Try again in a few seconds.');
    throw new Error(`Claude API error ${response.status}: ${err}`);
  }
  const reader=response.body.getReader();const decoder=new TextDecoder();let fullText='';let buffer='';
  try{
    while(true){
      const{done,value}=await reader.read();if(done)break;
      buffer+=decoder.decode(value,{stream:true});
      const lines=buffer.split('\n');buffer=lines.pop();
      for(const line of lines){
        if(!line.startsWith('data: '))continue;
        const data=line.slice(6).trim();if(data==='[DONE]')continue;
        try{
          const event=JSON.parse(data);
          if(event.type==='content_block_delta'&&event.delta?.type==='text_delta'){fullText+=event.delta.text;if(renderEl){renderEl.innerHTML=formatNoteMarkdown(fullText);renderEl.closest('.note-section')?.scrollIntoView({block:'end',behavior:'smooth'});}}
          if(event.type==='error'){throw new Error(event.error?.message||'Stream error');}
        }catch(parseErr){if(parseErr.message==='Stream error')throw parseErr;continue;}
      }
    }
  }catch(e){if(e.name==='AbortError'){console.debug('[ClinicalFlow] Claude generation cancelled');throw e;}throw e;}
  finally{setAbortCtrl(null);}
  return fullText;
}

/* Parse response text into structured sections */
export function parseOllamaResponse(text){
  const registry=getTemplateRegistry(cfg);
  const tmpl=registry[App.noteFormat];
  return _parseOllamaResponse(text, App.noteFormat, tmpl?.noteTitle);
}

/* Note Generation — routes to Cloud AI, Ollama, or rule-based */
let _generating=false;

export async function generateNote(){
  if(_generating){return;}
  if(App.entries.length===0){toast('No transcript to generate from.','warning');return;}
  if(App.isRecording){toast('Stop recording first.','warning');return;}
  _generating=true;
  try{
    if(App.aiEngine==='cloud'&&App.claudeKey){await generateCloudNote();}
    else if(App.aiEngine==='ollama'&&App.ollamaConnected){await generateOllamaNote();}
    else{
      if(App.aiEngine==='cloud'&&!App.claudeKey){toast('No API key. Add your Anthropic key in Settings, or switch to Ollama.','warning',5000);}
      else if(App.aiEngine==='ollama'&&!App.ollamaConnected){toast('Ollama not connected. Using rule-based fallback.','warning',4000);}
      await generateRuleBasedNote();
    }
  }finally{_generating=false;}
}

async function generateOllamaNote(){
  const transcript=formatTxForPrompt();const prompt=buildClinicalPrompt(transcript,App.noteFormat);const doVerify=App.ollamaVerify;
  const registry=getTemplateRegistry(cfg);const fmtLabel=(registry[App.noteFormat]||registry.soap).noteTitle||'Clinical Note';
  console.debug('[ClinicalFlow] Generating note. Verification pass:',doVerify?'ON':'OFF');
  D.noteEmpty.style.display='none';D.noteSec.style.display='block';D.noteGen.style.display='none';updStatus('generating',fmtLabel);
  const promptTokens=estimateTokens(prompt);let numCtx=4096;if(promptTokens>3000){numCtx=8192;}
  if(promptTokens>numCtx*0.85){toast('Transcript is very long. Note quality may be affected.','warning',6000);}
  D.noteSec.innerHTML='';
  const streamEl=document.createElement('div');streamEl.className='note-section';
  const passLabel=doVerify?'Pass 1/2':'';
  streamEl.innerHTML=`<div class="note-section-header"><span class="note-section-title">${passLabel?passLabel+' — ':''}Generating ${esc(fmtLabel)} with ${esc(App.ollamaModel)}...</span></div><div class="note-section-body streaming" id="streamingNoteBody"></div>`;
  D.noteSec.appendChild(streamEl);const bodyEl=document.getElementById('streamingNoteBody');
  let fullText='';
  try{
    const timeoutPromise=new Promise((_,reject)=>setTimeout(()=>reject(new Error('Note generation timed out after 2 minutes')),GENERATION_TIMEOUT_MS));
    fullText=await Promise.race([streamOllamaResponse(prompt,bodyEl,0.3,numCtx),timeoutPromise]);
    bodyEl.classList.remove('streaming');
    if(!fullText||fullText.trim().length<50){
      console.warn('[ClinicalFlow] Ollama returned empty/short response:',fullText?.length||0,'chars');
      toast('Ollama returned an incomplete note. Retrying...','warning',4000);
      fullText=await Promise.race([streamOllamaResponse(prompt,bodyEl,0.5,numCtx),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Retry timed out')),GENERATION_TIMEOUT_MS))]);
      if(!fullText||fullText.trim().length<50){toast('Generation failed after retry. Falling back to rule-based note.','error',6000);if(bodyEl)bodyEl.classList.remove('streaming');await generateRuleBasedNote();return;}
    }
    if(doVerify&&fullText.length>50){
      console.debug('[ClinicalFlow] Starting verification pass...');
      streamEl.querySelector('.note-section-title').textContent='Pass 2/2 — Verifying accuracy...';bodyEl.classList.add('streaming');
      const verifyPrompt=buildVerificationPrompt(transcript,fullText);const verifyText=await streamOllamaResponse(verifyPrompt,null,0.1,4096);
      const trimmed=verifyText.trim();
      if(trimmed==='CLEAN'||trimmed==='NO ISSUES FOUND'){toast('Verification — note is accurate','success');}
      else if(verifyText.toLowerCase().includes('corrected note')){fullText=extractCorrectedNote(verifyText);toast('Verification — corrections applied','success');}
      else{toast('Verification complete','info');}
      bodyEl.classList.remove('streaming');
    }
    fullText=postProcessNote(fullText,transcript);
    const sections=parseOllamaResponse(fullText);App.noteSections=sections;App.noteGenerated=true;renderNoteSec(sections);
    _showNoteActions();
    updStatus('ready');toast('Clinical note ready for review','success');
    if(App.settings.autoCoding){generateCoding().catch(e=>console.warn('[ClinicalFlow] Auto-coding failed:',e));}
  }catch(e){
    if(e.name==='AbortError'){console.debug('[ClinicalFlow] Note generation was cancelled');toast('Generation cancelled','info');updStatus('ready');return;}
    if(e.message&&e.message.includes('timed out')){
      console.warn('[ClinicalFlow] Generation timed out');
      if(fullText&&fullText.trim().length>100){
        toast('Generation timed out. Showing partial note.','warning',6000);fullText=postProcessNote(fullText,transcript);
        const sections=parseOllamaResponse(fullText);App.noteSections=sections;App.noteGenerated=true;renderNoteSec(sections);
        const warningEl=document.createElement('div');warningEl.className='note-warning';warningEl.textContent='This note may be incomplete — generation timed out. Review carefully.';D.noteSec.prepend(warningEl);
        _showNoteActions();updStatus('ready');return;
      }
      toast('Generation timed out. Try a smaller model or shorter transcript.','error',8000);if(bodyEl)bodyEl.classList.remove('streaming');updStatus('ready');return;
    }
    console.error('[ClinicalFlow] Ollama generation error:',e);
    if(fullText&&fullText.trim().length>100){
      toast('Ollama disconnected mid-generation. Showing partial note.','warning',6000);fullText=postProcessNote(fullText,transcript);
      const sections=parseOllamaResponse(fullText);App.noteSections=sections;App.noteGenerated=true;renderNoteSec(sections);
      const warningEl=document.createElement('div');warningEl.className='note-warning';warningEl.textContent='This note is incomplete — Ollama disconnected during generation. Review carefully.';D.noteSec.prepend(warningEl);
      _showNoteActions();updStatus('ready');return;
    }
    if(bodyEl)bodyEl.classList.remove('streaming');toast(`Ollama error: ${e.message}. Falling back to rule-based.`,'error',6000);await generateRuleBasedNote();
  }
}

async function generateCloudNote(){
  const transcript=formatTxForPrompt();const prompt=buildClinicalPrompt(transcript,App.noteFormat);const doVerify=App.claudeVerify;
  const registry=getTemplateRegistry(cfg);const fmtLabel=(registry[App.noteFormat]||registry.soap).noteTitle||'Clinical Note';
  console.debug('[ClinicalFlow] Generating note via Cloud AI. Verification:',doVerify?'ON':'OFF');
  D.noteEmpty.style.display='none';D.noteSec.style.display='block';D.noteGen.style.display='none';updStatus('generating',fmtLabel);
  D.noteSec.innerHTML='';const streamEl=document.createElement('div');streamEl.className='note-section';
  const passLabel=doVerify?'Pass 1/2':'';
  streamEl.innerHTML=`<div class="note-section-header"><span class="note-section-title">${passLabel?passLabel+' — ':''}Generating ${esc(fmtLabel)}...</span></div><div class="note-section-body streaming" id="streamingNoteBody"></div>`;
  D.noteSec.appendChild(streamEl);const bodyEl=document.getElementById('streamingNoteBody');
  let fullText='';
  try{
    fullText=await streamClaudeResponse(prompt,bodyEl,0.3,4096);bodyEl.classList.remove('streaming');
    if(doVerify&&fullText.length>50){
      console.debug('[ClinicalFlow] Starting cloud verification pass...');
      streamEl.querySelector('.note-section-title').textContent='Pass 2/2 — Verifying accuracy...';bodyEl.classList.add('streaming');
      const verifyPrompt=buildVerificationPrompt(transcript,fullText);const verifyText=await streamClaudeResponse(verifyPrompt,null,0.1,2048);
      const trimmed=verifyText.trim();
      if(trimmed==='CLEAN'||trimmed==='NO ISSUES FOUND'){toast('Verification — note is accurate','success');}
      else if(verifyText.toLowerCase().includes('corrected note')){fullText=extractCorrectedNote(verifyText);toast('Verification — corrections applied','success');}
      else{toast('Verification complete','info');}
      bodyEl.classList.remove('streaming');
    }
    fullText=postProcessNote(fullText,transcript);
    const sections=parseOllamaResponse(fullText);App.noteSections=sections;App.noteGenerated=true;renderNoteSec(sections);
    _showNoteActions();updStatus('ready');toast('Clinical note ready for review','success');
    if(App.settings.autoCoding){generateCoding().catch(e=>console.warn('[ClinicalFlow] Auto-coding failed:',e));}
  }catch(e){
    if(e.name==='AbortError'){console.debug('[ClinicalFlow] Note generation was cancelled');toast('Generation cancelled','info');updStatus('ready');return;}
    console.error('[ClinicalFlow] Cloud generation error:',e);
    if(fullText&&fullText.trim().length>100){
      toast('Cloud AI disconnected. Showing partial note.','warning',6000);fullText=postProcessNote(fullText,transcript);
      const sections=parseOllamaResponse(fullText);App.noteSections=sections;App.noteGenerated=true;renderNoteSec(sections);
      const warningEl=document.createElement('div');warningEl.className='note-warning';warningEl.textContent='This note may be incomplete — connection was interrupted. Review carefully.';D.noteSec.prepend(warningEl);
      _showNoteActions();updStatus('ready');return;
    }
    if(bodyEl)bodyEl.classList.remove('streaming');
    if(App.ollamaConnected){toast(`Cloud AI failed: ${e.message}. Falling back to Ollama.`,'warning',6000);await generateOllamaNote();}
    else{toast(`Cloud AI failed: ${e.message}. Using rule-based fallback.`,'error',6000);await generateRuleBasedNote();}
  }
}

async function generateRuleBasedNote(){
  const registry=getTemplateRegistry(cfg);const fmtLabel=(registry[App.noteFormat]||registry.soap).noteTitle||'Clinical Note';
  D.noteEmpty.style.display='none';D.noteSec.style.display='none';D.noteGen.style.display='flex';updStatus('generating',fmtLabel);
  await wait(1800);
  const a=analyzeTx();let sections;
  switch(App.noteFormat){
    case 'soap':sections=genSOAP(a);break;
    case 'hpi':sections=genHPI(a);break;
    case 'problem':sections=genProblem(a);break;
    default:{const registry=getTemplateRegistry(cfg);const tmpl=registry[App.noteFormat]||registry.soap;sections=genGeneric(a,tmpl);}
  }
  App.noteSections=sections;App.noteGenerated=true;renderNoteSec(sections);
  D.noteGen.style.display='none';D.noteSec.style.display='block';
  _showNoteActions();
  updStatus('ready');toast('Clinical note generated','success');
  if(App.settings.autoCoding){generateCoding().catch(e=>console.warn('[ClinicalFlow] Auto-coding failed:',e));}
}

function analyzeTx(){
  const docE=App.entries.filter(e=>e.spkRole==='doctor');const patE=App.entries.filter(e=>e.spkRole==='patient');
  const all=App.entries.map(e=>e.text).join(' ').toLowerCase();const patTx=patE.map(e=>e.text).join(' ');const docTx=docE.map(e=>e.text).join(' ');
  let cc='Not documented';
  if(patE.length>0){const sub=patE.find(e=>e.text.split(/\s+/).length>4);cc=sub?sub.text:patE[0].text;if(cc.length>200)cc=cc.substring(0,197)+'...';}
  const symKw=['pain','ache','fever','cough','fatigue','dizzy','dizziness','nausea','headache','swelling','bleeding','weakness','numbness','tingling','shortness of breath','chest pain','back pain','abdominal pain','sore throat','rash','vomiting','palpitations','syncope','dyspnea','edema','tremor','seizure','insomnia','anxiety','constipation','diarrhea','hematuria','dysuria','vertigo','tinnitus','wheezing','hemoptysis','dysphagia','pruritus','malaise','diaphoresis'];
  const detectedConditions=MED_TERMS.filter(c=>all.includes(c.toLowerCase()));
  const syms=[...new Set([...symKw.filter(s=>all.includes(s)),...detectedConditions])];
  const meds=MED_RX.filter(m=>all.includes(m.toLowerCase()));
  const vitals=[];
  const vr=/(?:bp|blood pressure)[:\s]*(\d+\/\d+)|(?:heart rate|hr|pulse)[:\s]*(\d+)|(?:temp|temperature)[:\s]*([\d.]+)|(?:o2|oxygen|spo2|sat)[:\s]*(\d+)|(?:resp|respiratory)[:\s]*(\d+)/gi;
  let m;while((m=vr.exec(all))!==null){if(m[1])vitals.push(`BP: ${m[1]}`);if(m[2])vitals.push(`HR: ${m[2]}`);if(m[3])vitals.push(`Temp: ${m[3]}`);if(m[4])vitals.push(`SpO2: ${m[4]}%`);if(m[5])vitals.push(`RR: ${m[5]}`);}
  const patHist=patE.map(e=>e.text).filter(s=>s.split(/\s+/).length>3);
  const patientHistory=patHist.length>0?patHist.join('\n\n'):'Patient history not captured in transcript.';
  const examKw=['blood pressure','heart rate','pulse','temperature','oxygen','spo2','normal','abnormal','tender','swollen','clear','breath sounds','heart sounds','regular','irregular','murmur','soft','non-tender','alert','oriented','afebrile','well-appearing','no distress','lungs clear','intact','exam','neurological','cranial nerves','focal','deficit'];
  const examStmts=docE.filter(e=>examKw.some(k=>e.text.toLowerCase().includes(k))).map(e=>e.text);
  const examFindings=examStmts.length>0?examStmts.join('\n'):'Physical examination findings not documented in transcript.\n[Provider to complete exam documentation]';
  const durMatch=patTx.match(/(?:for\s+(?:about\s+)?)?(\d+)\s*(day|week|month|year)s?\b/i);const duration=durMatch?durMatch[0]:null;
  return{cc,patTx,docTx,all,syms,meds,vitals,dur:fmt(App.elapsed),patientHistory,examFindings,duration};
}

function genSOAP(a){
  let subj=`Chief Complaint: ${a.cc}`;if(a.duration)subj+=`\nDuration: ${a.duration}`;
  subj+='\n\nHistory of Present Illness:';subj+='\n'+a.patientHistory;
  if(a.syms.length)subj+=`\n\nAssociated Symptoms: ${a.syms.join(', ')}`;if(a.meds.length)subj+=`\nCurrent Medications Mentioned: ${a.meds.join(', ')}`;
  let obj=`Vitals: ${a.vitals.length?a.vitals.join(', '):'[Not recorded in transcript]'}`;obj+='\n\nPhysical Examination:\n'+a.examFindings;
  let assess='';if(a.syms.length>0)assess+=`Presenting symptoms include ${a.syms.join(', ')}.`;else assess+='Clinical presentation as documented above.';assess+='\n\nDifferential diagnosis and clinical assessment to be completed by provider.';
  let plan='';if(a.meds.length)plan+='Medications Discussed:\n'+a.meds.map(m=>`  - ${m.charAt(0).toUpperCase()+m.slice(1)}`).join('\n')+'\n\n';
  plan+='Diagnostics: As clinically indicated.\nPatient Education: Discussed condition and treatment plan.\nFollow-up: As discussed during encounter.\nDisposition: Per provider determination.';
  return{title:'SOAP Note',sections:[{key:'subjective',title:'Subjective',content:subj},{key:'objective',title:'Objective',content:obj},{key:'assessment',title:'Assessment',content:assess},{key:'plan',title:'Plan',content:plan}]};
}

function genHPI(a){
  const rosCats={
    'Constitutional':a.syms.some(s=>['fever','fatigue','weakness'].includes(s))?`Reports: ${a.syms.filter(s=>['fever','fatigue','weakness'].includes(s)).join(', ')}`:'Not specifically addressed',
    'HEENT':a.syms.some(s=>['headache','sore throat'].includes(s))?`Reports: ${a.syms.filter(s=>['headache','sore throat'].includes(s)).join(', ')}`:'Not specifically addressed',
    'Cardiovascular':a.syms.some(s=>s.includes('chest'))?'See HPI':'Not specifically addressed',
    'Respiratory':a.syms.some(s=>['cough','shortness of breath'].includes(s))?'See HPI':'Not specifically addressed',
    'Gastrointestinal':a.syms.some(s=>['nausea','vomiting','abdominal pain'].includes(s))?'See HPI':'Not specifically addressed',
    'Musculoskeletal':a.syms.some(s=>['pain','ache','back pain','swelling'].includes(s))?'See HPI':'Not specifically addressed',
    'Neurological':a.syms.some(s=>['headache','dizzy','dizziness','numbness','tingling'].includes(s))?'See HPI':'Not specifically addressed'
  };
  const rosT=Object.entries(rosCats).map(([k,v])=>`${k}: ${v}`).join('\n');
  return{title:'HPI-Focused Note',sections:[
    {key:'demographics',title:'Patient Demographics',content:`Visit Date: ${fmtDate(App.sessionStartTime||new Date())}\nSession Duration: ${a.dur}\nParticipants: ${App.speakers.map(s=>`${s.name} (${ROLES[s.role]?.label})`).join(', ')}`},
    {key:'cc',title:'Chief Complaint',content:a.cc},
    {key:'hpi',title:'History of Present Illness',content:[a.duration?`Duration: ${a.duration}`:null,a.patientHistory,a.syms.length?`\nReported Symptoms: ${a.syms.join(', ')}.`:null,a.meds.length?`Medication History: ${a.meds.join(', ')}.`:null].filter(Boolean).join('\n')},
    {key:'ros',title:'Review of Systems',content:rosT},
    {key:'exam',title:'Physical Examination',content:`Vitals: ${a.vitals.length?a.vitals.join(', '):'[Not recorded]'}\n\n${a.examFindings}`},
    {key:'plan',title:'Assessment & Plan',content:[a.syms.length?`Symptoms consistent with ${a.syms.slice(0,3).join(', ')}.`:'Clinical presentation documented.','\nAssessment to be finalized by provider.',a.meds.length?'\nMedications Discussed:\n'+a.meds.map(m=>`  - ${m.charAt(0).toUpperCase()+m.slice(1)}`).join('\n'):null,'\nFollow-up as discussed.'].filter(Boolean).join('\n')}
  ]};
}

function genProblem(a){
  const prob=a.cc.split(/[.,!?]/)[0].trim()||'Primary Concern';
  return{title:'Problem-Oriented Note',sections:[
    {key:'overview',title:'Visit Overview',content:`Date: ${fmtDate(App.sessionStartTime||new Date())}\nDuration: ${a.dur}\nChief Complaint: ${a.cc}\nSpeakers: ${App.speakers.map(s=>s.name).join(', ')}`},
    {key:'problem-1',title:`Problem 1: ${prob}`,content:['Subjective:',a.patientHistory,'','Objective:',a.vitals.length?`Vitals: ${a.vitals.join(', ')}`:'[Vitals not recorded]',a.examFindings,'','Assessment:',a.syms.length?`Presenting with ${a.syms.join(', ')}.`:'See history above.','Clinical assessment to be completed by provider.','','Plan:','Management as discussed during encounter.'].join('\n')},
    {key:'medications',title:'Medications',content:a.meds.length?a.meds.map(m=>`- ${m.charAt(0).toUpperCase()+m.slice(1)}`).join('\n'):'No medications mentioned in transcript.'},
    {key:'followup',title:'Follow-Up',content:'Follow-up as discussed during encounter.\nReturn if symptoms worsen or new symptoms develop.'}
  ]};
}

function genGeneric(a,tmpl){
  const sectionNames=tmpl.sections||['Clinical Note'];
  const sections=sectionNames.map((name,i)=>{
    let content='';const lower=name.toLowerCase();
    if(/history|hpi|data|subjective|presenting/i.test(lower)){
      content=`Chief Complaint: ${a.cc}`;
      if(a.duration)content+=`\nDuration: ${a.duration}`;
      content+='\n\n'+a.patientHistory;
      if(a.syms.length)content+=`\n\nAssociated Symptoms: ${a.syms.join(', ')}`;
    }else if(/exam|objective|physical|inspection|palpation/i.test(lower)){
      content=`Vitals: ${a.vitals.length?a.vitals.join(', '):'[Not recorded in transcript]'}`;
      content+='\n\n'+a.examFindings;
    }else if(/assessment|impression|diagnosis|differential/i.test(lower)){
      content=a.syms.length?`Presenting symptoms include ${a.syms.join(', ')}.`:'Clinical presentation as documented above.';
      content+='\n\nClinical assessment to be completed by provider.';
    }else if(/plan|disposition|follow/i.test(lower)){
      if(a.meds.length)content+='Medications Discussed:\n'+a.meds.map(m=>`  - ${m.charAt(0).toUpperCase()+m.slice(1)}`).join('\n')+'\n\n';
      content+='Follow-up as discussed during encounter.';
    }else if(/vital|triage/i.test(lower)){
      content=a.vitals.length?a.vitals.join(', '):'[Vitals not recorded in transcript]';
    }else if(/medication/i.test(lower)){
      content=a.meds.length?a.meds.map(m=>`- ${m.charAt(0).toUpperCase()+m.slice(1)}`).join('\n'):'No medications mentioned in transcript.';
    }else if(/dental chart|chart findings/i.test(lower)){
      content=formatDentalChartForPrompt()||'No dental chart findings recorded.';
    }else if(/demographic|overview/i.test(lower)){
      content=`Visit Date: ${fmtDate(App.sessionStartTime||new Date())}\nDuration: ${a.dur}\nSpeakers: ${App.speakers.map(s=>`${s.name} (${ROLES[s.role]?.label})`).join(', ')}`;
    }else{
      content='[To be completed by provider]';
    }
    return{key:`section-${i}`,title:name,content};
  });
  return{title:tmpl.noteTitle||'Clinical Note',sections};
}

/* ── Medical Coding ── */

export async function generateCoding(){
  if(!App.noteSections?.sections)return;
  const noteText=App.noteSections.sections.map(s=>{
    const live=document.getElementById(`section-${s.key}`);
    return`=== ${s.title} ===\n${live?live.innerText:s.content}`;
  }).join('\n\n');
  const dental=isDentalTemplate(App.noteFormat);
  const radiology=App.noteFormat==='radiology_diagnostic'||App.noteFormat==='radiology_interventional';
  const prompt=dental
    ?DENTAL_CODING_PROMPT.replace('{{NOTE_TEXT}}',noteText).replace('{{DENTAL_CHART}}',formatDentalChartForPrompt()||'(No chart findings)')
    :radiology
    ?RADIOLOGY_CODING_PROMPT.replace('{{NOTE_TEXT}}',noteText)
    :CODING_PROMPT.replace('{{NOTE_TEXT}}',noteText);
  showCodingLoading(dental);
  try{
    let responseText;
    if(App.aiEngine==='cloud'&&App.claudeKey){
      responseText=await streamClaudeResponse(prompt,null,0.1,2048);
    }else if(App.aiEngine==='ollama'&&App.ollamaConnected){
      responseText=await streamOllamaResponse(prompt,null,0.1,4096);
    }else{
      App.codingResults=dental?generateRuleBasedDentalCoding(noteText):generateRuleBasedCoding(noteText);
      renderCodingPanel(App.codingResults,dental);
      return;
    }
    const parsed=dental?parseDentalCodingResponse(responseText):parseCodingResponse(responseText);
    App.codingResults=parsed;
    renderCodingPanel(parsed,dental);
  }catch(e){
    console.error('[ClinicalFlow] Coding generation error:',e);
    hideCodingPanel();
  }
}

function parseCodingResponse(text){
  const jsonMatch=text.match(/\{[\s\S]*\}/);
  if(!jsonMatch)return{icd10:[],cpt:[],emLevel:null};
  try{
    const data=JSON.parse(jsonMatch[0]);
    const normalize=arr=>(arr||[]).map(item=>({
      code:String(item.code||''),
      description:String(item.description||''),
      confidence:['high','medium','low'].includes(item.confidence)?item.confidence:'medium'
    }));
    return{
      icd10:normalize(data.icd10),
      cpt:normalize(data.cpt),
      emLevel:data.emLevel?{
        level:String(data.emLevel.level||''),
        mdm:String(data.emLevel.mdm||''),
        confidence:['high','medium','low'].includes(data.emLevel.confidence)?data.emLevel.confidence:'medium'
      }:null
    };
  }catch(e){return{icd10:[],cpt:[],emLevel:null};}
}

function parseDentalCodingResponse(text){
  const jsonMatch=text.match(/\{[\s\S]*\}/);
  if(!jsonMatch)return{cdt:[],icd10:[],emLevel:null,warnings:[],audit_flags:[]};
  try{
    const data=JSON.parse(jsonMatch[0]);
    const normalize=arr=>(arr||[]).map(item=>({
      code:String(item.code||''),
      description:String(item.description||''),
      tooth:item.tooth?String(item.tooth):'',
      confidence:['high','medium','low'].includes(item.confidence)?item.confidence:'medium'
    }));
    const warnings=(data.warnings||[]).filter(w=>typeof w==='string').slice(0,10);
    const audit_flags=(data.audit_flags||[]).filter(w=>typeof w==='string').slice(0,15);
    return{
      cdt:normalize(data.cdt),
      icd10:normalize(data.icd10).map(c=>({...c,tooth:c.tooth||''})),
      emLevel:null,
      warnings,
      audit_flags
    };
  }catch(e){return{cdt:[],icd10:[],emLevel:null,warnings:[],audit_flags:[]};}
}

function generateRuleBasedCoding(noteText){
  const lower=noteText.toLowerCase();
  const icd10=[];
  const codeMap=[
    ['hypertension','I10','Essential hypertension'],['diabetes','E11.9','Type 2 diabetes mellitus without complications'],
    ['hyperlipidemia','E78.5','Hyperlipidemia, unspecified'],['obesity','E66.9','Obesity, unspecified'],
    ['depression','F32.9','Major depressive disorder, single episode, unspecified'],['anxiety','F41.9','Anxiety disorder, unspecified'],
    ['asthma','J45.909','Unspecified asthma, uncomplicated'],['copd','J44.1','Chronic obstructive pulmonary disease with acute exacerbation'],
    ['chest pain','R07.9','Chest pain, unspecified'],['headache','R51.9','Headache, unspecified'],
    ['back pain','M54.5','Low back pain'],['knee pain','M25.569','Pain in unspecified knee'],
    ['upper respiratory','J06.9','Acute upper respiratory infection, unspecified'],['urinary tract infection','N39.0','Urinary tract infection, site not specified']
  ];
  for(const[kw,code,desc]of codeMap){
    if(lower.includes(kw))icd10.push({code,description:desc,confidence:'low'});
  }
  const sectionCount=App.noteSections?.sections?.length||0;
  const level=sectionCount>=5?'4':sectionCount>=3?'3':'2';
  return{
    icd10:icd10.slice(0,8),
    cpt:[{code:`9921${level}`,description:`Office visit, established patient, level ${level}`,confidence:'low'}],
    emLevel:{level,mdm:level==='4'?'Moderate':level==='3'?'Low':'Straightforward',confidence:'low'}
  };
}

/* ── Anterior teeth: 6-11, 22-27 (for CDT composite code selection) ── */
const _CDT_ANTERIOR=new Set([6,7,8,9,10,11,22,23,24,25,26,27]);

function generateRuleBasedDentalCoding(noteText){
  const teeth=App.dentalChart?.teeth||{};
  const cdt=[];
  const icd10=[];
  const lower=noteText.toLowerCase();

  for(const[id,data]of Object.entries(teeth)){
    const s=data.state;
    const surf=data.surfaces?.length||0;
    const n=parseInt(id);
    const ant=_CDT_ANTERIOR.has(n);
    if(s==='decay'){
      if(ant){
        const cc=surf<=1?'D2330':surf===2?'D2331':'D2332';
        const cd=surf<=1?'Resin composite — 1 surface, anterior':surf===2?'Resin composite — 2 surfaces, anterior':'Resin composite — 3+ surfaces, anterior';
        cdt.push({code:cc,description:cd,tooth:id,confidence:'low'});
      }else{
        const cc=surf<=1?'D2391':surf===2?'D2392':surf>=4?'D2394':'D2393';
        const cd=surf<=1?'Resin composite — 1 surface, posterior':surf===2?'Resin composite — 2 surfaces, posterior':surf>=4?'Resin composite — 4+ surfaces, posterior':'Resin composite — 3 surfaces, posterior';
        cdt.push({code:cc,description:cd,tooth:id,confidence:'low'});
      }
      icd10.push({code:'K02.53',description:'Dental caries on pit and fissure surface penetrating into dentin',tooth:id,confidence:'low'});
    }else if(s==='missing'){
      icd10.push({code:'K08.119',description:'Complete loss of teeth due to other cause, unspecified class',tooth:id,confidence:'low'});
    }else if(s==='rct'){
      const cc=ant?'D3310':n>=4&&n<=5||n>=12&&n<=13||n>=20&&n<=21||n>=28&&n<=29?'D3320':'D3330';
      const cd=ant?'Endodontic therapy — anterior':cc==='D3320'?'Endodontic therapy — premolar':'Endodontic therapy — molar';
      cdt.push({code:cc,description:cd,tooth:id,confidence:'low'});
      icd10.push({code:'K04.0',description:'Pulpitis',tooth:id,confidence:'low'});
    }else if(s==='fracture'){
      cdt.push({code:'D2740',description:'Crown — porcelain/ceramic',tooth:id,confidence:'low'});
      icd10.push({code:'K03.81',description:'Cracked tooth',tooth:id,confidence:'low'});
    }else if(s==='impacted'){
      cdt.push({code:'D7240',description:'Removal of impacted tooth — completely bony',tooth:id,confidence:'low'});
      icd10.push({code:'K01.1',description:'Impacted teeth',tooth:id,confidence:'low'});
    }else if(s==='implant'){
      cdt.push({code:'D6010',description:'Surgical placement of implant body — endosteal',tooth:id,confidence:'low'});
    }else if(s==='restored'){
      /* Existing restoration — document only, no new procedure code */
    }
  }

  /* Keyword scans for conditions not captured by chart */
  if(lower.includes('periodont')||lower.includes('bone loss')||lower.includes('pocket')){
    icd10.push({code:'K05.319',description:'Chronic periodontitis, unspecified severity, generalized',tooth:'',confidence:'low'});
  }
  if(lower.includes('gingivitis')){
    icd10.push({code:'K05.10',description:'Chronic gingivitis, plaque induced',tooth:'',confidence:'low'});
  }
  if(lower.includes('abscess')){
    icd10.push({code:'K04.7',description:'Periapical abscess without sinus',tooth:'',confidence:'low'});
  }

  return{cdt:cdt.slice(0,8),icd10:icd10.slice(0,8),emLevel:null};
}

function showCodingLoading(dental=false){
  const p=document.getElementById('codingPanel');
  if(p){p.style.display='block';p.innerHTML=`<div class="coding-loading"><div class="generating-spinner" style="width:16px;height:16px;border-width:2px;"></div> Analyzing ${dental?'dental':'medical'} codes...</div>`;}
}

function hideCodingPanel(){
  const p=document.getElementById('codingPanel');
  if(p)p.style.display='none';
}

function renderCodingPanel(results,dental=false){
  const p=document.getElementById('codingPanel');
  if(!p)return;
  const procCodes=dental?(results.cdt||[]):(results.cpt||[]);
  if(!results||(!results.icd10.length&&!procCodes.length&&!results.emLevel)){
    p.style.display='none';return;
  }
  p.style.display='block';
  const confBadge=c=>`<span class="coding-confidence coding-confidence-${c}">${c}</span>`;
  const toothTag=t=>t?`<span class="coding-tooth">#${esc(t)}</span>`:'';
  let html=`<div class="coding-panel-header"><span class="coding-panel-title">Suggested ${dental?'Dental':'Medical'} Codes</span><div class="coding-panel-actions"><button class="icon-btn" id="copyCodingBtn" title="Copy codes"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div></div>`;
  html+='<div class="coding-panel-body">';
  html+=`<div class="coding-disclaimer">AI-suggested ${dental?'dental':'medical'} codes for reference only. Always verify before submission.</div>`;
  if(results.icd10.length){
    html+='<div class="coding-section"><div class="coding-section-title">ICD-10 Diagnosis Codes</div>';
    for(const c of results.icd10){html+=`<div class="coding-item">${toothTag(c.tooth)}<span class="coding-code">${esc(c.code)}</span><span class="coding-desc">${esc(c.description)}</span>${confBadge(c.confidence)}</div>`;}
    html+='</div>';
  }
  if(procCodes.length){
    html+=`<div class="coding-section"><div class="coding-section-title">${dental?'CDT Procedure Codes':'CPT Codes'}</div>`;
    for(const c of procCodes){html+=`<div class="coding-item">${toothTag(c.tooth)}<span class="coding-code">${esc(c.code)}</span><span class="coding-desc">${esc(c.description)}</span>${confBadge(c.confidence)}</div>`;}
    html+='</div>';
  }
  if(!dental&&results.emLevel){
    html+=`<div class="coding-section"><div class="coding-section-title">E&M Level</div><div class="coding-em-level"><span class="coding-em-badge">Level ${esc(results.emLevel.level)}</span><span class="coding-desc">MDM: ${esc(results.emLevel.mdm)}</span>${confBadge(results.emLevel.confidence)}</div></div>`;
  }
  if(results.warnings&&results.warnings.length>0){
    html+=`<div class="coding-dropdown coding-dropdown-warn"><button class="coding-dropdown-toggle" data-dropdown="warnings"><svg class="coding-dropdown-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg><span class="coding-dropdown-label">Warnings</span><span class="coding-dropdown-count">${results.warnings.length}</span></button><div class="coding-dropdown-body" style="display:none;">`;
    for(const w of results.warnings){html+=`<div class="coding-warning-item">${esc(w)}</div>`;}
    html+='</div></div>';
  }
  if(results.audit_flags&&results.audit_flags.length>0){
    html+=`<div class="coding-dropdown coding-dropdown-audit"><button class="coding-dropdown-toggle" data-dropdown="audit"><svg class="coding-dropdown-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg><span class="coding-dropdown-label">Audit Flags</span><span class="coding-dropdown-count">${results.audit_flags.length}</span></button><div class="coding-dropdown-body" style="display:none;">`;
    for(const f of results.audit_flags){html+=`<div class="coding-audit-item">${esc(f)}</div>`;}
    html+='</div></div>';
  }
  html+='</div>';
  p.innerHTML=html;
  document.getElementById('copyCodingBtn')?.addEventListener('click',copyCoding);
  p.querySelectorAll('.coding-dropdown-toggle').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const body=btn.nextElementSibling;
      const open=body.style.display!=='none';
      body.style.display=open?'none':'block';
      btn.classList.toggle('open',!open);
    });
  });
}

export async function copyCoding(){
  if(!App.codingResults)return;
  const r=App.codingResults;
  const dental=!!r.cdt;
  let text=(dental?'SUGGESTED DENTAL CODES':'SUGGESTED MEDICAL CODES')+'\n'+('─'.repeat(40))+'\n\n';
  if(r.icd10.length){
    text+='ICD-10 Diagnosis Codes:\n';
    for(const c of r.icd10){
      text+=c.tooth?`  #${c.tooth}  ${c.code}  ${c.description}  [${c.confidence}]\n`:`  ${c.code}  ${c.description}  [${c.confidence}]\n`;
    }
    text+='\n';
  }
  if(dental&&r.cdt?.length){
    text+='CDT Procedure Codes:\n';
    for(const c of r.cdt)text+=`  #${c.tooth}  ${c.code}  ${c.description}  [${c.confidence}]\n`;
    text+='\n';
  }
  if(!dental&&r.cpt?.length){
    text+='CPT Codes:\n';
    for(const c of r.cpt)text+=`  ${c.code}  ${c.description}  [${c.confidence}]\n`;
    text+='\n';
  }
  if(!dental&&r.emLevel){
    text+=`E&M Level: ${r.emLevel.level} (MDM: ${r.emLevel.mdm}) [${r.emLevel.confidence}]\n`;
  }
  if(r.warnings?.length){
    text+='\nWarnings:\n';
    for(const w of r.warnings)text+=`  ⚠ ${w}\n`;
  }
  if(r.audit_flags?.length){
    text+='\nAudit Flags:\n';
    for(const f of r.audit_flags)text+=`  ℹ ${f}\n`;
  }
  try{await navigator.clipboard.writeText(text);toast('Codes copied','success');}
  catch(e){const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('Codes copied','success');}
}

/* Dental extraction: AI primary → regex supplement → regex-only fallback */
async function _extractAndApplyDental(fullText){
  let aiFindings=null;
  try{
    aiFindings=await _aiExtractDentalFindings(fullText);
  }catch(e){/* swallow — fall through to regex */}

  const regexFindings=parseDentalFindingsFromNote(fullText);

  if(aiFindings){
    /* Merge: AI results take priority, regex fills in anything AI missed */
    const merged={...aiFindings};
    for(const[id,data]of Object.entries(regexFindings)){
      if(!merged[id]) merged[id]=data;
    }
    const added=applyParsedFindings(merged);
    const aiCount=Object.keys(aiFindings).length;
    const extraFromRegex=Object.keys(merged).length-aiCount;
    let src=`AI (${aiCount})`;
    if(extraFromRegex>0) src+=` + pattern matching (+${extraFromRegex})`;
    if(added>0) toast(`Dental chart updated — ${added} finding${added>1?'s':''} via ${src}`,'success',4000);
  }else{
    const added=applyParsedFindings(regexFindings);
    if(added>0) toast(`Dental chart updated — ${added} finding${added>1?'s':''} via pattern matching`,'success',4000);
  }
}

/* Note Rendering — line-level editing with move/add/delete/drag controls */

/** Read live text from a section body (line-text spans only, ignoring action buttons) */
function _readSectionText(key){
  const body=document.getElementById(`section-${key}`);
  if(!body)return null;
  return[...body.querySelectorAll('.note-line-text')].map(el=>el.textContent).join('\n');
}

/** Split section content into lines by newlines */
function _splitIntoLines(content){
  const results=[];
  for(const ln of content.split('\n')){
    results.push(ln);
  }
  return results;
}

function _syncSectionData(key){
  const body=document.getElementById(`section-${key}`);if(!body)return;
  const lines=[...body.querySelectorAll('.note-line-text')].map(el=>el.textContent);
  const s=App.noteSections.sections.find(x=>x.key===key);
  if(s)s.content=lines.join('\n');
}

/* ── Line Dictation (Deepgram streaming) ── */

/** Process raw dictation text: spoken punctuation → symbols, lowercase except after sentence-enders */
function _processDictText(raw){
  // Spoken punctuation map
  const punctMap={
    'period':'.','full stop':'.','dot':'.','comma':',','question mark':'?',
    'exclamation mark':'!','exclamation point':'!','colon':':','semicolon':';',
    'hyphen':'-','dash':'-','open parenthesis':'(','close parenthesis':')',
    'open bracket':'(','close bracket':')','slash':'/','backslash':'\\',
    'ampersand':'&','at sign':'@','hashtag':'#','percent':'%','plus sign':'+',
    'equals sign':'=','new line':'\n','newline':'\n',
  };
  let text=raw;
  // Replace spoken punctuation (case-insensitive, whole word boundaries)
  // Match with optional surrounding spaces so we can collapse them
  for(const[spoken,sym] of Object.entries(punctMap)){
    const escaped=spoken.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    text=text.replace(new RegExp('\\s*\\b'+escaped+'\\b\\s*','gi'),sym);
  }
  // Clean up any remaining space before punctuation (e.g. "word ." → "word.")
  text=text.replace(/\s+([.,;:!?\-)\]\/\\%])/g,'$1');
  // Ensure space after punctuation when followed by a letter (e.g. "word.next" → "word. next")
  text=text.replace(/([.,;:!?])(\w)/g,'$1 $2');
  // No space after opening parens/brackets
  text=text.replace(/([(\[])\s+/g,'$1');
  // Lowercase everything, then capitalize after sentence-ending punctuation
  text=text.toLowerCase();
  text=text.replace(/([.!?]\s+)(\w)/g,(_,p,c)=>p+c.toUpperCase());
  // Apply medical corrections dictionary
  text=applyLiveCorrections(text);
  return text;
}

/** Capitalize first character and after sentence-ending punctuation */
function _capitalizeSentenceStart(text){
  if(!text)return text;
  // Capitalize very first letter
  let result=text.replace(/^(\s*)(\w)/,(_, ws, c)=>ws+c.toUpperCase());
  // Capitalize after . ! ?
  result=result.replace(/([.!?]\s+)(\w)/g,(_,p,c)=>p+c.toUpperCase());
  return result;
}

let _dictPcmUnlisten=null;
let _dictSocket=null;
let _dictRecognition=null;
let _dictMicBtn=null;
let _dictKA=null;
let _dictClickHandler=null;
// Mutable insert-point state — updated when user clicks during active dictation
let _dictBefore='';
let _dictAfter='';
let _dictLastCursorPos=null; // saved before mic button steals focus

function _saveCursorPos(){
  const sel=window.getSelection();
  if(!sel.rangeCount)return;
  const r=sel.getRangeAt(0);
  const node=r.startContainer;
  const span=node.nodeType===3?node.parentElement:node;
  if(span&&span.classList&&span.classList.contains('note-line-text')){
    _dictLastCursorPos={span,startOffset:r.startOffset,endOffset:r.endOffset,startNode:r.startContainer,endNode:r.endContainer,collapsed:r.collapsed};
  }
}

function _getSelectionOffsets(txtSpan){
  const sel=window.getSelection();
  const full=txtSpan.textContent;
  if(!sel.rangeCount)return{start:full.length,end:full.length};
  const r=sel.getRangeAt(0);
  // Check that selection is within this span
  const sc=r.startContainer.nodeType===3?r.startContainer.parentElement:r.startContainer;
  if(sc!==txtSpan&&sc.parentElement!==txtSpan)return{start:full.length,end:full.length};
  const start=Math.min(r.startOffset,full.length);
  const end=r.collapsed?start:Math.min(r.endOffset,full.length);
  return{start,end};
}

function _splitAtSelection(txtSpan,start,end){
  const full=txtSpan.textContent;
  _dictBefore=full.slice(0,start);
  _dictAfter=full.slice(end); // skip selected text — it gets replaced
  App.dictationTarget=txtSpan;
}

function _onDictClick(e){
  if(!App.dictationActive)return;
  const txtSpan=e.target.closest('.note-line-text');
  if(!txtSpan)return;
  // Use microtask so selection is updated after click
  setTimeout(()=>{
    const{start,end}=_getSelectionOffsets(txtSpan);
    _splitAtSelection(txtSpan,start,end);
  },0);
}

async function _startDictation(txtSpan,micBtn){
  App.dictationTarget=txtSpan;
  App.dictationActive=true;
  _dictMicBtn=micBtn;
  micBtn.classList.add('nl-mic-active');

  // Determine initial insert position (supports highlighted selection replacement)
  const fullText=txtSpan.textContent;
  let startOff=fullText.length, endOff=fullText.length;
  if(_dictLastCursorPos&&_dictLastCursorPos.span===txtSpan){
    startOff=Math.min(_dictLastCursorPos.startOffset,fullText.length);
    endOff=_dictLastCursorPos.collapsed?startOff:Math.min(_dictLastCursorPos.endOffset,fullText.length);
  }
  _dictLastCursorPos=null;
  _dictBefore=fullText.slice(0,startOff);
  _dictAfter=fullText.slice(endOff); // skip selected text — replaced by dictation

  // Listen for clicks to reposition insert point during dictation
  const noteContent=document.querySelector('.note-content');
  if(noteContent){
    _dictClickHandler=_onDictClick;
    noteContent.addEventListener('click',_dictClickHandler,true);
  }

  if(tauriInvoke||window.__TAURI__){
    const key=App.dgKey;
    if(!key){toast('No Deepgram API key — set it in Settings for dictation','error');_stopDictation();return;}
    try{
      await tauriInvoke('start_recording',{mode:'stream',language:App.language});

      const p=new URLSearchParams({model:'nova-3-medical',language:App.language,smart_format:'false',punctuate:'false',interim_results:'true',utterance_end_ms:'1500',encoding:'linear16',sample_rate:'16000',channels:'1'});
      buildKeyterms(App.noteFormat).forEach(t=>p.append('keyterm',t));
      const url='wss://api.deepgram.com/v1/listen?'+p.toString();
      _dictSocket=new WebSocket(url,['token',key]);

      _dictSocket.onopen=()=>{
        toast('Dictating — click anywhere to reposition','success',2500);
        _dictKA=setInterval(()=>{if(_dictSocket&&_dictSocket.readyState===WebSocket.OPEN)_dictSocket.send(JSON.stringify({type:'KeepAlive'}));},8000);
      };

      _dictSocket.onmessage=ev=>{
        if(typeof ev.data!=='string')return;
        try{
          const data=JSON.parse(ev.data);
          if(data.type!=='Results')return;
          const alt=data.channel.alternatives[0];
          const txRaw=alt.transcript;
          if(!txRaw||!txRaw.trim()||!App.dictationTarget)return;
          const tx=_processDictText(txRaw);
          if(data.is_final){
            _dictBefore=_dictBefore+((_dictBefore&&!_dictBefore.endsWith(' '))?' ':'')+tx.trim();
            // Capitalize first char if at start of line or after sentence-ender
            _dictBefore=_capitalizeSentenceStart(_dictBefore);
            App.dictationTarget.textContent=_dictBefore+((_dictAfter&&!_dictBefore.endsWith(' '))?' ':'')+_dictAfter;
          }else{
            const preview=_capitalizeSentenceStart(_dictBefore+((_dictBefore&&!_dictBefore.endsWith(' '))?' ':'')+tx);
            App.dictationTarget.textContent=preview+((_dictAfter&&!tx.endsWith(' '))?' ':'')+_dictAfter;
          }
        }catch(err){console.error('[Dictation DG] parse:',err);}
      };

      _dictSocket.onerror=err=>{console.error('[Dictation DG] error:',err);toast('Dictation connection failed','error');_stopDictation();};
      _dictSocket.onclose=()=>{clearInterval(_dictKA);_dictKA=null;};

      _dictPcmUnlisten=await tauriListen('audio-pcm',ev=>{
        if(!_dictSocket||_dictSocket.readyState!==WebSocket.OPEN)return;
        const b64=ev.payload;
        const raw=atob(b64);
        const bytes=new Uint8Array(raw.length);
        for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
        _dictSocket.send(bytes.buffer);
      });
    }catch(e){
      console.error('[Dictation] start failed:',e);
      toast('Dictation failed: '+e,'error');
      _stopDictation();
    }
  }else{
    // Browser fallback: SpeechRecognition (not available in WKWebView)
    if(window.__TAURI__){toast('Dictation requires a Deepgram API key in Tauri mode. Add one in Settings.','warning',5000);_stopDictation();return;}
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){toast('Speech recognition not available in this browser','error');_stopDictation();return;}
    _dictRecognition=new SR();
    _dictRecognition.continuous=true;
    _dictRecognition.interimResults=true;
    _dictRecognition.lang=App.language;
    _dictRecognition.onresult=ev=>{
      let interim='',final='';
      for(let i=ev.resultIndex;i<ev.results.length;i++){
        if(ev.results[i].isFinal)final+=ev.results[i][0].transcript;
        else interim+=ev.results[i][0].transcript;
      }
      if(final){final=_processDictText(final);_dictBefore=_dictBefore+((_dictBefore&&!_dictBefore.endsWith(' '))?' ':'')+final;_dictBefore=_capitalizeSentenceStart(_dictBefore);App.dictationTarget.textContent=_dictBefore+(_dictAfter?' ':'')+_dictAfter;}
      else if(interim){interim=_processDictText(interim);const preview=_capitalizeSentenceStart(_dictBefore+(_dictBefore?' ':'')+interim);App.dictationTarget.textContent=preview+(_dictAfter?' ':'')+_dictAfter;}
    };
    _dictRecognition.onerror=e=>{console.warn('[Dictation]',e.error);if(e.error!=='no-speech')toast('Dictation error: '+e.error,'error');};
    _dictRecognition.onend=()=>{if(App.dictationActive)_stopDictation();};
    _dictRecognition.start();
    toast('Dictating — click anywhere to reposition','success',2500);
  }
}

function _stopDictation(){
  App.dictationActive=false;
  App.dictationTarget=null;
  _dictBefore='';_dictAfter='';
  if(_dictMicBtn){_dictMicBtn.classList.remove('nl-mic-active');_dictMicBtn=null;}
  // Remove click-to-reposition handler
  if(_dictClickHandler){
    const nc=document.querySelector('.note-content');
    if(nc)nc.removeEventListener('click',_dictClickHandler,true);
    _dictClickHandler=null;
  }
  // Close Deepgram socket
  if(_dictSocket){
    clearInterval(_dictKA);_dictKA=null;
    if(_dictSocket.readyState===WebSocket.OPEN){try{_dictSocket.send(JSON.stringify({type:'CloseStream'}));}catch(e){}}
    _dictSocket.close();_dictSocket=null;
  }
  if(_dictPcmUnlisten){_dictPcmUnlisten();_dictPcmUnlisten=null;}
  if(tauriInvoke)tauriInvoke('stop_recording').catch(()=>{});
  if(_dictRecognition){try{_dictRecognition.stop();}catch(e){}_dictRecognition=null;}
  // Sync all sections
  document.querySelectorAll('.note-section-body').forEach(b=>{
    const k=b.id.replace('section-','');
    _syncSectionData(k);
  });
  toast('Dictation stopped','info',1500);
}

/* ── Input Field Dictation (for <input> elements) ── */
let _inputDictSocket=null;
let _inputDictRecognition=null;
let _inputDictPcmUnlisten=null;
let _inputDictKA=null;
let _inputDictTarget=null;
let _inputDictMicBtn=null;
let _inputDictActive=false;

export function isInputDictating(){ return _inputDictActive; }

export async function startInputDictation(inputEl,micBtn){
  if(App.isRecording){toast('Stop recording before using dictation','warning');return;}
  if(_inputDictActive){stopInputDictation();return;}
  if(App.dictationActive){_stopDictation();}
  _inputDictTarget=inputEl;
  _inputDictMicBtn=micBtn;
  _inputDictActive=true;
  if(micBtn)micBtn.classList.add('cf-mic-active');

  if(tauriInvoke||window.__TAURI__){
    const key=App.dgKey;
    if(!key){toast('Set a Deepgram API key in Settings for dictation','error');stopInputDictation();return;}
    try{
      await tauriInvoke('start_recording',{mode:'stream',language:App.language});
      const p=new URLSearchParams({model:'nova-3-medical',language:App.language,smart_format:'false',punctuate:'false',interim_results:'true',utterance_end_ms:'1500',encoding:'linear16',sample_rate:'16000',channels:'1'});
      const url='wss://api.deepgram.com/v1/listen?'+p.toString();
      _inputDictSocket=new WebSocket(url,['token',key]);
      let committed='';
      _inputDictSocket.onopen=()=>{
        committed=inputEl.value;
        toast('Dictating...','success',2000);
        _inputDictKA=setInterval(()=>{if(_inputDictSocket&&_inputDictSocket.readyState===WebSocket.OPEN)_inputDictSocket.send(JSON.stringify({type:'KeepAlive'}));},8000);
      };
      _inputDictSocket.onmessage=ev=>{
        if(typeof ev.data!=='string')return;
        try{
          const data=JSON.parse(ev.data);
          if(data.type!=='Results')return;
          const txRaw=data.channel.alternatives[0].transcript;
          if(!txRaw||!txRaw.trim()||!_inputDictTarget)return;
          const tx=_processDictText(txRaw);
          if(data.is_final){
            committed=committed+(committed?' ':'')+tx.trim();
            committed=_capitalizeSentenceStart(committed);
            _inputDictTarget.value=committed;
          }else{
            _inputDictTarget.value=_capitalizeSentenceStart(committed+(committed?' ':'')+tx);
          }
          _inputDictTarget.dispatchEvent(new Event('input',{bubbles:true}));
        }catch(err){console.error('[InputDict] parse:',err);}
      };
      _inputDictSocket.onerror=err=>{console.error('[InputDict] error:',err);toast('Dictation connection failed','error');stopInputDictation();};
      _inputDictSocket.onclose=()=>{clearInterval(_inputDictKA);_inputDictKA=null;};
      _inputDictPcmUnlisten=await tauriListen('audio-pcm',ev=>{
        if(!_inputDictSocket||_inputDictSocket.readyState!==WebSocket.OPEN)return;
        const b64=ev.payload;const raw=atob(b64);const bytes=new Uint8Array(raw.length);
        for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
        _inputDictSocket.send(bytes.buffer);
      });
    }catch(e){
      console.error('[InputDict] start failed:',e);
      toast('Dictation failed: '+e,'error');
      stopInputDictation();
    }
  }else{
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){toast('Speech recognition not available','error');stopInputDictation();return;}
    _inputDictRecognition=new SR();
    _inputDictRecognition.continuous=true;
    _inputDictRecognition.interimResults=true;
    _inputDictRecognition.lang=App.language;
    let committed=inputEl.value;
    _inputDictRecognition.onresult=ev=>{
      let interim='',final='';
      for(let i=ev.resultIndex;i<ev.results.length;i++){
        if(ev.results[i].isFinal)final+=ev.results[i][0].transcript;
        else interim+=ev.results[i][0].transcript;
      }
      if(final){
        final=_processDictText(final);
        committed=committed+(committed?' ':'')+final;
        committed=_capitalizeSentenceStart(committed);
        _inputDictTarget.value=committed;
      }else if(interim){
        interim=_processDictText(interim);
        _inputDictTarget.value=_capitalizeSentenceStart(committed+(committed?' ':'')+interim);
      }
      _inputDictTarget.dispatchEvent(new Event('input',{bubbles:true}));
    };
    _inputDictRecognition.onerror=e=>{if(e.error!=='no-speech')toast('Dictation error: '+e.error,'error');};
    _inputDictRecognition.onend=()=>{if(_inputDictActive)stopInputDictation();};
    _inputDictRecognition.start();
    toast('Dictating...','success',2000);
  }
}

export function stopInputDictation(){
  _inputDictActive=false;
  _inputDictTarget=null;
  if(_inputDictMicBtn){_inputDictMicBtn.classList.remove('cf-mic-active');_inputDictMicBtn=null;}
  if(_inputDictSocket){
    clearInterval(_inputDictKA);_inputDictKA=null;
    if(_inputDictSocket.readyState===WebSocket.OPEN){try{_inputDictSocket.send(JSON.stringify({type:'CloseStream'}));}catch(e){}}
    _inputDictSocket.close();_inputDictSocket=null;
  }
  if(_inputDictPcmUnlisten){_inputDictPcmUnlisten();_inputDictPcmUnlisten=null;}
  if(tauriInvoke)tauriInvoke('stop_recording').catch(()=>{});
  if(_inputDictRecognition){try{_inputDictRecognition.stop();}catch(e){}_inputDictRecognition=null;}
}

function _buildLineEl(text,body,key){
  const row=document.createElement('div');row.className='note-line';
  const txt=document.createElement('span');txt.className='note-line-text';txt.contentEditable='true';txt.spellcheck=true;
  if(App.settings.dictionaryFeatures&&App.settings.highlightTerms&&text){txt.innerHTML=hlTerms(esc(text));txt.dataset.plain=text;}else{txt.textContent=text;}
  const acts=document.createElement('span');acts.className='note-line-actions';

  const mkBtn=(cls,title,label)=>{const b=document.createElement('button');b.className='nl-btn '+cls;b.title=title;b.textContent=label;b.type='button';return b;};
  const upBtn=mkBtn('nl-up','Move up','\u2191');
  const downBtn=mkBtn('nl-down','Move down','\u2193');
  const addBtn=mkBtn('nl-add','Add line below','+');
  const delBtn=document.createElement('button');delBtn.className='nl-btn nl-del';delBtn.title='Delete line';delBtn.type='button';
  delBtn.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
  const drag=document.createElement('span');drag.className='nl-drag';drag.title='Drag to reorder';drag.textContent='\u2261';

  // Dictation mic button (only shown when setting enabled)
  const micBtn=document.createElement('button');micBtn.className='nl-btn nl-mic';micBtn.title='Dictate into this line';micBtn.type='button';
  micBtn.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
  if(!App.settings.noteLineActions)micBtn.style.display='none';
  // Save cursor position before mic click steals focus (only for initial start)
  micBtn.addEventListener('mousedown',e=>{if(!App.dictationActive)_saveCursorPos();});
  micBtn.addEventListener('click',e=>{
    e.stopPropagation();
    if(App.isRecording){toast('Stop recording before using dictation','warning');return;}
    if(App.dictationActive&&App.dictationTarget===txt){
      _stopDictation();
    }else{
      if(App.dictationActive)_stopDictation();
      _startDictation(txt,micBtn);
    }
  });

  // Direct click handlers (no delegation — works reliably in WKWebView)
  upBtn.addEventListener('click',e=>{e.stopPropagation();const prev=row.previousElementSibling;if(prev)body.insertBefore(row,prev);_syncSectionData(key);});
  downBtn.addEventListener('click',e=>{e.stopPropagation();const next=row.nextElementSibling;if(next)body.insertBefore(next,row);_syncSectionData(key);});
  addBtn.addEventListener('click',e=>{e.stopPropagation();const nl=_buildLineEl('',body,key);row.after(nl);nl.querySelector('.note-line-text').focus();_syncSectionData(key);});
  delBtn.addEventListener('click',e=>{
    e.stopPropagation();
    if(body.querySelectorAll('.note-line').length<=1){toast('Cannot delete the last line','warning');return;}
    // Phase 1: flash red + slight scale up (60ms)
    row.style.pointerEvents='none';
    row.style.overflow='hidden';
    const h=row.offsetHeight;
    row.style.maxHeight=h+'px';
    row.style.transition='transform 0.06s ease-out, background 0.06s ease-out, box-shadow 0.06s ease-out';
    row.style.transform='scale(1.015)';
    row.style.background='rgba(239, 68, 68, 0.18)';
    row.style.boxShadow='0 0 0 1.5px rgba(239, 68, 68, 0.4), 0 0 12px rgba(239, 68, 68, 0.15)';
    // Phase 2: slide out + fade (after flash)
    setTimeout(()=>{
      row.style.transition='transform 0.3s cubic-bezier(0.4, 0, 1, 1), opacity 0.25s ease-out';
      row.style.transform='translateX(40px) scale(0.92)';
      row.style.opacity='0';
    },80);
    // Phase 3: collapse height smoothly
    setTimeout(()=>{
      row.style.transition='max-height 0.2s ease-in-out, margin 0.2s ease-in-out, padding 0.2s ease-in-out';
      row.style.maxHeight='0';
      row.style.margin='0';
      row.style.paddingTop='0';
      row.style.paddingBottom='0';
    },280);
    // Phase 4: remove from DOM
    setTimeout(()=>{row.remove();_syncSectionData(key);},500);
  });

  // Pointer-based drag — ghost follows cursor, placeholder marks drop position
  drag.addEventListener('pointerdown',e=>{
    e.preventDefault();e.stopPropagation();
    const origBody=body;
    const origKey=key;
    const rect=row.getBoundingClientRect();
    const offsetY=e.clientY-rect.top;

    // Create ghost that follows cursor
    const ghost=row.cloneNode(true);
    ghost.classList.add('nl-ghost');
    ghost.style.cssText=`position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;z-index:10000;pointer-events:none;opacity:0.85;`;
    document.body.appendChild(ghost);

    // Create placeholder where the row was
    const placeholder=document.createElement('div');
    placeholder.className='nl-placeholder';
    row.parentElement.insertBefore(placeholder,row);
    row.style.display='none';

    let _raf=0;
    const onMove=ev=>{
      ev.preventDefault();
      cancelAnimationFrame(_raf);
      _raf=requestAnimationFrame(()=>{
        ghost.style.top=(ev.clientY-offsetY)+'px';
        // Find drop target
        const elBelow=document.elementFromPoint(ev.clientX,ev.clientY);
        if(!elBelow)return;
        const targetLine=elBelow.closest('.note-line');
        const targetBody=elBelow.closest('.note-section-body');
        if(targetLine&&targetLine!==row){
          const tBody=targetLine.parentElement;
          const r=targetLine.getBoundingClientRect();
          if(ev.clientY<r.top+r.height/2)tBody.insertBefore(placeholder,targetLine);
          else tBody.insertBefore(placeholder,targetLine.nextSibling);
        }else if(targetBody){
          const lines=[...targetBody.querySelectorAll('.note-line')];
          if(lines.length===0)targetBody.appendChild(placeholder);
          else{
            // Find closest line
            let closest=null,minDist=Infinity;
            for(const ln of lines){
              const lr=ln.getBoundingClientRect();
              const d=Math.abs(ev.clientY-(lr.top+lr.height/2));
              if(d<minDist){minDist=d;closest=ln;}
            }
            if(closest){
              const cr=closest.getBoundingClientRect();
              if(ev.clientY<cr.top+cr.height/2)targetBody.insertBefore(placeholder,closest);
              else targetBody.insertBefore(placeholder,closest.nextSibling);
            }
          }
        }
      });
    };
    const onUp=()=>{
      cancelAnimationFrame(_raf);
      ghost.remove();
      row.style.display='';
      placeholder.parentElement.insertBefore(row,placeholder);
      placeholder.remove();
      document.removeEventListener('pointermove',onMove);
      document.removeEventListener('pointerup',onUp);
      // Sync source and destination sections
      _syncSectionData(origKey);
      const newBody=row.closest('.note-section-body');
      if(newBody&&newBody!==origBody){
        const newKey=newBody.id.replace('section-','');
        _syncSectionData(newKey);
      }
    };
    document.addEventListener('pointermove',onMove);
    document.addEventListener('pointerup',onUp);
  });

  acts.appendChild(micBtn);acts.appendChild(upBtn);acts.appendChild(downBtn);acts.appendChild(addBtn);acts.appendChild(delBtn);acts.appendChild(drag);
  if(!App.settings.noteLineActions)acts.style.display='none';
  row.appendChild(txt);row.appendChild(acts);

  // Sync on text edit
  txt.addEventListener('input',()=>_syncSectionData(key));
  // Strip highlighting on focus (clean editing), restore on blur
  if(App.settings.dictionaryFeatures&&App.settings.highlightTerms){
    txt.addEventListener('focus',()=>{txt.textContent=txt.innerText;});
    txt.addEventListener('blur',()=>{const t=txt.innerText;if(t.trim())txt.innerHTML=hlTerms(esc(t));});
  }

  return row;
}

export function renderNoteSec(nd){
  D.noteSec.innerHTML='';
  nd.sections.forEach(s=>{
    const el=document.createElement('div');el.className='note-section';el.dataset.section=s.key;
    const hdr=document.createElement('div');hdr.className='note-section-header';
    const editBtn=document.createElement('button');editBtn.className='note-section-edit-btn';editBtn.textContent='Edit';editBtn.dataset.section=s.key;
    hdr.innerHTML=`<span class="note-section-title">${esc(s.title)}</span>`;
    hdr.appendChild(editBtn);
    const body=document.createElement('div');body.className='note-section-body';body.id=`section-${s.key}`;
    const lines=_splitIntoLines(s.content).filter(ln=>ln.trim());
    if(lines.length===0)lines.push('');
    lines.forEach(ln=>{body.appendChild(_buildLineEl(ln,body,s.key));});
    // Toggle between line-level and full-text editing
    editBtn.addEventListener('click',()=>{
      const isEditing=body.classList.contains('nl-full-edit');
      if(isEditing){
        // Save full text → rebuild lines
        const text=body.innerText;
        const sec=App.noteSections.sections.find(x=>x.key===s.key);
        if(sec)sec.content=text;
        body.classList.remove('nl-full-edit');
        body.contentEditable='false';
        body.innerHTML='';
        const newLines=_splitIntoLines(text).filter(ln=>ln.trim());
        if(newLines.length===0)newLines.push('');
        newLines.forEach(ln=>{body.appendChild(_buildLineEl(ln,body,s.key));});
        editBtn.textContent='Edit';
        toast('Section saved','success');
      }else{
        // Switch to full-text editing
        _syncSectionData(s.key);
        const sec=App.noteSections.sections.find(x=>x.key===s.key);
        const text=sec?sec.content:_readSectionText(s.key)||'';
        body.innerHTML=esc(text).replace(/\n/g,'<br>');
        body.classList.add('nl-full-edit');
        body.contentEditable='true';
        body.focus();
        editBtn.textContent='Done';
        // Place cursor at end
        const range=document.createRange();range.selectNodeContents(body);range.collapse(false);
        const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
      }
    });
    el.appendChild(hdr);el.appendChild(body);D.noteSec.appendChild(el);
  });
  /* Add tooth number tooltips */
  if(App.settings.dictionaryFeatures) addToothTooltips(D.noteSec);
  /* Auto-populate dental chart from AI-generated findings (AI first → regex fallback) */
  if(isDentalTemplate(App.noteFormat)){
    const fullText=nd.sections.map(s=>s.content).join('\n');
    _extractAndApplyDental(fullText);
    /* Documentation completeness scoring */
    if(App.settings.showDocScore){
      import('./dental-extras.js').then(({scoreDocumentation,renderDocScore})=>{
        const result=scoreDocumentation(App.noteSections,App.noteFormat,App.dentalChart);
        renderDocScore(result);
      }).catch(()=>{});
    }else{
      const dp=document.getElementById('docScorePanel');
      if(dp)dp.style.display='none';
    }
  }
  // Signal that note was rendered so session can be saved
  window.dispatchEvent(new CustomEvent('clinicalflow:note-rendered'));
}

/* PDF Export */
export async function exportPDF(){
  if(!App.noteGenerated){toast('Generate a note first.','warning');return;}
  const nd=App.noteSections;const date=fmtDate(App.sessionStartTime||new Date());
  const dur=fmt(App.elapsed);const speakers=App.speakers.map(s=>`${s.name} (${ROLES[s.role]?.label})`).join(', ');
  let sectionsHtml='';
  nd.sections.forEach(s=>{
    const content=_readSectionText(s.key)??s.content;
    sectionsHtml+=`<div style="margin-bottom:20px;"><h3 style="font-size:14px;font-weight:700;color:#0891B2;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px 0;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">${esc(s.title)}</h3><div style="font-size:13px;line-height:1.7;color:#334155;white-space:pre-wrap;">${esc(content)}</div></div>`;
  });
  /* Dental chart + findings for dental templates */
  if(isDentalTemplate(App.noteFormat)){
    const hasFindings=Object.keys(App.dentalChart?.teeth||{}).length>0;
    if(hasFindings){
      if(App.settings.dentalChartInExport) sectionsHtml+=buildDentalChartExportSVG();
      if(App.settings.dentalFindingsInExport) sectionsHtml+=buildDentalFindingsExportHTML();
    }
  }
  const noteHtml=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>ClinicalFlow Note - ${date}</title>
<style>@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'DM Sans',system-ui,sans-serif;padding:0.75in 1in;color:#1a1a1a;max-width:8.5in;}.header{border-bottom:2px solid #0891B2;padding-bottom:12px;margin-bottom:24px;}.title{font-size:22px;font-weight:700;color:#0B0F14;}.subtitle{font-size:11px;color:#0891B2;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;}.meta{font-size:12px;color:#64748B;margin-top:6px;line-height:1.6;}.disclaimer{font-size:10px;color:#94A3B8;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:4px;padding:8px 12px;margin-bottom:16px;line-height:1.5;}.footer{margin-top:32px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10px;color:#94A3B8;display:flex;justify-content:space-between;}@media print{body{padding:0;max-width:none;}@page{margin:0.6in 0.75in;size:letter;}}</style></head><body>
<div class="header"><div class="subtitle">ClinicalFlow — Clinical Documentation</div><div class="title">${esc(nd.title||'Clinical Note')}</div><div class="meta">Date: ${esc(date)}<br>Duration: ${esc(dur)} | Speakers: ${esc(speakers)}</div></div>
<div class="disclaimer">⚠ This note was auto-generated from a transcribed clinical encounter. It should be reviewed, verified, and amended by the treating provider before inclusion in the medical record.</div>
${sectionsHtml}
<div class="footer"><span>Generated by ClinicalFlow — For review by treating provider</span><span>${fmtDT(new Date())}</span></div>
</body></html>`;
  if(window.__TAURI__){
    try{await tauriInvoke('generate_pdf',{html:noteHtml});toast('PDF exported','success',4000);}
    catch(e){console.error('PDF export failed:',e);toast('PDF export failed: '+e,'error',6000);}
  }else{
    const html=noteHtml.replace('</body>','<script>window.onafterprint=()=>window.close();window.print();<\/script></body>');
    const printWin=window.open('','_blank','width=850,height=1100');
    if(!printWin){toast('Pop-up blocked — use Copy instead.','error',6000);return;}
    printWin.document.write(html);printWin.document.close();toast('Print dialog opened — choose "Save as PDF"','success',5000);
  }
}

export async function copyNote(){
  if(!App.noteSections?.sections)return;
  let text=App.noteSections.sections.map(s=>`=== ${s.title.toUpperCase()} ===\n${_readSectionText(s.key)??s.content}`).join('\n\n');
  if(isDentalTemplate(App.noteFormat)&&App.settings.dentalFindingsInExport){
    const chartText=formatDentalChartForPrompt();
    if(chartText) text+='\n\n'+chartText;
  }
  const hdr=`${App.noteSections.title}\nDate: ${fmtDate(App.sessionStartTime||new Date())}\nGenerated by ClinicalFlow\n${'─'.repeat(40)}\n\n`;
  try{await navigator.clipboard.writeText(hdr+text);toast('Note copied','success');}
  catch(e){const ta=document.createElement('textarea');ta.value=hdr+text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('Note copied','success');}
}

export async function copyForEHR(){
  if(!App.noteSections?.sections)return;
  const sections=App.noteSections.sections.map(s=>{
    return{key:s.key,title:s.title,content:_readSectionText(s.key)??s.content};
  });
  if(isDentalTemplate(App.noteFormat)&&App.settings.dentalFindingsInExport){
    const chartText=formatDentalChartForPrompt();
    if(chartText)sections.push({key:'dental_findings',title:'Dental Findings',content:chartText});
  }
  const payload={_clinicalflow:true,version:1,title:App.noteSections.title||'Clinical Note',date:fmtDate(App.sessionStartTime||new Date()),format:App.noteFormat,sections};
  const plainText=sections.map(s=>s.title.toUpperCase()+'\n'+s.content).join('\n\n');
  const htmlText='<div data-clinicalflow=\''+esc(JSON.stringify(payload))+'\'>'
    +sections.map(s=>'<p><strong>'+esc(s.title)+'</strong></p><p>'+esc(s.content).replace(/\n/g,'<br>')+'</p>').join('')+'</div>';
  try{
    await navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([plainText],{type:'text/plain'}),'text/html':new Blob([htmlText],{type:'text/html'})})]);
    toast('Copied for EHR — paste directly or use ClinicalFlow extension','success',4000);
  }catch(e){
    try{await navigator.clipboard.writeText(plainText);toast('Copied for EHR','success');}
    catch(e2){const ta=document.createElement('textarea');ta.value=plainText;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('Copied for EHR','success');}
  }
}

export async function downloadTextNote(){
  if(!App.noteSections?.sections)return;
  let text=App.noteSections.sections.map(s=>`=== ${s.title.toUpperCase()} ===\n${_readSectionText(s.key)??s.content}`).join('\n\n');
  if(isDentalTemplate(App.noteFormat)&&App.settings.dentalFindingsInExport){
    const chartText=formatDentalChartForPrompt();
    if(chartText) text+='\n\n'+chartText;
  }
  const hdr=`${App.noteSections.title}\nDate: ${fmtDate(App.sessionStartTime||new Date())}\nGenerated by ClinicalFlow\n${'─'.repeat(40)}\n\n`;
  const fullText=hdr+text;const defaultName=`ClinicalFlow_Note_${new Date().toISOString().split('T')[0]}.txt`;
  if(window.__TAURI__){
    try{
      const {save}=window.__TAURI__.dialog;
      const filePath=await save({defaultPath:defaultName,filters:[{name:'Text Files',extensions:['txt']}]});
      if(filePath){await tauriInvoke('save_text_file',{path:filePath,content:fullText});toast('Note saved','success');}
    }catch(e){toast(`Save failed: ${e}`,'error');}
  }else{
    const blob=new Blob([fullText],{type:'text/plain'});const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=defaultName;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);toast('Text file downloaded','success');
  }
}

/* ── HL7 v2 MDM^T02 Export ── */

export async function exportHL7(){
  if(!App.noteSections?.sections){toast('Generate a note first.','warning');return;}
  const now=new Date();const ts=_hl7Ts(now);const msgId='CF'+now.getTime();
  const facName=cfg.get('ms-ehr-facility-name','')||'ClinicalFlow';
  const facId=cfg.get('ms-ehr-facility-id','')||'';
  const mrn=cfg.get('ms-ehr-default-mrn','')||'';
  const noteText=App.noteSections.sections.map(s=>{
    const live=document.getElementById(`section-${s.key}`);
    return s.title.toUpperCase()+':\n'+(live?live.innerText:s.content);
  }).join('\n\n');
  const msg=[
    'MSH|^~\\&|ClinicalFlow||'+_hl7Esc(facName)+'|'+_hl7Esc(facId)+'|'+ts+'||MDM^T02^MDM_T02|'+msgId+'|P|2.5.1',
    'PID|||'+(mrn?_hl7Esc(mrn)+'^^^'+_hl7Esc(facName):'')+'||||||||||||||||||',
    'PV1||O|||||||||||||||||||||||||||||||||||||||||||||'+ts,
    'TXA||'+_hl7Esc(App.noteSections.title||'Clinical Note')+'|TX|'+ts+'|||'+ts+'||||'+msgId+'|||||AU',
    'OBX|1|TX|CLINICALNOTE^Clinical Note^CF||'+_hl7Esc(noteText)+'||||||F||'+ts
  ].join('\r');
  const defaultName='ClinicalFlow_HL7_'+now.toISOString().split('T')[0]+'.hl7';
  if(window.__TAURI__){
    try{
      const {save}=window.__TAURI__.dialog;
      const filePath=await save({defaultPath:defaultName,filters:[{name:'HL7 Messages',extensions:['hl7','txt']}]});
      if(filePath){await tauriInvoke('save_text_file',{path:filePath,content:msg});toast('HL7 message exported','success');}
    }catch(e){toast('HL7 export failed: '+e,'error');}
  }else{
    const blob=new Blob([msg],{type:'text/plain'});const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=defaultName;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);toast('HL7 message downloaded','success');
  }
}

function _hl7Ts(d){
  return d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0')
    +String(d.getHours()).padStart(2,'0')+String(d.getMinutes()).padStart(2,'0')+String(d.getSeconds()).padStart(2,'0');
}
function _hl7Esc(s){return typeof s==='string'?s.replace(/\\/g,'\\E\\').replace(/\|/g,'\\F\\').replace(/\^/g,'\\S\\').replace(/&/g,'\\T\\').replace(/\r?\n/g,'\\X0D\\'):'';}
