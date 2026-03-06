/* ============================================================
   CLINICALFLOW — Shared State & Configuration
   ============================================================ */

/* Tauri v2 API — available when running inside Tauri, null otherwise */
export let __TAURI_READY__ = false;
export let tauriInvoke = null;
export let tauriListen = null;

export function _initTauri() {
  const t = window.__TAURI__;
  if (t && t.core && t.event) {
    tauriInvoke = t.core.invoke.bind(t.core);
    tauriListen = t.event.listen.bind(t.event);
    __TAURI_READY__ = true;
  }
}

/* Global error handlers — catch anything that slips through */
window.addEventListener('unhandledrejection', (event) => {
  console.error('[ClinicalFlow] Unhandled promise rejection:', event.reason);
  if (window.__TAURI__ && tauriInvoke) {
    tauriInvoke('log_frontend_error', {
      message: `Unhandled rejection: ${event.reason?.message || event.reason || 'Unknown'}`,
      stack: event.reason?.stack || ''
    }).catch(() => {});
  }
});

window.addEventListener('error', (event) => {
  console.error('[ClinicalFlow] Uncaught error:', event.error);
  if (window.__TAURI__ && tauriInvoke) {
    tauriInvoke('log_frontend_error', {
      message: `Uncaught error: ${event.error?.message || event.message || 'Unknown'}`,
      stack: event.error?.stack || ''
    }).catch(() => {});
  }
});

/* Config Manager — single file for all settings (Tauri backend, encrypted) */
export const Config = {
  _data: {},
  _dirty: false,
  _saveTimeout: null,
  async load() {
    try {
      const raw = await tauriInvoke('load_config_encrypted');
      this._data = raw ? JSON.parse(raw) : {};
    } catch(e) {
      console.warn('[ClinicalFlow] Config load failed:', e);
      this._data = {};
    }
  },
  get(key, fallback) {
    return this._data[key] !== undefined ? this._data[key] : fallback;
  },
  set(key, value) {
    this._data[key] = value;
    this._dirty = true;
    clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(() => this._flush(), 500);
  },
  remove(key) {
    delete this._data[key];
    this._dirty = true;
    clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(() => this._flush(), 500);
  },
  async _flush() {
    if (!this._dirty) return;
    try {
      await tauriInvoke('save_config_encrypted', { configJson: JSON.stringify(this._data) });
      this._dirty = false;
    } catch(e) {
      console.warn('[ClinicalFlow] Config save failed:', e);
    }
  }
};

/* Config fallback — localStorage for browser dev mode */
export const ConfigFallback = {
  _data: {},
  load() {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('ms-')) this._data[key] = localStorage.getItem(key);
    }
  },
  get(key, fallback) {
    const val = localStorage.getItem(key);
    return val !== null ? val : fallback;
  },
  set(key, value) {
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  },
  remove(key) { localStorage.removeItem(key); },
  _flush() {}
};

/* Config wrapper — delegates to active backend, avoids module binding reassignment */
export const cfg = {
  _backend: ConfigFallback,
  init(backend) { this._backend = backend; },
  get(key, fallback) { return this._backend.get(key, fallback); },
  set(key, value) { this._backend.set(key, value); },
  remove(key) { this._backend.remove(key); },
  async _flush() { if (this._backend._flush) return this._backend._flush(); },
  async load() { if (this._backend.load) return this._backend.load(); }
};

/* Application State */
export const App = {
  isRecording:false, isPaused:false, sessionStartTime:null, timerInterval:null, elapsed:0,
  engine:'webspeech', transcriptionMode:'online', dgKey:'', dgSocket:null,
  recognition:null, recognitionActive:false,
  audioCtx:null, analyser:null, stream:null, animFrame:null,
  mediaRecorder:null, audioChunks:[], audioBlob:null,
  speakers:[], nextSpkId:1, activeSpkId:null, lastSpkChange:0, silStart:null, silThresh:1500,
  entries:[], nextEntryId:1,
  noteGenerated:false, noteFormat:'soap', noteSections:{}, codingResults:null,
  settings:{autoScroll:true, timestamps:true, autoDetect:true, highlightTerms:false, autoCoding:true, dentalChartInExport:true, dentalFindingsInExport:true, showCopyEhr:false, showExportHl7:false, showNarrative:false, showSyncPms:false, showDocScore:false, lineDictation:true},
  dictationTarget:null, dictationActive:false,
  theme:'light', language:'en-US', demoRunning:false,
  aiEngine:'cloud',
  ollamaUrl:'http://localhost:11434',
  ollamaModel:'llama3.1:8b',
  ollamaConnected:false,
  ollamaModels:[],
  ollamaVerify:false,
  claudeKey:'',
  claudeVerify:true,
  lastWavPath:null,
  dentalChart:{ mode:'adult', teeth:{} }
};

