/* ============================================================
   CLINICALFLOW — Application Entry Point (ES Module)
   ============================================================ */

/* ── Imports ── */
import { App, Config, ConfigFallback, cfg, tauriInvoke, tauriListen, loadCorrectionsDictionary } from './state.js';
import { D, cacheDOM, loadTheme, toast, openModal, closeModal, closeAllModals,
         openSettings, closeSettings, toggleSettings, setTheme, showConfirm,
         updStatus, showDownloadBtns, hideDownloadBtns, updConn, wait } from './ui.js';
import { addSpeaker, setActiveSpk, renderSpeakers, ROLES } from './speakers.js';
import { renderEntries, clearTx, updWordCount, addEntry, updatePartial, removePartial,
         downloadTranscript, toggleSearch, doSearch } from './transcript.js';
import { downloadAudio, resetWave, checkMemory } from './audio.js';
import { startRecording, stopRecording, pauseRecording, toggleRec,
         startTimer, stopTimer, resetTimer, updateRecUI } from './recording.js';
import { generateNote, renderNoteSec, exportPDF, copyNote, copyForEHR, downloadTextNote, exportHL7, generateCoding } from './notes.js';
import { saveSession, clearSavedSession, getSavedSession, restoreSession,
         newSession, loadArchiveList } from './session.js';
import { ollamaCheck, ollamaCheckWithRetry, saveOllamaSettings, loadOllamaSettings,
         loadClaudeKey, saveClaudeKey, updClaudeStatus, loadApiKey, saveApiKey,
         updApiStatus, initToggles, initFmtSel, loadAccountSettings,
         saveCustomTemplate, addTemplateSection, refreshFmtSel,
         loadEhrSettings, initEhrSettings } from './settings.js';
import { checkAuthAndInit, _resetAutoLock, setAutoLockMs, clearAutoLockTimer } from './auth.js';
import { resetDentalChart, renderDentalChart, renderDentalPreview, updateDentalSummary, parseDentalFindingsFromNote, applyParsedFindings, setViewMode, setPerioDepths, setPerioMobility, setPerioRecession } from './dental-chart.js';
import { LANGUAGES } from './languages.js';
import { renderPmsSettings, syncToPms } from './pms-bridge.js';
import { initDictionaryFeatures, togglePalette, addToothTooltips } from './dictionary-features.js';

/* ── Keyboard Shortcuts ── */
function initKeys(){
  document.addEventListener('keydown',e=>{
    if(e.ctrlKey||e.metaKey){
      switch(e.key.toLowerCase()){
        case 'r':e.preventDefault();toggleRec();return;
        case ',':e.preventDefault();toggleSettings();return;
        case 'f':e.preventDefault();toggleSearch();return;
        case 'j':e.preventDefault();togglePalette();return;
      }
    }
    const tag=e.target.tagName.toLowerCase();if(tag==='input'||tag==='textarea'||e.target.contentEditable==='true')return;
    switch(e.key.toLowerCase()){
      case ' ':e.preventDefault();toggleRec();break;
      case 'p':if(App.isRecording){e.preventDefault();pauseRecording();}break;
      case 'g':if(!App.isRecording&&App.entries.length>0){e.preventDefault();generateNote();}break;
      case 'e':if(App.noteGenerated){e.preventDefault();exportPDF();}break;
      case 'h':if(App.noteGenerated){e.preventDefault();copyForEHR();}break;
      case 'l':if(App.noteGenerated){e.preventDefault();exportHL7();}break;
      case 'n':e.preventDefault();if(App.entries.length>0||App.noteGenerated)openModal(D.newSessModal);else newSession();break;
      case 't':if(App.entries.length>0){e.preventDefault();downloadTranscript();}break;
      case 'escape':closeAllModals();closeSettings();if(D.searchBar.classList.contains('visible'))toggleSearch();break;
    }
  });
}

