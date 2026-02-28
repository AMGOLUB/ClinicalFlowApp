/* ============================================================
   CLINICALFLOW — Note Generation, Parsing, Rendering, Export
   ============================================================ */
import { App, cfg, tauriInvoke, __TAURI_READY__, getAbortCtrl, setAbortCtrl, GENERATION_TIMEOUT_MS, CORRECTIONS_DICT } from './state.js';
import { D, toast, updConn, updStatus, esc, fmt, fmtDate, fmtDT, wc, wait } from './ui.js';
import { applyLiveCorrections, MED_RX, MED_TERMS } from './transcript.js';
import { ROLES } from './speakers.js';
import { estimateTokens as _estimateTokens, formatNoteMarkdown as _formatNoteMarkdown,
         extractCorrectedNote, postProcessNote as _postProcessNote,
         parseOllamaResponse as _parseOllamaResponse } from './pure.js';
import { getTemplateRegistry, CODING_PROMPT, DENTAL_CODING_PROMPT } from './templates.js';
import { formatDentalChartForPrompt, isDentalTemplate, parseDentalFindingsFromNote, applyParsedFindings, buildDentalChartExportSVG, buildDentalFindingsExportHTML } from './dental-chart.js';
import { getLanguageLabel, isEnglish } from './languages.js';

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
    body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:maxTokens||2048,temperature:temperature||0.3,stream:true,messages:[{role:'user',content:prompt}]})
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
export async function generateNote(){
  if(App.entries.length===0){toast('No transcript to generate from.','warning');return;}
  if(App.isRecording){toast('Stop recording first.','warning');return;}
  if(App.aiEngine==='cloud'&&App.claudeKey){await generateCloudNote();}
  else if(App.aiEngine==='ollama'&&App.ollamaConnected){await generateOllamaNote();}
  else{
    if(App.aiEngine==='cloud'&&!App.claudeKey){toast('No API key. Add your Anthropic key in Settings, or switch to Ollama.','warning',5000);}
    else if(App.aiEngine==='ollama'&&!App.ollamaConnected){toast('Ollama not connected. Using rule-based fallback.','warning',4000);}
    await generateRuleBasedNote();
  }
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
  const prompt=dental
    ?DENTAL_CODING_PROMPT.replace('{{NOTE_TEXT}}',noteText).replace('{{DENTAL_CHART}}',formatDentalChartForPrompt()||'(No chart findings)')
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
  catch(e){toast('Copy failed','error');}
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

/* Note Rendering */
export function renderNoteSec(nd){
  D.noteSec.innerHTML='';
  nd.sections.forEach(s=>{
    const el=document.createElement('div');el.className='note-section';el.dataset.section=s.key;
    el.innerHTML=`<div class="note-section-header"><span class="note-section-title">${esc(s.title)}</span><button class="note-section-edit-btn" data-section="${s.key}">Edit</button></div><div class="note-section-body" id="section-${s.key}">${esc(s.content).replace(/\n/g,'<br>')}</div>`;
    D.noteSec.appendChild(el);
  });
  D.noteSec.querySelectorAll('.note-section-edit-btn').forEach(btn=>{
    btn.addEventListener('click',e=>{
      const key=e.target.dataset.section;const body=document.getElementById(`section-${key}`);
      if(body.contentEditable==='true'){
        body.contentEditable='false';e.target.textContent='Edit';
        const s=App.noteSections.sections.find(x=>x.key===key);if(s)s.content=body.innerText;toast('Section saved','success');
      }else{
        body.contentEditable='true';body.focus();e.target.textContent='Save';
        const range=document.createRange();range.selectNodeContents(body);range.collapse(false);const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
      }
    });
  });
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
}

/* PDF Export */
export async function exportPDF(){
  if(!App.noteGenerated){toast('Generate a note first.','warning');return;}
  const nd=App.noteSections;const date=fmtDate(App.sessionStartTime||new Date());
  const dur=fmt(App.elapsed);const speakers=App.speakers.map(s=>`${s.name} (${ROLES[s.role]?.label})`).join(', ');
  let sectionsHtml='';
  nd.sections.forEach(s=>{
    const live=document.getElementById(`section-${s.key}`);const content=live?live.innerText:s.content;
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
  let text=App.noteSections.sections.map(s=>{const live=document.getElementById(`section-${s.key}`);return`=== ${s.title.toUpperCase()} ===\n${live?live.innerText:s.content}`;}).join('\n\n');
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
    const live=document.getElementById(`section-${s.key}`);
    return{key:s.key,title:s.title,content:live?live.innerText:s.content};
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
  let text=App.noteSections.sections.map(s=>{const live=document.getElementById(`section-${s.key}`);return`=== ${s.title.toUpperCase()} ===\n${live?live.innerText:s.content}`;}).join('\n\n');
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