/* AbortController for cancelling in-flight generation requests */
let _ollamaAbortCtrl = null;
export function getAbortCtrl() { return _ollamaAbortCtrl; }
export function setAbortCtrl(c) { _ollamaAbortCtrl = c; }

export const GENERATION_TIMEOUT_MS = 120000; // 2 minutes max

/* Medical term correction dictionary */
export let CORRECTIONS_DICT = [];
export const DEFAULT_CORRECTIONS = [
  /* Original corrections */
  [/\bglycide\b/gi,'glipizide'],[/\bglipside\b/gi,'glipizide'],
  [/\bmetforeman\b/gi,'metformin'],[/\bmetformn\b/gi,'metformin'],
  [/\bnaprocin\b/gi,'naproxen'],[/\bnah proxy\b/gi,'naproxen'],
  [/\blisinipril\b/gi,'lisinopril'],[/\banna proline\b/gi,'lisinopril'],
  [/\bsome a triptan\b/gi,'sumatriptan'],[/\bsue ma triptan\b/gi,'sumatriptan'],
  [/\blost art an\b/gi,'losartan'],[/\blow sartan\b/gi,'losartan'],
  [/\bsaid finear\b/gi,'cefdinir'],[/\bsaid fin here\b/gi,'cefdinir'],
  [/\bam a trips lean\b/gi,'amitriptyline'],[/\bamma trip to lean\b/gi,'amitriptyline'],
  [/\btoper a mate\b/gi,'topiramate'],[/\btop era mate\b/gi,'topiramate'],
  [/\bhydrochloric aside\b/gi,'hydrochlorothiazide'],
  [/\bhydrochloride\b(?=.*(?:diuretic|blood pressure|BP|hypertension))/gi,'hydrochlorothiazide'],
  [/\boh me prazole\b/gi,'omeprazole'],[/\bohm a pra zol\b/gi,'omeprazole'],
  [/\bpanto prazole\b/gi,'pantoprazole'],[/\bgabba penton\b/gi,'gabapentin'],
  [/\bazza throw my sin\b/gi,'azithromycin'],[/\bamox a sill in\b/gi,'amoxicillin'],
  [/\bpred nisone\b/gi,'prednisone'],
  [/\bcrepidus\b/gi,'crepitus'],[/\bincrepidus\b/gi,'crepitus'],
  [/\bfluxane\b/gi,'flexion'],[/\bflux in\b/gi,'flexion'],
  [/\bjoint blind\b/gi,'joint line'],
  [/\bligamentous toxicity\b/gi,'ligamentous laxity'],
  [/\bligament(?:ous)?\s+(?:tox|toxic)\w*/gi,'ligamentous laxity'],
  [/\berr?ith(?:e)?matous\b/gi,'erythematous'],[/\bairy thematous\b/gi,'erythematous'],
  [/\btim pan ick\b/gi,'tympanic'],[/\bpure you lent\b/gi,'purulent'],
  [/\bex you dates\b/gi,'exudates'],[/\bbuy lateral\b/gi,'bilateral'],
  [/\buh fusion\b/gi,'effusion'],
  /* Top medication ASR corrections */
  [/\ba tore va statin\b/gi,'atorvastatin'],[/\blipo tor\b/gi,'Lipitor'],
  [/\bmet for min\b/gi,'metformin'],[/\blee vo thigh rocks in\b/gi,'levothyroxine'],
  [/\bsin throid\b/gi,'Synthroid'],[/\blice in oh pril\b/gi,'lisinopril'],
  [/\bam low dip een\b/gi,'amlodipine'],[/\bmeta pro lol\b/gi,'metoprolol'],
  [/\bal beauty all\b/gi,'albuterol'],[/\blow czar tan\b/gi,'losartan'],
  [/\bgabba pen tin\b/gi,'gabapentin'],[/\bnew ron tin\b/gi,'Neurontin'],
  [/\boh mep ruh zole\b/gi,'omeprazole'],[/\bsir tra leen\b/gi,'sertraline'],
  [/\brow sue va statin\b/gi,'rosuvastatin'],[/\bpan toh pra zole\b/gi,'pantoprazole'],
  [/\bes sit al oh pram\b/gi,'escitalopram'],[/\blex a pro\b/gi,'Lexapro'],
  [/\bhydro chloro thigh a zide\b/gi,'hydrochlorothiazide'],
  [/\bbew pro pee on\b/gi,'bupropion'],[/\bflew ox a teen\b/gi,'fluoxetine'],
  [/\bsem a glue tide\b/gi,'semaglutide'],[/\boh zem pick\b/gi,'Ozempic'],[/\bozempicam\b/gi,'Ozempic'],[/\bozempica\b/gi,'Ozempic'],
  [/\bmon tell you cast\b/gi,'montelukast'],[/\btray zoh done\b/gi,'trazodone'],
  [/\bsim va statin\b/gi,'simvastatin'],[/\ba mox a sill in\b/gi,'amoxicillin'],
  [/\btam sue low sin\b/gi,'tamsulosin'],[/\bflow max\b/gi,'Flomax'],
  [/\bmel ox i cam\b/gi,'meloxicam'],[/\ba picks a ban\b/gi,'apixaban'],
  [/\bel a quiz\b/gi,'Eliquis'],[/\bfur oh sem ide\b/gi,'furosemide'],
  [/\blay six\b/gi,'Lasix'],[/\bdew locks a teen\b/gi,'duloxetine'],
  [/\bcar veda lol\b/gi,'carvedilol'],[/\bclop pid oh grell\b/gi,'clopidogrel'],
  [/\bplay vicks\b/gi,'Plavix'],[/\bpre gab a lin\b/gi,'pregabalin'],
  [/\bla moe tra jean\b/gi,'lamotrigine'],[/\bla mick tall\b/gi,'Lamictal'],
  [/\bleave a tear a sit am\b/gi,'levetiracetam'],[/\bkep ra\b/gi,'Keppra'],
  [/\bwar far in\b/gi,'warfarin'],[/\bcoo ma din\b/gi,'Coumadin'],
  [/\brye var ox a ban\b/gi,'rivaroxaban'],[/\bzuh rell toe\b/gi,'Xarelto'],
  [/\bterra zeh pah tide\b/gi,'tirzepatide'],[/\bmoun jar oh\b/gi,'Mounjaro'],
  /* Top condition/procedure ASR corrections */
  [/\bdie a beat ease\b/gi,'diabetes'],[/\bhigh per tension\b/gi,'hypertension'],
  [/\bhigh per lip a deem ee a\b/gi,'hyperlipidemia'],
  [/\ba trill fib rill a shun\b/gi,'atrial fibrillation'],
  [/\bmy oh card ee al in fark shun\b/gi,'myocardial infarction'],
  [/\bnew moan ya\b/gi,'pneumonia'],[/\bbronc eye tis\b/gi,'bronchitis'],
  [/\banna fill axis\b/gi,'anaphylaxis'],[/\bnew mow thorax\b/gi,'pneumothorax'],
  [/\bpull a nary em bowl ism\b/gi,'pulmonary embolism'],
  [/\bdisp nee a\b/gi,'dyspnea'],[/\bsin co pee\b/gi,'syncope'],
  [/\bcole oh noss co pee\b/gi,'colonoscopy'],
  [/\becho card ee oh gram\b/gi,'echocardiogram'],
  [/\belec tro card ee oh gram\b/gi,'electrocardiogram'],
  /* Cardiac rhythm / common condition garbling */
  [/\btacky cardia\b/gi,'tachycardia'],[/\bBrady cardia\b/gi,'bradycardia'],
  [/\ba rhythm ia\b/gi,'arrhythmia'],[/\ba rhythmia\b/gi,'arrhythmia'],
  [/\bannie your rhythm\b/gi,'aneurysm'],[/\bannie rhythm\b/gi,'aneurysm'],
  /* OTC / benzo / psych med garbling */
  [/\bace a min oh fin\b/gi,'acetaminophen'],[/\beye bew pro fin\b/gi,'ibuprofen'],
  [/\bclone az a pam\b/gi,'clonazepam'],[/\blore az a pam\b/gi,'lorazepam'],
  [/\bal praz oh lam\b/gi,'alprazolam'],[/\bdie az a pam\b/gi,'diazepam'],
  [/\bquiet a peen\b/gi,'quetiapine'],[/\bairy pip ra zole\b/gi,'aripiprazole'],
  [/\boh lance a peen\b/gi,'olanzapine'],[/\briss perry done\b/gi,'risperidone'],
  [/\bsarah quell\b/gi,'Seroquel'],
  /* Brand name garbling */
  [/\bhuman log\b/gi,'Humalog'],[/\bjan you via\b/gi,'Januvia'],
  [/\bjar dance\b/gi,'Jardiance'],[/\btrue lissity\b/gi,'Trulicity'],
  [/\bvie vance\b/gi,'Vyvanse'],[/\bvivance\b/gi,'Vyvanse'],
  [/\bhue meera\b/gi,'Humira'],
  /* -opathy / -osis garbling */
  [/\bnew drop a thee\b/gi,'neuropathy'],[/\brettin op a thee\b/gi,'retinopathy'],
  [/\bneff raw path ee\b/gi,'nephropathy'],[/\bosteo pour oh sis\b/gi,'osteoporosis'],
  [/\bfibro my al jia\b/gi,'fibromyalgia'],[/\bmy grain\b/gi,'migraine'],
  /* Dental Conditions */
  [/\bperry oh don't eye tis\b/gi,'periodontitis'],[/\bperry oh don't all\b/gi,'periodontal'],
  [/\bperry don tight is\b/gi,'periodontitis'],[/\bjin juh vie tis\b/gi,'gingivitis'],
  [/\bjin ja vie tis\b/gi,'gingivitis'],[/\bpul pie tis\b/gi,'pulpitis'],
  [/\bperry core oh night is\b/gi,'pericoronitis'],[/\bmal oh clue shun\b/gi,'malocclusion'],
  [/\bzero stow me a\b/gi,'xerostomia'],[/\bperry app i cal\b/gi,'periapical'],
  [/\bapp thus\b/gi,'aphthous'],[/\bstow ma tie tis\b/gi,'stomatitis'],
  [/\bkey lie tis\b/gi,'cheilitis'],
  /* Dental Procedures */
  [/\bpro fi lax iss\b/gi,'prophylaxis'],[/\bapp uh sect oh me\b/gi,'apicoectomy'],
  [/\bjin juh veck toe me\b/gi,'gingivectomy'],[/\bfree neck toe me\b/gi,'frenectomy'],
  [/\bpull paw toe me\b/gi,'pulpotomy'],[/\bcrown length ing\b/gi,'crown lengthening'],
  [/\bendo don tick\b/gi,'endodontic'],[/\bend oh don tick\b/gi,'endodontic'],
  /* Dental Anatomy */
  [/\bme see all\b/gi,'mesial'],[/\bmeal see all\b/gi,'mesial'],
  [/\bdiss tall\b/gi,'distal'],[/\bbuck all\b/gi,'buccal'],[/\bbucks all\b/gi,'buccal'],
  [/\bling wall\b/gi,'lingual'],[/\blin gull\b/gi,'lingual'],
  [/\boh clue zal\b/gi,'occlusal'],[/\bin sigh zal\b/gi,'incisal'],
  [/\bpal a tall\b/gi,'palatal'],[/\bman dib you lar\b/gi,'mandibular'],
  [/\bmax ill airy\b/gi,'maxillary'],[/\ball vee oh lar\b/gi,'alveolar'],
  [/\bfur cay shun\b/gi,'furcation'],
  /* Dental Materials & Medications */
  [/\ba mal gum\b/gi,'amalgam'],[/\bgutta per cha\b/gi,'gutta percha'],
  [/\bzir cone ee a\b/gi,'zirconia'],[/\bglass eye on oh mer\b/gi,'glass ionomer'],
  [/\blid oh cane\b/gi,'lidocaine'],[/\barticle cane\b/gi,'articaine'],
  [/\bchlor hex a dean\b/gi,'chlorhexidine'],[/\bperry dex\b/gi,'Peridex'],
];

export async function loadCorrectionsDictionary(){
  const langBase=App.language.split('-')[0];
  try{
    let data;
    if(window.__TAURI__){
      const raw=await tauriInvoke('load_corrections',{language:langBase});
      data=JSON.parse(raw);
    }else{
      const filename=langBase==='en'?'corrections.json':`corrections-${langBase}.json`;
      let r=await fetch(filename);
      if(!r.ok&&filename!=='corrections.json')r=await fetch('corrections.json');
      if(!r.ok)throw new Error('Not found');
      data=await r.json();
    }
    CORRECTIONS_DICT=data.map(item=>[new RegExp(item.pattern,item.flags||'gi'),item.replacement]);
    console.debug(`[ClinicalFlow] Loaded ${CORRECTIONS_DICT.length} corrections for '${langBase}'`);
  }catch(e){
    CORRECTIONS_DICT=DEFAULT_CORRECTIONS;
    console.debug(`[ClinicalFlow] Using ${CORRECTIONS_DICT.length} built-in corrections (fallback)`);
  }
}