/* ── Demo Mode ── */
const DEMO_MEDICAL=[
  {s:'other',d:1500,t:"Good afternoon, Mr. Robinson. Let me get your vitals. Blood pressure is 142 over 88. Heart rate 78. Oxygen 98%. Weight today is 218 pounds, that's up 4 pounds from your last visit."},
  {s:'patient',d:2000,t:"Yeah, I've been eating more lately. Holiday season got me."},
  {s:'doctor',d:2500,t:"Hello, James. I see your blood pressure is a bit elevated today. Let's talk about a few things. How's the diabetes been?"},
  {s:'patient',d:3000,t:"Well, I've been checking my sugars like you asked. Fasting is usually around 160, sometimes 180. After meals it can hit 220, 230."},
  {s:'doctor',d:2000,t:"That's higher than we'd like. Are you still taking the metformin twice a day?"},
  {s:'patient',d:2000,t:"Yes, 1000 milligrams morning and night. I haven't missed any doses."},
  {s:'doctor',d:2500,t:"Good. Any episodes of low blood sugar? Shakiness, sweating, feeling faint?"},
  {s:'patient',d:1500,t:"No, nothing like that."},
  {s:'doctor',d:2000,t:"Any numbness or tingling in your feet? Vision changes?"},
  {s:'patient',d:3000,t:"Actually, yes. My feet have been tingling for about a month now. Both feet, worse at night. No vision problems though."},
  {s:'doctor',d:4000,t:"I want to note that. That could be early peripheral neuropathy. I'm going to check your hemoglobin A1C today and also order a comprehensive metabolic panel. Now, I also see you wanted to discuss your knee?"},
  {s:'patient',d:3500,t:"Right. My left knee has been killing me. It started about three weeks ago. It's a deep aching pain, worse when I go up stairs or stand up from sitting. I'd say it's a 6 out of 10 most days."},
  {s:'doctor',d:2000,t:"Any swelling, redness, or warmth in the knee?"},
  {s:'patient',d:2000,t:"Some swelling on and off. No redness or warmth."},
  {s:'doctor',d:1500,t:"Any locking or giving way?"},
  {s:'patient',d:1500,t:"No, nothing like that."},
  {s:'doctor',d:5000,t:"Let me take a look. I'm going to examine your left knee now. There is mild effusion present. Range of motion is slightly decreased, about 10 degrees short of full flexion. Medial joint line tenderness. McMurray's test is negative. No ligamentous laxity. Crepitus noted with flexion and extension."},
  {s:'doctor',d:5000,t:"Alright James, here's what I'm thinking. For the diabetes, I want to add glipizide 5 milligrams once daily with breakfast to get those numbers down. Continue the metformin as is. We'll check your A1C and metabolic panel today and I'll call you with results in a few days."},
  {s:'patient',d:2000,t:"Okay. Any side effects I should watch for with the new pill?"},
  {s:'doctor',d:3500,t:"The main one is low blood sugar. If you feel shaky, sweaty, or lightheaded, eat something with sugar right away and call us. Don't skip meals while taking it."},
  {s:'patient',d:1000,t:"Got it."},
  {s:'doctor',d:5000,t:"For the knee, this looks like osteoarthritis. I'd like you to start with over-the-counter naproxen, 220 milligrams twice a day with food. Ice the knee for 15 minutes after activity. And I'm going to put in a referral to physical therapy. If it's not improving in six weeks, we can discuss a cortisone injection."},
  {s:'patient',d:1000,t:"Sounds good, doc."},
  {s:'doctor',d:5000,t:"For the tingling feet, let's get the labs first. If the A1C is high, that's likely the cause and better sugar control should help. I'd also like to schedule a monofilament exam at your next visit. Follow up in six weeks for both issues. Any questions?"},
  {s:'patient',d:1500,t:"No, I think that covers it. Thank you."}
];

const DEMO_DENTAL=[
  {s:'patient',t:"I've been having sharp pain on the lower left side when I chew. It's been going on for about two weeks now. And I also have this cold sensitivity on the upper right that lingers for about 30 seconds after the stimulus is removed."},
  {s:'doctor',t:"When was your last dental visit?"},
  {s:'patient',t:"About 18 months ago for a cleaning and bitewing x-rays. I brush twice a day but I'll be honest, I don't floss very often."},
  {s:'doctor',t:"I see you have some previous dental work. Can you tell me about that?"},
  {s:'patient',t:"I have a porcelain fused to metal crown on number 19, that was placed about four years ago. And I have some composite fillings on tooth number 15, on the occlusal and buccal surfaces. I also had all four wisdom teeth removed in my twenties, except number 1 which was never extracted because it was fully impacted and not causing any problems at the time."},
  {s:'doctor',t:"Any medical conditions or medications?"},
  {s:'patient',t:"I'm taking metformin 1000 milligrams twice daily for type 2 diabetes. My last hemoglobin A1c was 7.2. No allergies to latex or anesthetics but I do have a nickel allergy which is relevant for metal restorations."},
  {s:'doctor',t:"Let me start the extraoral exam. TMJ examination reveals mild clicking on the right side with opening, no crepitus, no deviation. Lymph nodes are non-palpable bilaterally. Facial symmetry is within normal limits."},
  {s:'doctor',t:"Intraoral exam now. Soft tissue examination shows pink and stippled gingiva in most areas. I'm noting localized erythema and bleeding on probing around teeth 18 and 19. Mild gingival recession of approximately 2 millimeters on the facial of number 6 and number 11. Oral cancer screening is negative — tongue, floor of mouth, buccal mucosa, hard and soft palate all within normal limits. Occlusion is Class I with mild anterior crowding in the mandibular arch."},
  {s:'doctor',t:"Existing restorations: PFM crown on number 19 is intact with good marginal adaptation. Composite restorations on number 15 OB show marginal staining but no recurrent caries on clinical exam."},
  {s:'doctor',t:"Radiographic findings: Bitewing radiographs reveal radiolucency on the mesial and distal of number 3 extending into dentin, consistent with MOD caries. Tooth number 30 shows a disto-occlusal radiolucency approaching the pulp chamber. Periapical radiograph of number 19 shows a periapical radiolucency approximately 3 millimeters in diameter at the mesial root apex despite previous root canal therapy — I suspect endodontic failure or a missed canal. Panoramic radiograph confirms number 1 is fully impacted in a horizontal orientation with proximity to the maxillary sinus. Number 14 was previously extracted — edentulous space with mild alveolar ridge resorption."},
  {s:'doctor',t:"Periodontal findings: Probing depths generally 2 to 3 millimeters throughout. Localized 5-millimeter pockets on the mesial and distal of number 19 with bleeding on probing. Clinical attachment loss of 3 millimeters on the mesial of 19. Plaque index is moderate. No tooth mobility noted."},
  {s:'doctor',t:"Assessment: Number 3 — mesio-occluso-distal caries, recommend composite restoration. Number 30 — disto-occlusal caries approaching pulp, recommend indirect pulp cap and composite restoration versus root canal therapy if symptoms persist. Number 19 — suspect endodontic failure with periapical pathology, refer to endodontist for retreatment evaluation. Number 1 — full bony impacted upper right third molar, recommend monitoring with annual panoramic radiograph given proximity to sinus, consider referral to oral surgery if symptomatic. Number 14 — edentulous space, discuss replacement options including implant-supported crown versus fixed partial denture."},
  {s:'doctor',t:"Treatment plan: Phase 1 — oral hygiene instruction, scaling and root planing in the lower left quadrant. Phase 2 — MOD composite on number 3, DO composite on number 30 with indirect pulp cap using calcium hydroxide. Phase 3 — endodontic retreatment referral for number 19. Phase 4 — implant consultation for number 14 once periodontal health is stable. I'm prescribing chlorhexidine gluconate 0.12 percent rinse twice daily for two weeks. Next visit scheduled in two weeks for SRP."},
  {s:'patient',t:"Okay, that all makes sense. I understand the treatment plan."},
  {s:'doctor',t:"Patient consented to treatment plan and was advised of all risks and alternatives."}
];

function _populateLanguageSelect(){
  const sel=D.langSel;if(!sel)return;
  sel.innerHTML='';
  for(const lang of LANGUAGES){
    const opt=document.createElement('option');
    opt.value=lang.code;opt.textContent=lang.label;
    sel.appendChild(opt);
  }
  App.language=cfg.get('ms-language','en-US');
  sel.value=App.language;
  if(!sel.value){sel.value='en-US';App.language='en-US';}
}

function initDemo(){
  let clicks=0,timer=null;
  document.getElementById('helpBtn').addEventListener('click',()=>{
    clicks++;clearTimeout(timer);
    timer=setTimeout(()=>{
      if(clicks>=3&&!App.demoRunning){closeAllModals();_showDemoPicker();}
      else{openModal(D.helpModal);}
      clicks=0;
    },400);
  });
}

function _showDemoPicker(){
  const modal=document.getElementById('demoPickerModal');
  if(!modal)return;
  openModal(modal);
  modal.querySelectorAll('.demo-picker-card').forEach(card=>{
    card.onclick=()=>{
      closeModal(modal);
      const type=card.dataset.demo;
      if(type==='dental') runDemoInstant(DEMO_DENTAL,'dental');
      else runDemoAnimated(DEMO_MEDICAL,'medical');
    };
  });
  document.getElementById('closeDemoPicker').onclick=()=>closeModal(modal);
  modal.onclick=(e)=>{if(e.target===modal)closeModal(modal);};
}

async function runDemoInstant(entries,type){
  await newSession();
  if(type==='dental'){
    addSpeaker('Dr. Chen','doctor');addSpeaker('Ms. Ramirez','patient');
    /* Auto-select dental template */
    App.noteFormat='dental_general';
    cfg.set('ms-note-format','dental_general');
    if(D.fmtSel){D.fmtSel.value='dental_general';D.fmtSel.dispatchEvent(new Event('change'));}
  }else{
    addSpeaker('Dr. Patel','doctor');addSpeaker('Mr. Robinson','patient');addSpeaker('Maria (MA)','other');
  }
  App.sessionStartTime=new Date();
  for(const item of entries){
    const sp=App.speakers.find(s=>s.role===item.s);
    if(sp)setActiveSpk(sp.id);
    addEntry(item.t,0.92+Math.random()*0.08);
  }
  /* Auto-populate dental chart from transcript */
  if(type==='dental'){
    const fullText=entries.map(e=>e.t).join('\n');
    const findings=parseDentalFindingsFromNote(fullText);
    const added=applyParsedFindings(findings);
    if(added>0){
      renderDentalPreview();
      updateDentalSummary();
      toast(`Dental chart populated — ${added} finding${added>1?'s':''} from transcript`,'success',4000);
    }
    /* Populate perio demo data matching clinical findings in transcript */
    _populatePerioDemo();
  }
  D.genBtn.style.display='inline-flex';showDownloadBtns();
  toast('Demo loaded — click "Generate Note" to create documentation.','success',5000);
}

function _populatePerioDemo(){
  /* Teeth 18 & 19: localized 5mm pockets with BOP, CAL 3mm on mesial of 19 */
  setPerioDepths('18',[3,3,4,3,3,3],[false,false,true,false,false,false]);
  setPerioDepths('19',[5,3,5,4,3,4],[true,false,true,true,false,false]);
  setPerioRecession('19',2);
  /* General 2-3mm depths on representative teeth */
  setPerioDepths('3',[3,2,3,2,3,2],null);
  setPerioDepths('6',[2,2,2,2,2,2],null);
  setPerioRecession('6',2);
  setPerioDepths('11',[2,2,2,2,2,3],null);
  setPerioRecession('11',2);
  setPerioDepths('14',[2,2,3,2,2,3],null);
  setPerioDepths('30',[3,3,4,3,2,3],[false,false,true,false,false,false]);
  setPerioDepths('8',[2,2,2,2,2,2],null);
  setPerioDepths('25',[2,3,2,2,2,2],null);
  updateDentalSummary();
}

async function runDemoAnimated(entries,type){
  App.demoRunning=true;await newSession();
  if(type==='dental'){
    addSpeaker('Dr. Chen','doctor');addSpeaker('Ms. Ramirez','patient');
    App.noteFormat='dental_general';cfg.set('ms-note-format','dental_general');
    if(D.fmtSel){D.fmtSel.value='dental_general';D.fmtSel.dispatchEvent(new Event('change'));}
  }else{
    addSpeaker('Dr. Patel','doctor');addSpeaker('Mr. Robinson','patient');addSpeaker('Maria (MA)','other');
    setActiveSpk(App.speakers[2].id);
  }
  App.sessionStartTime=new Date();updateRecUI(true);App.isRecording=true;startTimer();
  function simW(){if(!App.demoRunning)return;D.waveBars.forEach(b=>{b.style.height=`${Math.random()*28+4}px`;b.classList.remove('inactive');b.style.background='var(--accent)';});if(App.demoRunning)requestAnimationFrame(simW);}simW();
  toast('Demo mode — simulating clinical encounter','info',4000);
  for(const item of entries){
    if(!App.demoRunning)break;
    const sp=App.speakers.find(s=>s.role===item.s);if(sp)setActiveSpk(sp.id);
    const words=item.t.split(' ');let partial='';
    for(let i=0;i<words.length;i++){partial+=(i>0?' ':'')+words[i];updatePartial(partial);await wait(80+Math.random()*60);}
    removePartial();addEntry(item.t,0.92+Math.random()*0.08);await wait(item.d||1500);
  }
  App.demoRunning=false;App.isRecording=false;stopTimer();resetWave();updateRecUI(false);
  D.genBtn.style.display='inline-flex';showDownloadBtns();
  toast('Demo complete — click "Generate Note" to create documentation.','success',5000);
}

/* ── Sidebar Toggle ── */
function initSidebarToggle(){
  const sidebar=document.getElementById('sidebar');
  const toggle=document.getElementById('sidebarToggle');
  const app=document.getElementById('app');
  if(!sidebar||!toggle)return;

  const saved=cfg.get('ms-sidebar-collapsed',null);
  if(saved==='true'||saved===true){
    sidebar.classList.add('collapsed');
    app.classList.add('sidebar-collapsed');
    const savedRatio=cfg.get('ms-panel-ratio',null);
    if(savedRatio){
      try{
        const{tx,note}=JSON.parse(savedRatio);
        const total=tx+note;
        let txN=tx/total,noteN=note/total;
        if(txN<0.2){txN=0.2;noteN=0.8;}
        if(noteN<0.2){noteN=0.2;txN=0.8;}
        app.style.gridTemplateColumns=`0px ${txN}fr ${noteN}fr`;
      }catch(e){}
    }
  }

  toggle.addEventListener('click',()=>{
    const collapsing=!sidebar.classList.contains('collapsed');
    sidebar.classList.toggle('collapsed',collapsing);
    app.classList.toggle('sidebar-collapsed',collapsing);
    cfg.set('ms-sidebar-collapsed',collapsing);
    const savedRatio=cfg.get('ms-panel-ratio',null);
    if(savedRatio){
      try{
        const{tx,note}=JSON.parse(savedRatio);
        const sidebarCol=collapsing?'0px':'var(--sidebar-width)';
        const total=tx+note;
        let txN=tx/total,noteN=note/total;
        if(txN<0.2){txN=0.2;noteN=0.8;}
        if(noteN<0.2){noteN=0.2;txN=0.8;}
        app.style.gridTemplateColumns=`${sidebarCol} ${txN}fr ${noteN}fr`;
      }catch(e){}
    }else{
      app.style.gridTemplateColumns='';
    }
  });
}

/* ── Panel Resize ── */
function initPanelResize(){
  const handle=document.getElementById('resizeHandle');
  const app=document.getElementById('app');
  const sidebar=document.getElementById('sidebar');
  if(!handle||!app)return;

  let isDragging=false;
  let startX=0;
  let startTxFr=1;
  let startNoteFr=1;

  const savedRatio=cfg.get('ms-panel-ratio',null);
  if(savedRatio){
    try{
      const{tx,note}=JSON.parse(savedRatio);
      applyRatio(tx,note);
    }catch(e){}
  }

  function getContentWidth(){
    const sidebarW=sidebar&&!sidebar.classList.contains('collapsed')?sidebar.offsetWidth:0;
    return app.offsetWidth-sidebarW;
  }

  function getCurrentFractions(){
    const cols=getComputedStyle(app).gridTemplateColumns.split(' ');
    if(cols.length<3)return{txFr:1,noteFr:1};
    const txPx=parseFloat(cols[1]);
    const notePx=parseFloat(cols[2]);
    const total=txPx+notePx;
    if(total===0)return{txFr:1,noteFr:1};
    return{txFr:txPx/total,noteFr:notePx/total};
  }

  function applyRatio(txFr,noteFr){
    const total=txFr+noteFr;
    let tx=txFr/total;
    let note=noteFr/total;
    if(tx<0.2){tx=0.2;note=0.8;}
    if(note<0.2){note=0.2;tx=0.8;}
    const sidebarCol=sidebar&&!sidebar.classList.contains('collapsed')?'var(--sidebar-width)':'0px';
    app.style.gridTemplateColumns=`${sidebarCol} ${tx}fr ${note}fr`;
  }

  handle.addEventListener('mousedown',e=>{
    e.preventDefault();
    isDragging=true;
    startX=e.clientX;
    const cur=getCurrentFractions();
    startTxFr=cur.txFr;
    startNoteFr=cur.noteFr;
    handle.classList.add('active');
    document.body.classList.add('resizing');
  });

  document.addEventListener('mousemove',e=>{
    if(!isDragging)return;
    const contentW=getContentWidth();
    if(contentW===0)return;
    const dx=e.clientX-startX;
    const deltaFr=dx/contentW;
    applyRatio(startTxFr+deltaFr,startNoteFr-deltaFr);
  });

  document.addEventListener('mouseup',()=>{
    if(!isDragging)return;
    isDragging=false;
    handle.classList.remove('active');
    document.body.classList.remove('resizing');
    const cur=getCurrentFractions();
    cfg.set('ms-panel-ratio',JSON.stringify({tx:cur.txFr,note:cur.noteFr}));
  });

  handle.addEventListener('touchstart',e=>{
    e.preventDefault();
    const touch=e.touches[0];
    isDragging=true;
    startX=touch.clientX;
    const cur=getCurrentFractions();
    startTxFr=cur.txFr;
    startNoteFr=cur.noteFr;
    handle.classList.add('active');
    document.body.classList.add('resizing');
  },{passive:false});

  document.addEventListener('touchmove',e=>{
    if(!isDragging)return;
    const touch=e.touches[0];
    const contentW=getContentWidth();
    if(contentW===0)return;
    const dx=touch.clientX-startX;
    const deltaFr=dx/contentW;
    applyRatio(startTxFr+deltaFr,startNoteFr-deltaFr);
  },{passive:true});

  document.addEventListener('touchend',()=>{
    if(!isDragging)return;
    isDragging=false;
    handle.classList.remove('active');
    document.body.classList.remove('resizing');
    const cur=getCurrentFractions();
    cfg.set('ms-panel-ratio',JSON.stringify({tx:cur.txFr,note:cur.noteFr}));
  });

  handle.addEventListener('dblclick',()=>{
    applyRatio(1,1);
    cfg.remove('ms-panel-ratio');
    toast('Panel sizes reset','info',2000);
  });
}

/* ── Event Listeners ── */
function initEvents(){
  D.recBtn.addEventListener('click',toggleRec);
  D.pauseBtn.addEventListener('click',pauseRecording);
  D.genBtn.addEventListener('click',generateNote);
  D.expPdfBtn.addEventListener('click',exportPDF);D.expBtn.addEventListener('click',exportPDF);
  D.copyBtn.addEventListener('click',copyNote);if(D.copyEhrBtn)D.copyEhrBtn.addEventListener('click',copyForEHR);if(D.expHl7Btn)D.expHl7Btn.addEventListener('click',exportHL7);D.regenBtn.addEventListener('click',generateNote);
  /* Insurance narrative button */
  if(D.genNarrBtn)D.genNarrBtn.addEventListener('click',()=>{import('./dental-extras.js').then(m=>m.generateInsuranceNarrative()).catch(e=>toast('Narrative failed: '+e.message,'error'));});
  /* Phrase Palette button */
  document.getElementById('phrasePaletteBtn')?.addEventListener('click',togglePalette);
  /* PMS Sync button */
  document.getElementById('syncPmsBtn')?.addEventListener('click',()=>syncToPms('all'));
  if(D.dlTxBtn)D.dlTxBtn.addEventListener('click',downloadTranscript);
  if(D.dlAudioBtn)D.dlAudioBtn.addEventListener('click',downloadAudio);
  document.getElementById('newSessionBtn').addEventListener('click',()=>{if(App.entries.length>0||App.noteGenerated)openModal(D.newSessModal);else newSession();});
  /* Dental chart modal */
  const _dcModal=document.getElementById('dentalChartModal');
  const _closeDcModal=()=>{if(_dcModal){closeModal(_dcModal);renderDentalPreview();updateDentalSummary();}};
  document.getElementById('openDentalChartBtn')?.addEventListener('click',()=>{
    const c=document.getElementById('dentalChartContainer');
    renderDentalChart(c);
    updateDentalSummary();
    if(_dcModal) openModal(_dcModal);
  });
  document.getElementById('closeDentalChartModal')?.addEventListener('click',_closeDcModal);
  document.getElementById('doneDentalChartBtn')?.addEventListener('click',_closeDcModal);
  document.getElementById('resetDentalChartBtn')?.addEventListener('click',()=>{resetDentalChart();toast('Dental chart reset','info');});
  document.getElementById('resetDentalChartModalBtn')?.addEventListener('click',()=>{resetDentalChart();toast('Dental chart reset','info');});
  _dcModal?.addEventListener('click',(e)=>{if(e.target===_dcModal) closeModal(_dcModal);});
  /* Dental chart view toggle (Chart / Perio) */
  document.getElementById('dentalViewToggle')?.querySelectorAll('.dental-view-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.dental-view-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      setViewMode(btn.dataset.view);
      const c=document.getElementById('dentalChartContainer');
      if(c)renderDentalChart(c);
    });
  });
  document.getElementById('settingsToggleBtn').addEventListener('click',openSettings);
  D.setClose.addEventListener('click',closeSettings);D.setOverlay.addEventListener('click',closeSettings);
  /* Settings tab switcher (General / Advanced) */
  document.getElementById('settingsTabs')?.querySelectorAll('.settings-tab').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.settings-tab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const tab=btn.dataset.tab;
      document.getElementById('settingsTabGeneral').style.display=tab==='general'?'':'none';
      document.getElementById('settingsTabAdvanced').style.display=tab==='advanced'?'':'none';
    });
  });
  D.themeSw.querySelectorAll('.theme-option').forEach(b=>b.addEventListener('click',()=>setTheme(b.dataset.theme)));
  if(D.dgSave)D.dgSave.addEventListener('click',saveApiKey);
  if(D.dgInput){
    D.dgInput.addEventListener('keydown',e=>{if(e.key==='Enter')saveApiKey();});
    D.dgInput.addEventListener('focus',()=>{if(D.dgInput.value.includes('•'))D.dgInput.value='';});
  }
  if(D.txModeToggle){
    D.txModeToggle.querySelectorAll('.theme-option').forEach(btn=>{
      btn.addEventListener('click',()=>{
        D.txModeToggle.querySelectorAll('.theme-option').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        App.transcriptionMode=btn.dataset.mode;
        cfg.set('ms-tx-mode',App.transcriptionMode);
        if(D.onlineSettings)D.onlineSettings.style.display=App.transcriptionMode==='online'?'':'none';
        updApiStatus();
      });
    });
  }
  D.langSel.addEventListener('change',e=>{App.language=e.target.value;cfg.set('ms-language',App.language);if(App.recognition)App.recognition.lang=App.language;loadCorrectionsDictionary();});
  document.getElementById('cancelNewSession').addEventListener('click',()=>closeModal(D.newSessModal));
  document.getElementById('confirmNewSession').addEventListener('click',()=>{closeModal(D.newSessModal);newSession();});
  D.addSpkBtn.addEventListener('click',()=>openModal(D.addSpkModal));
  document.getElementById('cancelAddSpeaker').addEventListener('click',()=>closeModal(D.addSpkModal));
  document.getElementById('confirmAddSpeaker').addEventListener('click',()=>{
    const nm=document.getElementById('newSpeakerName').value.trim();if(!nm){toast('Enter a speaker name.','warning');return;}
    const sel=D.addSpkModal.querySelector('.role-option.selected');addSpeaker(nm,sel?.dataset.role||'other');
    document.getElementById('newSpeakerName').value='';closeModal(D.addSpkModal);toast(`Speaker "${nm}" added`,'success');
  });
  D.addSpkModal.querySelectorAll('.role-option').forEach(btn=>{
    btn.addEventListener('click',()=>{
      D.addSpkModal.querySelectorAll('.role-option').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
  document.getElementById('closeHelpModal').addEventListener('click',()=>closeModal(D.helpModal));
  document.getElementById('clearTranscriptBtn').addEventListener('click',()=>{if(App.entries.length>0)openModal(D.clearTxModal);});
  document.getElementById('cancelClearTranscript').addEventListener('click',()=>closeModal(D.clearTxModal));
  document.getElementById('confirmClearTranscript').addEventListener('click',()=>{closeModal(D.clearTxModal);clearTx();});
  document.getElementById('searchTranscriptBtn').addEventListener('click',toggleSearch);
  document.getElementById('closeSearchBtn').addEventListener('click',toggleSearch);
  D.searchInput.addEventListener('input',e=>doSearch(e.target.value));
  document.querySelectorAll('.modal-overlay').forEach(o=>o.addEventListener('click',e=>{if(e.target===o)closeModal(o);}));

  const refreshArchBtn=document.getElementById('refreshArchiveBtn');
  if(refreshArchBtn)refreshArchBtn.addEventListener('click',()=>loadArchiveList());
  initSidebarToggle();
  initPanelResize();

  if(D.aiEngineToggle){
    D.aiEngineToggle.querySelectorAll('.theme-option').forEach(btn=>{
      btn.addEventListener('click',()=>{
        D.aiEngineToggle.querySelectorAll('.theme-option').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        App.aiEngine=btn.dataset.engine;
        cfg.set('ms-ai-engine',App.aiEngine);
        if(D.cloudAISettings)D.cloudAISettings.style.display=App.aiEngine==='cloud'?'':'none';
        if(D.ollamaSettings)D.ollamaSettings.style.display=App.aiEngine==='ollama'?'':'none';
      });
    });
  }
  if(D.ollamaTestBtn){
    D.ollamaTestBtn.addEventListener('click',async()=>{
      App.ollamaUrl=D.ollamaUrl.value.trim().replace(/\/$/,'');
      saveOllamaSettings();
      await ollamaCheck();
    });
  }
  if(D.ollamaRefreshBtn){
    D.ollamaRefreshBtn.addEventListener('click',async()=>{
      D.ollamaRefreshBtn.classList.add('spinning');
      await ollamaCheck();
      D.ollamaRefreshBtn.classList.remove('spinning');
    });
  }
  if(D.ollamaModelSelect){
    D.ollamaModelSelect.addEventListener('change',e=>{
      App.ollamaModel=e.target.value;
      saveOllamaSettings();
      const smallModels=['tinyllama','phi','gemma:2b','qwen2.5:0.5b','qwen2.5:1.5b'];
      if(smallModels.some(m=>App.ollamaModel.toLowerCase().includes(m))){
        toast('Small models may produce lower quality clinical notes. 7B+ models recommended.','warning',6000);
      }
    });
  }
  const verifyToggle=document.getElementById('settingOllamaVerify');
  if(verifyToggle){
    verifyToggle.addEventListener('click',()=>{
      const isActive=verifyToggle.classList.toggle('active');
      App.ollamaVerify=isActive;
      verifyToggle.setAttribute('aria-checked',isActive);
      saveOllamaSettings();
      toast(isActive?'Verification pass enabled — notes will be double-checked':'Verification pass disabled',isActive?'success':'info');
    });
    verifyToggle.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();verifyToggle.click();}});
  }
  const claudeSaveBtn=document.getElementById('claudeKeySave');
  if(claudeSaveBtn){
    claudeSaveBtn.addEventListener('click',saveClaudeKey);
  }
  const claudeKeyInput=document.getElementById('claudeKeyInput');
  if(claudeKeyInput){
    claudeKeyInput.addEventListener('keydown',e=>{if(e.key==='Enter')saveClaudeKey();});
    claudeKeyInput.addEventListener('focus',()=>{if(claudeKeyInput.value.includes('•'))claudeKeyInput.value='';});
  }
  const claudeVerifyToggle=document.getElementById('settingClaudeVerify');
  if(claudeVerifyToggle){
    claudeVerifyToggle.addEventListener('click',()=>{
      const isActive=claudeVerifyToggle.classList.toggle('active');
      App.claudeVerify=isActive;
      claudeVerifyToggle.setAttribute('aria-checked',isActive);
      cfg.set('ms-claude-verify',App.claudeVerify?'1':'0');
    });
    claudeVerifyToggle.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();claudeVerifyToggle.click();}});
  }

  /* Custom template modal */
  const customTmplBtn=document.getElementById('customTemplateBtn');
  const customTmplModal=document.getElementById('customTemplateModal');
  if(customTmplBtn&&customTmplModal){
    customTmplBtn.addEventListener('click',()=>openModal(customTmplModal));
    document.getElementById('cancelCustomTemplate')?.addEventListener('click',()=>closeModal(customTmplModal));
    document.getElementById('saveCustomTemplate')?.addEventListener('click',()=>saveCustomTemplate());
    document.getElementById('addTemplateSectionBtn')?.addEventListener('click',()=>addTemplateSection());
    // Wire remove buttons on initial section rows
    customTmplModal.querySelectorAll('.template-section-remove').forEach(btn=>{
      btn.addEventListener('click',()=>btn.closest('.template-section-row')?.remove());
    });
  }

  if(window.__TAURI__){
    const secGroup=document.getElementById('securitySettingsGroup');
    if(secGroup)secGroup.style.display='';

    const autoLockSel=document.getElementById('autoLockSelect');
    if(autoLockSel){
      const saved=cfg.get('ms-autolock-minutes','5');
      autoLockSel.value=saved;
      autoLockSel.addEventListener('change',e=>{
        const mins=e.target.value;
        cfg.set('ms-autolock-minutes',mins);
        setAutoLockMs(parseInt(mins,10)*60*1000);
        clearAutoLockTimer();
        if(parseInt(mins,10)>0)_resetAutoLock();
      });
    }

    const changePinBtn=document.getElementById('changePinBtn');
    if(changePinBtn){
      changePinBtn.addEventListener('click',async()=>{
        toast('PIN change coming in a future update. To reset, delete auth.json from the app data folder.','info',6000);
      });
    }
  }
}

/* ── Init App ── */
async function initApp(){
  // cfg.init + cfg.load moved to checkAuthAndInit() in auth.js (runs before subscription gate)
  // If running in browser mode (no Tauri), cfg may not be initialized yet
  if(!cfg._backend || cfg._backend===ConfigFallback){
    cfg.init(ConfigFallback);
    await cfg.load();
  }

  cacheDOM();loadTheme();loadApiKey();loadOllamaSettings();loadClaudeKey();loadAccountSettings();loadEhrSettings();initToggles();initFmtSel();initKeys();initEvents();initEhrSettings();renderPmsSettings();initDemo();
  _populateLanguageSelect();
  hideDownloadBtns();
  loadCorrectionsDictionary();
  initDictionaryFeatures();
  ollamaCheckWithRetry(3,2000).then(connected=>{
    if(connected){
      console.debug('[ClinicalFlow] Ollama connected:',App.ollamaModels.length,'models');
    }else if(App.aiEngine==='ollama'){
      toast('Ollama not detected. Start it with "ollama serve" or switch to Cloud AI in Settings.','warning',8000);
    }
  }).catch(e=>console.warn('[ClinicalFlow] Ollama check failed:',e));
  if(!App.dgKey&&App.transcriptionMode==='online')toast('Add an API key in Settings for online transcription, or switch to offline mode.','warning',6000);
  const saved=await getSavedSession();
  if(saved){
    const age=Date.now()-new Date(saved.savedAt).getTime();
    const mins=Math.round(age/60000);
    const timeLabel=mins<60?`${mins} min ago`:`${Math.round(mins/60)}h ago`;
    const ct=saved.entries.length;
    if(window.__TAURI__){
      const recover=await showConfirm('Restore session?',`Found an unsaved session (${ct} entries, saved ${timeLabel}). Restore it?`,'Restore');
      if(recover){restoreSession(saved);}else{clearSavedSession();}
    }else{
      const recover=confirm(`Unsaved session detected (${ct} entries, saved ${timeLabel}).\n\nRestore this session?`);
      if(recover){restoreSession(saved);}else{clearSavedSession();}
    }
  }
  if(window.__TAURI__)loadArchiveList();

  if(window.__TAURI__ && tauriListen){
    await checkMemory();
    tauriListen('recording_max_duration', () => {
      toast('Recording stopped — 4 hour maximum reached. Save your session.', 'warning', 10000);
      if (App.isRecording) stopRecording();
    });
    tauriListen('whisper_error', (event) => {
      toast(event.payload, 'warning', 4000);
    });
  }
}

/* ── Bootstrap ── */
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>checkAuthAndInit(initApp));
else checkAuthAndInit(initApp);
