/* ============================================================
   CLINICALFLOW — Application v3
   ============================================================ */
'use strict';

/* 1. STATE */
const App = {
  isRecording:false, isPaused:false, sessionStartTime:null, timerInterval:null, elapsed:0,
  engine:'webspeech', dgKey:'', dgSocket:null,
  recognition:null, recognitionActive:false,
  audioCtx:null, analyser:null, stream:null, animFrame:null,
  mediaRecorder:null, audioChunks:[], audioBlob:null,
  speakers:[], nextSpkId:1, activeSpkId:null, lastSpkChange:0, silStart:null, silThresh:1500,
  entries:[], nextEntryId:1,
  noteGenerated:false, noteFormat:'soap', noteSections:{},
  settings:{autoScroll:true, timestamps:true, autoDetect:true, highlightTerms:false},
  theme:'dark', language:'en-US', demoRunning:false,
  // Ollama / AI engine
  aiEngine:'ollama', // 'ollama' or 'rules'
  ollamaUrl:'http://localhost:11434',
  ollamaModel:'llama3.1:8b',
  ollamaConnected:false,
  ollamaModels:[],
  ollamaVerify:false // two-pass verification (slower, more accurate)
};

/* AbortController for cancelling in-flight Ollama requests (Fix 5) */
let ollamaAbortCtrl=null;

/* Medical term correction dictionary — loaded from external file or defaults (Fix 4) */
let CORRECTIONS_DICT=[];
const DEFAULT_CORRECTIONS=[
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
];

/* ── Session Auto-Save & Recovery (Fix 1) ── */
function saveSession(){
  try{
    const data={
      entries:App.entries,
      speakers:App.speakers,
      nextEntryId:App.nextEntryId,
      nextSpkId:App.nextSpkId,
      activeSpkId:App.activeSpkId,
      elapsed:App.elapsed,
      sessionStartTime:App.sessionStartTime?.toISOString()||null,
      noteFormat:App.noteFormat,
      savedAt:new Date().toISOString()
    };
    localStorage.setItem('ms-active-session',JSON.stringify(data));
  }catch(e){console.warn('[ClinicalFlow] Auto-save failed:',e);}
}
function clearSavedSession(){
  localStorage.removeItem('ms-active-session');
}
function getSavedSession(){
  try{
    const raw=localStorage.getItem('ms-active-session');
    if(!raw)return null;
    const data=JSON.parse(raw);
    if(!data.entries||data.entries.length===0)return null;
    return data;
  }catch(e){return null;}
}
function restoreSession(data){
  App.entries=data.entries||[];
  App.speakers=data.speakers||[];
  App.nextEntryId=data.nextEntryId||1;
  App.nextSpkId=data.nextSpkId||1;
  App.activeSpkId=data.activeSpkId||null;
  App.elapsed=data.elapsed||0;
  App.sessionStartTime=data.sessionStartTime?new Date(data.sessionStartTime):null;
  App.noteFormat=data.noteFormat||'soap';
  renderEntries();renderSpeakers();updSpkCount();updWordCount();
  if(App.entries.length>0){
    D.genBtn.style.display='inline-flex';
    showDownloadBtns();
  }
  toast(`Session restored — ${App.entries.length} entries recovered`,'success',4000);
}

/* Load external corrections dictionary (Fix 4) */
async function loadCorrectionsDictionary(){
  try{
    const r=await fetch('corrections.json');
    if(r.ok){
      const data=await r.json();
      CORRECTIONS_DICT=data.map(item=>[new RegExp(item.pattern,item.flags||'gi'),item.replacement]);
      console.log(`[ClinicalFlow] Loaded ${CORRECTIONS_DICT.length} corrections from dictionary`);
    }else{
      throw new Error('Not found');
    }
  }catch(e){
    // Fall back to built-in defaults
    CORRECTIONS_DICT=DEFAULT_CORRECTIONS;
    console.log(`[ClinicalFlow] Using ${CORRECTIONS_DICT.length} built-in corrections`);
  }
}

/* 2. DOM CACHE */
const D={};
function cacheDOM(){
  const g=id=>document.getElementById(id);
  D.html=document.documentElement;
  D.statusBadge=g('statusBadge');D.statusText=g('statusText');D.timer=g('sessionTimer');D.wordCount=g('wordCount');
  D.connInd=g('connectionIndicator');D.connText=g('connectionText');
  D.speakerList=g('speakerList');D.speakerCount=g('speakerCount');D.addSpkBtn=g('addSpeakerBtn');D.fmtSel=g('formatSelector');
  D.txContent=g('transcriptContent');D.txEmpty=g('transcriptEmpty');D.txEntries=g('transcriptEntries');
  D.liveDot=g('liveDot');D.searchBar=g('searchBar');D.searchInput=g('searchInput');
  D.dlTxBtn=g('downloadTranscriptBtn');
  D.noteContent=g('noteContent');D.noteEmpty=g('noteEmpty');D.noteGen=g('noteGenerating');D.noteSec=g('noteSections');
  D.regenBtn=g('regenerateNoteBtn');D.copyBtn=g('copyNoteBtn');D.expPdfBtn=g('exportPdfBtn');
  D.recBtn=g('recordBtn');D.pauseBtn=g('pauseBtn');D.genBtn=g('generateNoteBtn');D.expBtn=g('exportBtn');
  D.dlAudioBtn=g('downloadAudioBtn');
  D.waveform=g('waveform');D.waveBars=D.waveform.querySelectorAll('.waveform-bar');
  D.actSpkBadge=g('activeSpeakerBadge');D.actSpkName=g('activeSpeakerName');D.actSpkDot=g('activeSpeakerDot');
  D.setOverlay=g('settingsOverlay');D.setDrawer=g('settingsDrawer');D.setClose=g('settingsCloseBtn');
  D.themeSw=g('themeSwitcher');D.dgInput=g('deepgramApiKey');D.dgSave=g('saveApiKeyBtn');
  D.dgStatus=g('apiKeyStatus');D.dgStatusText=g('apiKeyStatusText');D.langSel=g('languageSelect');
  D.newSessModal=g('newSessionModal');D.addSpkModal=g('addSpeakerModal');D.helpModal=g('helpModal');D.clearTxModal=g('clearTranscriptModal');
  D.toasts=g('toastContainer');
  D.pdfPrev=g('pdfPreview');D.pdfTitle=g('pdfTitle');D.pdfMeta=g('pdfMeta');D.pdfSec=g('pdfSections');D.pdfDate=g('pdfFooterDate');
  // Ollama
  D.aiEngineToggle=g('aiEngineToggle');D.ollamaSettings=g('ollamaSettings');
  D.ollamaUrl=g('ollamaUrl');D.ollamaTestBtn=g('ollamaTestBtn');
  D.ollamaStatus=g('ollamaStatus');D.ollamaStatusText=g('ollamaStatusText');
  D.ollamaModelSelect=g('ollamaModelSelect');D.ollamaRefreshBtn=g('ollamaRefreshBtn');
}

/* 3. UTILITIES */
const fmt=s=>`${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
const fmtDate=d=>d.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
const fmtDT=d=>d.toLocaleString('en-US',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
const wc=t=>t&&t.trim()?t.trim().split(/\s+/).length:0;
function esc(t){const d=document.createElement('div');d.textContent=t;return d.innerHTML;}
function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};}
const rInt=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;
const wait=ms=>new Promise(r=>setTimeout(r,ms));

/* 4. TOASTS */
function toast(msg,type='info',dur=3500){
  const ic={success:'<polyline points="20 6 9 17 4 12"/>',error:'<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',warning:'<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',info:'<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'};
  const el=document.createElement('div');el.className=`toast ${type}`;
  el.innerHTML=`<span class="toast-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ic[type]}</svg></span><span>${esc(msg)}</span>`;
  D.toasts.appendChild(el);setTimeout(()=>{el.classList.add('leaving');el.addEventListener('animationend',()=>el.remove());},dur);
}

/* 5. MODALS & SETTINGS */
function openModal(el){el.classList.add('visible');setTimeout(()=>{const f=el.querySelector('button,input,[tabindex]');if(f)f.focus();},100);}
function closeModal(el){el.classList.remove('visible');}
function closeAllModals(){document.querySelectorAll('.modal-overlay').forEach(m=>closeModal(m));}
function openSettings(){D.setOverlay.classList.add('visible');D.setDrawer.classList.add('visible');}
function closeSettings(){D.setOverlay.classList.remove('visible');D.setDrawer.classList.remove('visible');}

/* 6. THEME */
function setTheme(t){App.theme=t;D.html.setAttribute('data-theme',t);localStorage.setItem('ms-theme',t);D.themeSw.querySelectorAll('.theme-option').forEach(b=>b.classList.toggle('active',b.dataset.theme===t));}
function loadTheme(){setTheme(localStorage.getItem('ms-theme')||'dark');}

/* 7. SPEAKERS */
const ROLES={doctor:{label:'Physician',ab:'Dr',cc:'doctor'},patient:{label:'Patient',ab:'Pt',cc:'patient'},other:{label:'Other',ab:'Ot',cc:'other'}};
function addSpeaker(name,role='other'){const s={id:App.nextSpkId++,name,role,cc:ROLES[role]?.cc||'other',speaking:false,wc:0};App.speakers.push(s);renderSpeakers();updSpkCount();return s;}
function renameSpeaker(id,nm){const s=App.speakers.find(x=>x.id===id);if(s){s.name=nm;App.entries.forEach(e=>{if(e.spkId===id)e.spkName=nm;});renderSpeakers();renderEntries();}}
function setActiveSpk(id){App.speakers.forEach(s=>s.speaking=false);const s=App.speakers.find(x=>x.id===id);if(s){s.speaking=true;App.activeSpkId=id;D.actSpkBadge.style.display='flex';D.actSpkName.textContent=s.name;D.actSpkDot.style.background=`var(--speaker-${s.cc})`;}renderSpeakers();}
function getActiveSpk(){return App.speakers.find(s=>s.id===App.activeSpkId)||null;}
function updSpkCount(){D.speakerCount.textContent=`(${App.speakers.length})`;}
function detectSpkChange(lvl){if(!App.settings.autoDetect||App.speakers.length<2)return;const now=Date.now();if(lvl<0.02){if(!App.silStart)App.silStart=now;else if(now-App.silStart>App.silThresh&&now-App.lastSpkChange>3000){const i=App.speakers.findIndex(s=>s.id===App.activeSpkId);setActiveSpk(App.speakers[(i+1)%App.speakers.length].id);App.lastSpkChange=now;App.silStart=null;}}else App.silStart=null;}
function renderSpeakers(){
  D.speakerList.innerHTML='';
  App.speakers.forEach(sp=>{
    const c=document.createElement('div');c.className=`speaker-card${sp.id===App.activeSpkId?' active':''}${sp.speaking?' speaking':''}`;
    const ab=ROLES[sp.role]?.ab||sp.name.charAt(0).toUpperCase();
    c.innerHTML=`<div class="speaker-avatar ${sp.cc}"><span>${esc(ab)}</span><div class="speaking-indicator"></div></div><div class="speaker-info"><div class="speaker-name" data-sid="${sp.id}" title="Double-click to rename">${esc(sp.name)}</div><div class="speaker-role">${ROLES[sp.role]?.label||'Unknown'}</div></div><div class="speaker-volume"><div class="bar" style="height:${sp.speaking?rInt(4,12):4}px"></div><div class="bar" style="height:${sp.speaking?rInt(6,18):4}px"></div><div class="bar" style="height:${sp.speaking?rInt(4,14):4}px"></div><div class="bar" style="height:${sp.speaking?rInt(5,16):4}px"></div></div>`;
    c.addEventListener('click',()=>setActiveSpk(sp.id));
    const nm=c.querySelector('.speaker-name');
    nm.addEventListener('dblclick',e=>{e.stopPropagation();const inp=document.createElement('input');inp.type='text';inp.className='speaker-name-input';inp.value=sp.name;nm.replaceWith(inp);inp.focus();inp.select();const done=()=>renameSpeaker(sp.id,inp.value.trim()||sp.name);inp.addEventListener('blur',done);inp.addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();done();}if(ev.key==='Escape'){inp.value=sp.name;done();}});});
    D.speakerList.appendChild(c);
  });
}

/* 8. AUDIO & WAVEFORM */
async function initAudio(stream){try{App.audioCtx=new(window.AudioContext||window.webkitAudioContext)();App.analyser=App.audioCtx.createAnalyser();App.analyser.fftSize=256;App.analyser.smoothingTimeConstant=0.7;App.audioCtx.createMediaStreamSource(stream).connect(App.analyser);animWave();}catch(e){console.warn('Audio analysis unavailable:',e);}}
function animWave(){if(!App.isRecording||App.isPaused){resetWave();return;}const buf=new Uint8Array(App.analyser.frequencyBinCount);App.analyser.getByteFrequencyData(buf);const avg=buf.reduce((a,b)=>a+b,0)/buf.length/255;const n=D.waveBars.length;for(let i=0;i<n;i++){const v=buf[Math.floor(i/n*buf.length)]/255;D.waveBars[i].style.height=`${Math.max(4,v*32)}px`;D.waveBars[i].classList.remove('inactive');D.waveBars[i].style.background=avg>0.05?'var(--accent)':'var(--text-tertiary)';}detectSpkChange(avg);App.animFrame=requestAnimationFrame(animWave);}
function resetWave(){D.waveBars.forEach(b=>{b.style.height='4px';b.classList.add('inactive');b.style.background='';});if(App.animFrame){cancelAnimationFrame(App.animFrame);App.animFrame=null;}}
function stopAudio(){resetWave();if(App.audioCtx){App.audioCtx.close().catch(()=>{});App.audioCtx=null;App.analyser=null;}}

/* 9. AUDIO RECORDING (for download) */
function startAudioRecording(stream){
  try{
    const mime=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':MediaRecorder.isTypeSupported('audio/webm')?'audio/webm':'audio/mp4';
    App.mediaRecorder=new MediaRecorder(stream,{mimeType:mime});App.audioChunks=[];
    App.mediaRecorder.ondataavailable=e=>{if(e.data.size>0)App.audioChunks.push(e.data);};
    App.mediaRecorder.onstop=()=>{if(App.audioChunks.length>0){App.audioBlob=new Blob(App.audioChunks,{type:mime});showDownloadBtns();}};
    App.mediaRecorder.start(1000);
  }catch(e){console.warn('MediaRecorder not supported:',e);}
}
function stopAudioRecording(){if(App.mediaRecorder&&App.mediaRecorder.state!=='inactive')App.mediaRecorder.stop();}
function pauseAudioRecording(){if(App.mediaRecorder&&App.mediaRecorder.state==='recording')App.mediaRecorder.pause();}
function resumeAudioRecording(){if(App.mediaRecorder&&App.mediaRecorder.state==='paused')App.mediaRecorder.resume();}
function downloadAudio(){
  if(!App.audioBlob){toast('No audio recording available.','warning');return;}
  const ext=App.audioBlob.type.includes('webm')?'webm':'mp4';
  const url=URL.createObjectURL(App.audioBlob);const a=document.createElement('a');
  a.href=url;a.download=`ClinicalFlow_Audio_${new Date().toISOString().split('T')[0]}.${ext}`;
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);toast('Audio recording downloaded!','success');
}

/* 10. TRANSCRIPT DOWNLOAD */
function downloadTranscript(){
  if(App.entries.length===0){toast('No transcript to download.','warning');return;}
  const hdr=['ClinicalFlow — Transcript',`Date: ${fmtDate(App.sessionStartTime||new Date())}`,`Duration: ${fmt(App.elapsed)}`,`Speakers: ${App.speakers.map(s=>`${s.name} (${ROLES[s.role]?.label})`).join(', ')}`,`Words: ${App.entries.reduce((s,e)=>s+wc(e.text),0)}`,'─'.repeat(50),''].join('\n');
  const body=App.entries.map(e=>`[${fmt(e.ts)}] ${e.spkName} (${ROLES[e.spkRole]?.label||'Unknown'}):\n${e.text}\n`).join('\n');
  const blob=new Blob([hdr+body],{type:'text/plain'});const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`ClinicalFlow_Transcript_${new Date().toISOString().split('T')[0]}.txt`;
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);toast('Transcript downloaded!','success');
}

/* 11. DEEPGRAM REAL-TIME ASR */
function startDeepgram(){
  const key=App.dgKey;if(!key){toast('No Deepgram key. Using browser fallback.','warning');App.engine='webspeech';startWebSpeech();return;}
  const p=new URLSearchParams({model:'nova-3',language:App.language,smart_format:'true',punctuate:'true',interim_results:'true',utterance_end_ms:'1500',vad_events:'true',diarize:'true',encoding:'linear16',sample_rate:'16000',channels:'1'});
  const url='wss://api.deepgram.com/v1/listen?'+p.toString();
  try{
    App.dgSocket=new WebSocket(url,['token',key]);
    App.dgSocket.onopen=()=>{App.engine='deepgram';updConn('connected','Deepgram Nova-3');toast('Deepgram connected — speak now','success');App._audioChunks=0;startDGAudioPipeline();App.dgKA=setInterval(()=>{if(App.dgSocket&&App.dgSocket.readyState===WebSocket.OPEN)App.dgSocket.send(JSON.stringify({type:'KeepAlive'}));},8000);};
    App.dgSocket.onmessage=ev=>{if(typeof ev.data!=='string')return;try{handleDGMsg(JSON.parse(ev.data));}catch(err){console.error('[DG] parse error:',err);}};
    App.dgSocket.onerror=err=>{console.error('[DG] error:',err);toast('Deepgram connection failed. Falling back to browser.','error',5000);App.engine='webspeech';updConn('fallback','Browser ASR');startWebSpeech();};
    App.dgSocket.onclose=ev=>{clearInterval(App.dgKA);stopDGAudioPipeline();if(App.isRecording&&!App.isPaused&&App.engine==='deepgram'){if(ev.code===1008||ev.code===1003||ev.code===1002){toast('Deepgram auth failed. Check API key.','error',6000);App.engine='webspeech';updConn('fallback','Browser ASR');startWebSpeech();}else setTimeout(()=>{if(App.isRecording&&!App.isPaused)startDeepgram();},1000);}};
  }catch(e){console.error('[DG] init:',e);App.engine='webspeech';updConn('fallback','Browser ASR');startWebSpeech();}
}
function startDGAudioPipeline(){
  if(!App.stream)return;
  try{App.dgAudioCtx=new(window.AudioContext||window.webkitAudioContext)({sampleRate:16000});const src=App.dgAudioCtx.createMediaStreamSource(App.stream);const proc=App.dgAudioCtx.createScriptProcessor(4096,1,1);src.connect(proc);proc.connect(App.dgAudioCtx.destination);
  proc.onaudioprocess=e=>{if(App.isPaused||!App.dgSocket||App.dgSocket.readyState!==WebSocket.OPEN)return;const f=e.inputBuffer.getChannelData(0);const pcm=new Int16Array(f.length);for(let i=0;i<f.length;i++){const s=Math.max(-1,Math.min(1,f[i]));pcm[i]=s<0?s*0x8000:s*0x7FFF;}App.dgSocket.send(pcm.buffer);App._audioChunks++;};
  App.dgProcessor=proc;App.dgSource=src;}catch(err){console.error('[DG] pipeline:',err);}
}
function stopDGAudioPipeline(){if(App.dgProcessor){try{App.dgProcessor.disconnect();}catch(e){}App.dgProcessor=null;}if(App.dgSource){try{App.dgSource.disconnect();}catch(e){}App.dgSource=null;}if(App.dgAudioCtx){App.dgAudioCtx.close().catch(()=>{});App.dgAudioCtx=null;}}
function handleDGMsg(data){
  if(data.type==='Results'){const alt=data.channel.alternatives[0];const tx=alt.transcript;if(!tx||!tx.trim())return;
  if(alt.words&&alt.words.length>0&&alt.words[0].speaker!==undefined)handleDGSpk(alt.words[0].speaker);
  if(data.is_final){removePartial();addEntry(tx.trim(),alt.confidence||0.95);}else updatePartial(tx);}
  else if(data.type==='UtteranceEnd')removePartial();
}
function handleDGSpk(idx){if(idx<App.speakers.length){const t=App.speakers[idx];if(t.id!==App.activeSpkId){setActiveSpk(t.id);App.lastSpkChange=Date.now();}}else{const role=App.speakers.length===0?'doctor':App.speakers.length===1?'patient':'other';const s=addSpeaker('Speaker '+(App.speakers.length+1),role);setActiveSpk(s.id);}}
function stopDeepgram(){stopDGAudioPipeline();clearInterval(App.dgKA);if(App.dgSocket){if(App.dgSocket.readyState===WebSocket.OPEN){try{App.dgSocket.send(JSON.stringify({type:'CloseStream'}));}catch(e){}}App.dgSocket.close();App.dgSocket=null;}}

/* 12. WEB SPEECH API — FIXED: actually calls .start() */
function initWebSpeech(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)return false;
  App.recognition=new SR();App.recognition.continuous=true;App.recognition.interimResults=true;App.recognition.lang=App.language;App.recognition.maxAlternatives=1;
  App.recognition.onresult=ev=>{if(App.isPaused)return;for(let i=ev.resultIndex;i<ev.results.length;i++){const t=ev.results[i][0].transcript;if(ev.results[i].isFinal){removePartial();addEntry(t.trim(),ev.results[i][0].confidence);}else updatePartial(t);}};
  App.recognition.onerror=ev=>{if(ev.error==='no-speech'||ev.error==='aborted')return;if(ev.error==='not-allowed'||ev.error==='service-not-allowed'){toast('Microphone denied.','error',6000);stopRecording();return;}if(App.isRecording&&!App.isPaused)setTimeout(()=>{try{App.recognition.start();}catch(e){}},500);};
  App.recognition.onend=()=>{if(App.isRecording&&!App.isPaused&&App.engine==='webspeech')setTimeout(()=>{try{App.recognition.start();}catch(e){}},200);};
  return true;
}
function startWebSpeech(){
  if(!App.recognition&&!initWebSpeech()){toast('No speech recognition. Use Chrome/Edge or add Deepgram key.','error',8000);return;}
  App.recognition.lang=App.language;updConn('fallback','Browser ASR');
  try{App.recognition.start();}catch(e){console.warn('Web Speech start:',e.message);}
}
function stopWebSpeech(){if(App.recognition){try{App.recognition.stop();}catch(e){}}}

/* 13. CONNECTION INDICATOR */
function updConn(status,text){D.connInd.className='connection-indicator';if(status==='connected')D.connInd.classList.add('connected');else if(status==='fallback')D.connInd.classList.add('fallback');D.connText.textContent=text;}

/* 14. TRANSCRIPT */
const MED_TERMS=['hypertension','diabetes','mellitus','hyperlipidemia','asthma','COPD','pneumonia','bronchitis','tachycardia','bradycardia','arrhythmia','myocardial','infarction','stroke','seizure','fracture','laceration','contusion','edema','inflammation','infection','anemia','thyroid','renal','hepatic','cardiac','pulmonary','neurological','gastrointestinal','musculoskeletal','diaphoresis','dyspnea','cyanosis','orthopnea','syncope','vertigo','nausea','emesis','diarrhea','constipation','hematuria','dysuria','costochondritis','fibromyalgia','osteoarthritis','rheumatoid','migraine','aura'];
const MED_RX=['metformin','lisinopril','amlodipine','atorvastatin','omeprazole','metoprolol','losartan','albuterol','gabapentin','hydrochlorothiazide','sertraline','amoxicillin','azithromycin','prednisone','ibuprofen','acetaminophen','aspirin','warfarin','insulin','levothyroxine','sumatriptan','amitriptyline','topiramate'];
function hlTerms(text){let r=text;MED_TERMS.forEach(t=>{r=r.replace(new RegExp(`\\b(${t})\\b`,'gi'),'<span class="medical-term">$1</span>');});MED_RX.forEach(t=>{r=r.replace(new RegExp(`\\b(${t})\\b`,'gi'),'<span class="medication-term">$1</span>');});return r;}

function addEntry(text,conf=1){
  if(!text.trim())return;
  if(!getActiveSpk()&&App.speakers.length===0){addSpeaker('Doctor','doctor');addSpeaker('Patient','patient');setActiveSpk(App.speakers[0].id);}
  const sp=getActiveSpk();const e={id:App.nextEntryId++,spkId:sp?.id||0,spkName:sp?.name||'Unknown',spkRole:sp?.role||'unknown',spkColor:sp?.cc||'unknown',text:text.trim(),ts:App.elapsed,conf};
  App.entries.push(e);if(sp)sp.wc+=wc(text);removePartial();renderOneEntry(e);updWordCount();
  if(App.settings.autoScroll)D.txContent.scrollTop=D.txContent.scrollHeight;
  saveSession(); // Auto-save after every entry
}
function updatePartial(text){
  let el=document.getElementById('partialEntry');const sp=getActiveSpk();
  if(!el){el=document.createElement('div');el.className='transcript-entry';el.id='partialEntry';
    el.innerHTML=`<div class="entry-speaker-indicator ${sp?.cc||'unknown'}"></div><div class="entry-content"><div class="entry-header"><span class="entry-speaker-name ${sp?.cc||'unknown'}">${esc(sp?.name||'Unknown')}</span><span class="entry-timestamp">${fmt(App.elapsed)}</span></div><div class="entry-text partial"><span class="partial-text"></span><span class="typing-cursor"></span></div></div>`;
    D.txEntries.appendChild(el);D.txEmpty.style.display='none';D.txEntries.style.display='block';}
  const t=el.querySelector('.partial-text');if(t)t.textContent=text;
  if(App.settings.autoScroll)D.txContent.scrollTop=D.txContent.scrollHeight;
}
function removePartial(){const el=document.getElementById('partialEntry');if(el)el.remove();}
function renderOneEntry(e){
  D.txEmpty.style.display='none';D.txEntries.style.display='block';
  const el=document.createElement('div');el.className='transcript-entry';el.dataset.entryId=e.id;
  const ts=App.settings.timestamps?`<span class="entry-timestamp">${fmt(e.ts)}</span>`:'';
  const confH=e.conf<0.8?`<div class="confidence-bar"><div class="confidence-fill ${e.conf>0.6?'medium':'low'}" style="width:${Math.round(e.conf*100)}%"></div></div>`:'';
  let txt=esc(e.text);if(App.settings.highlightTerms)txt=hlTerms(txt);
  el.innerHTML=`<div class="entry-speaker-indicator ${e.spkColor}"></div><div class="entry-content"><div class="entry-header"><span class="entry-speaker-name ${e.spkColor}">${esc(e.spkName)}</span>${ts}</div><div class="entry-text">${txt}</div>${confH}</div>`;
  D.txEntries.appendChild(el);
}
function renderEntries(){D.txEntries.innerHTML='';if(App.entries.length===0){D.txEmpty.style.display='flex';D.txEntries.style.display='none';return;}D.txEmpty.style.display='none';D.txEntries.style.display='block';App.entries.forEach(e=>renderOneEntry(e));}
function clearTx(){App.entries=[];App.nextEntryId=1;D.txEntries.innerHTML='';D.txEmpty.style.display='flex';D.txEntries.style.display='none';updWordCount();toast('Transcript cleared','info');}
function updWordCount(){const t=App.entries.reduce((s,e)=>s+wc(e.text),0);D.wordCount.textContent=`${t} word${t!==1?'s':''}`;}

/* ──── END OF PART 1 — Recording, Note Gen, Export, Events, Demo in Part 2 ──── */

/* 15. RECORDING CONTROLS */
async function startRecording(){
  try{
    // ALWAYS start fresh when recording — prevents ANY transcript bleed
    if(App.entries.length>0){
      newSession();
      await wait(150);
      toast('Previous session cleared — starting fresh','info',2000);
    }

    App.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
    const track=App.stream.getAudioTracks()[0];
    if(track.muted)toast('Microphone is muted! Serve via HTTP, not file://.','error',12000);
    await initAudio(App.stream);
    startAudioRecording(App.stream);
    App.isRecording=true;App.isPaused=false;App.sessionStartTime=App.sessionStartTime||new Date();
    if(App.speakers.length===0){addSpeaker('Doctor','doctor');addSpeaker('Patient','patient');setActiveSpk(App.speakers[0].id);}
    startTimer();updateRecUI(true);
    if(App.dgKey)startDeepgram();else startWebSpeech();
    toast('Recording started','success');
  }catch(err){
    if(err.name==='NotAllowedError')toast('Microphone access denied.','error',6000);
    else if(err.name==='NotFoundError')toast('No microphone found.','error',6000);
    else toast('Failed to start recording.','error');
  }
}
function stopRecording(){
  if(App.engine==='deepgram')stopDeepgram();else stopWebSpeech();
  stopAudioRecording();
  if(App.stream){App.stream.getTracks().forEach(t=>t.stop());App.stream=null;}
  stopAudio();stopTimer();
  App.isRecording=false;App.isPaused=false;removePartial();
  App.speakers.forEach(s=>s.speaking=false);renderSpeakers();updateRecUI(false);
  if(App.entries.length>0){D.genBtn.style.display='inline-flex';showDownloadBtns();}
  toast('Recording stopped','info');
}
function pauseRecording(){
  if(!App.isRecording)return;
  if(App.isPaused){
    App.isPaused=false;
    if(App.engine==='deepgram')startDeepgram();else{try{App.recognition.start();}catch(e){}}
    resumeAudioRecording();startTimer();animWave();updStatus('recording');
    D.pauseBtn.querySelector('svg').innerHTML='<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>';
    toast('Resumed','success');
  }else{
    App.isPaused=true;
    if(App.engine==='deepgram')stopDeepgram();else{try{App.recognition.stop();}catch(e){}}
    pauseAudioRecording();stopTimer();resetWave();removePartial();updStatus('paused');
    D.pauseBtn.querySelector('svg').innerHTML='<polygon points="5 3 19 12 5 21 5 3"/>';
    toast('Paused','warning');
  }
}
function toggleRec(){App.isRecording?stopRecording():startRecording();}
function startTimer(){if(App.timerInterval)return;App.timerInterval=setInterval(()=>{App.elapsed++;D.timer.textContent=fmt(App.elapsed);},1000);}
function stopTimer(){if(App.timerInterval){clearInterval(App.timerInterval);App.timerInterval=null;}}
function resetTimer(){stopTimer();App.elapsed=0;D.timer.textContent='00:00';}
function updateRecUI(on){
  D.recBtn.classList.toggle('recording',on);D.recBtn.setAttribute('aria-label',on?'Stop recording':'Start recording');
  D.pauseBtn.style.display=on?'flex':'none';D.liveDot.classList.toggle('visible',on);
  if(on){updStatus('recording');D.genBtn.style.display='none';D.actSpkBadge.style.display='flex';}
  else{updStatus('ready');D.actSpkBadge.style.display='none';}
}
function updStatus(s){
  D.statusBadge.className='session-badge';
  if(s==='recording'){D.statusBadge.classList.add('recording');D.statusText.textContent='Recording';}
  else if(s==='paused'){D.statusBadge.classList.add('paused');D.statusText.textContent='Paused';}
  else if(s==='generating'){D.statusText.textContent='Generating...';}
  else{D.statusText.textContent='Ready';}
}
function showDownloadBtns(){
  if(D.dlTxBtn&&App.entries.length>0)D.dlTxBtn.style.display='flex';
  if(D.dlAudioBtn&&App.audioBlob)D.dlAudioBtn.style.display='inline-flex';
}
function hideDownloadBtns(){
  if(D.dlTxBtn)D.dlTxBtn.style.display='none';
  if(D.dlAudioBtn)D.dlAudioBtn.style.display='none';
}

/* ──────────────────────────────────────────────────────────
   15b. OLLAMA INTEGRATION
   ────────────────────────────────────────────────────────── */

/* Check if Ollama is reachable */
async function ollamaCheck(){
  updOllamaStatus('checking','Connecting...');
  try{
    const r=await fetch(App.ollamaUrl+'/api/tags',{signal:AbortSignal.timeout(5000)});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const data=await r.json();
    App.ollamaConnected=true;
    App.ollamaModels=(data.models||[]).map(m=>m.name);
    populateModelSelect();
    const count=App.ollamaModels.length;
    updOllamaStatus('connected',`Connected — ${count} model${count!==1?'s':''} available`);
    return true;
  }catch(e){
    App.ollamaConnected=false;
    App.ollamaModels=[];
    populateModelSelect();
    updOllamaStatus('disconnected','Not connected — is Ollama running?');
    return false;
  }
}

/* Update the status indicator in settings */
function updOllamaStatus(state,text){
  D.ollamaStatus.className='ollama-status '+state;
  D.ollamaStatusText.textContent=text;
}

/* Populate the model dropdown from discovered models */
function populateModelSelect(){
  D.ollamaModelSelect.innerHTML='';
  if(App.ollamaModels.length===0){
    D.ollamaModelSelect.innerHTML='<option value="">No models found</option>';
    D.ollamaModelSelect.disabled=true;
    return;
  }
  D.ollamaModelSelect.disabled=false;
  App.ollamaModels.forEach(m=>{
    const opt=document.createElement('option');
    opt.value=m;opt.textContent=m;
    D.ollamaModelSelect.appendChild(opt);
  });
  // Restore saved selection or pick first
  const saved=localStorage.getItem('ms-ollama-model');
  if(saved&&App.ollamaModels.includes(saved)){
    D.ollamaModelSelect.value=saved;
    App.ollamaModel=saved;
  }else{
    App.ollamaModel=App.ollamaModels[0];
    D.ollamaModelSelect.value=App.ollamaModel;
  }
}

/* Save/load Ollama settings */
function saveOllamaSettings(){
  localStorage.setItem('ms-ollama-url',App.ollamaUrl);
  localStorage.setItem('ms-ollama-model',App.ollamaModel);
  localStorage.setItem('ms-ai-engine',App.aiEngine);
  localStorage.setItem('ms-ollama-verify',App.ollamaVerify?'1':'0');
}
function loadOllamaSettings(){
  App.ollamaUrl=localStorage.getItem('ms-ollama-url')||'http://localhost:11434';
  App.ollamaModel=localStorage.getItem('ms-ollama-model')||'llama3.1:8b';
  App.aiEngine=localStorage.getItem('ms-ai-engine')||'ollama';
  App.ollamaVerify=localStorage.getItem('ms-ollama-verify')==='1';
  if(D.ollamaUrl)D.ollamaUrl.value=App.ollamaUrl;
  // Set engine toggle
  if(D.aiEngineToggle){
    D.aiEngineToggle.querySelectorAll('.ai-engine-option').forEach(b=>{
      b.classList.toggle('active',b.dataset.engine===App.aiEngine);
    });
    D.ollamaSettings.style.display=App.aiEngine==='ollama'?'block':'none';
  }
  // Set verify toggle
  const vt=document.getElementById('settingOllamaVerify');
  if(vt){vt.classList.toggle('active',App.ollamaVerify);vt.setAttribute('aria-checked',App.ollamaVerify);}
}

/* Build the clinical prompt for Ollama — general-purpose, no scenario-specific content */
function buildClinicalPrompt(transcript,format){
  const formatInstructions={
    soap:`Use EXACTLY these section headers. OMIT any section that has no evidence in the transcript.

**SUBJECTIVE**
Chief Complaint: [ALL problems discussed, separated by semicolons]
HPI: [For EACH problem: onset, duration, location, character, severity, aggravating/alleviating factors. Include all patient-reported numbers.]
Associated Symptoms: [Symptoms the patient confirmed or volunteered]
Pertinent Negatives: [ONLY symptoms the doctor specifically asked about AND the patient explicitly denied]
Current Medications: [Meds patient was already taking BEFORE this visit, with doses]
Allergies:
Family/Social History:

**OBJECTIVE**
Vital Signs: [Every vital sign stated by any speaker, with exact numbers and units]
Physical Examination: [Every exam finding stated by the doctor. Only include body systems actually examined.]

**ASSESSMENT**
[All diagnoses or impressions discussed, numbered if multiple]

**PLAN**
Medications Continued: [Meds kept the same, with doses]
New Medications Started: [Meds prescribed today — name, dose, frequency, instructions]
Medications Discontinued: [Meds stopped, with reason]
Medications Adjusted: [Dose changes — old dose to new dose]
Labs/Tests Ordered: [All ordered]
Referrals: [Specialty and provider name if given]
Procedures Performed:
Follow-Up: [Exact timeframe as stated]
Patient Education: [ONLY what the doctor actually said]
Safety Net: [ONLY if the doctor stated specific warning signs]`,

    hpi:`Use EXACTLY these section headers. OMIT any section that has no evidence in the transcript.

**PATIENT DEMOGRAPHICS**
Visit Date: [use date below]
Duration: [use duration below]
Participants: [use speakers below]

**CHIEF COMPLAINT**
[All reasons for the visit]

**HISTORY OF PRESENT ILLNESS**
[Narrative for each problem: onset, location, duration, character, severity, timing, context, modifying factors, associated symptoms. Include patient-reported numbers.]

**REVIEW OF SYSTEMS**
[Only include body systems that were actually discussed. For each, list positive and negative findings. Do not list systems that were never mentioned.]

**PHYSICAL EXAMINATION**
Vital Signs: [exact numbers with units]
[All exam findings by body area. Only include systems actually examined.]

**ASSESSMENT & PLAN**
[For each problem: diagnosis, treatment, medications, labs, referrals, follow-up]`,

    problem:`Use EXACTLY these section headers. OMIT any section that has no evidence in the transcript.

**VISIT OVERVIEW**
Date: [use date below] | Duration: [use duration below]
Participants: [use speakers below]
Chief Complaint: [all reasons for visit]

[Create a numbered section for EACH distinct problem discussed:]

**PROBLEM 1: [Name]**
Subjective: [patient-reported symptoms, history, pertinent negatives]
Objective: [relevant exam findings]
Assessment: [diagnosis/impression]
Plan: [treatment, medications, labs, referrals, follow-up]

[Add more problems as needed]

**MEDICATIONS SUMMARY**
Continued: [name, dose]
New: [name, dose, frequency]
Discontinued: [name, reason]
Adjusted: [name, old dose to new dose]

**FOLLOW-UP**
[Return timeframe and instructions as stated by provider]`
  };

  return `You are a medical scribe. Generate a clinical note from this transcript.

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
- Patient-reported information → SUBJECTIVE. Doctor's observations → OBJECTIVE.
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

${formatInstructions[format]||formatInstructions.soap}

Visit Date: ${fmtDate(App.sessionStartTime||new Date())}
Session Duration: ${fmt(App.elapsed)}
Speakers: ${App.speakers.map(s=>`${s.name} (${s.role})`).join(', ')||'Unknown'}

TRANSCRIPT:
---
${transcript}
---

Generate the clinical note now. Only include information with direct evidence in the transcript. Omit any section that has no evidence.`;
}


/* Format the raw transcript for the prompt */
function formatTxForPrompt(){
  return App.entries.map(e=>{
    const role=e.spkRole==='doctor'?'Doctor':e.spkRole==='patient'?'Patient':e.spkName;
    const ts=fmt(e.ts);
    return `[${ts}] ${role}: ${e.text}`;
  }).join('\n');
}

/* Build the verification/correction prompt (Pass 2) — strict evidence inquisitor */
function buildVerificationPrompt(transcript,draftNote){
  return `You are a clinical note auditor. Your ONLY job is to find hallucinations and remove them.

TRANSCRIPT:
${transcript}

DRAFT NOTE:
${draftNote}

AUDIT METHOD — for every line in the draft note:
1. Find the exact quote in the transcript that supports it.
2. If you CANNOT find a supporting quote, DELETE that line.
3. Be especially aggressive with Pertinent Negatives — if the doctor never asked about a symptom and the patient never said "no," delete the denial.
4. Check every medication name against what was actually said in the transcript.
5. Check every vital sign number against the transcript.
6. Check Safety Net and Patient Education — remove anything the doctor did not explicitly say.

SAFETY CHECK:
If the patient expressed ANY thoughts of self-harm, suicidal ideation, or harm to others, these must NEVER appear under Pertinent Negatives. Move them to Associated Symptoms.

If you find errors, respond:
ERRORS:
- [list each error with what should be deleted or moved]
CORRECTED NOTE:
[full corrected note with hallucinations removed and errors fixed]

If no errors: NO ISSUES FOUND`;
}

/* Extract the corrected note from the verification response */
function extractCorrectedNote(verifyText){
  const marker='CORRECTED NOTE:';
  const idx=verifyText.indexOf(marker);
  if(idx!==-1) return verifyText.substring(idx+marker.length).trim();
  const lowerIdx=verifyText.toLowerCase().indexOf('corrected note:');
  if(lowerIdx!==-1) return verifyText.substring(lowerIdx+'corrected note:'.length).trim();
  return verifyText;
}

/* Post-process note text — uses loaded corrections dictionary */
function postProcessNote(text,transcript){
  let result=text;

  // === MEDICAL TERM CORRECTIONS (from dictionary) ===
  for(const[pattern,replacement] of CORRECTIONS_DICT){
    result=result.replace(pattern,replacement);
  }

  // === CONTEXT-AWARE DRUG CORRECTION ===
  // Lipitor vs glipizide: if the note says "Lipitor" in a diabetes context, it's likely glipizide
  if(/diabetes|blood sugar|glucose|A1C|fasting|hyperglycemia/i.test(result)||/diabetes|blood sugar|glucose|A1C|fasting/i.test(transcript)){
    result=result.replace(/\bLipitor\b(?=.*(?:daily with breakfast|once daily|diabetes|blood sugar|glucose))/gi,'glipizide');
  }

  // === REMOVE INSTRUCTION LEAKS ===
  const leakPatterns=[
    /^[-*\s]*If no (?:exam|symptoms|findings).*$/gm,
    /^[-*\s]*Use the.*section headers.*$/gm,
    /^[-*\s]*Output ONLY.*$/gm,
    /^[-*\s]*Do not (?:use the instructional|output these).*$/gm,
    /^[-*\s]*Generate the (?:note|clinical).*$/gm,
    /^[-*\s]*Use short clean labels.*$/gm,
    /^[-*\s]*Never echo.*instructions.*$/gm,
    /^[-*\s]*\[use (?:date|duration|speakers) (?:below|provided|above)\].*$/gmi,
    /^[-*\s]*\[(?:list all|all reasons|if mentioned|if any|exact numbers|every vital)\].*$/gmi,
  ];
  for(const pat of leakPatterns){
    result=result.replace(pat,'');
  }

  // === VITAL SIGN SANITY CHECKS ===
  // Fix impossible BP readings where speech-to-text dropped a leading digit
  result=result.replace(/((?:blood pressure|BP|systolic)[:\s]*?)(\d{1,3})(\s*[/\\]\s*)(\d{1,3})/gi,(match,prefix,sys,sep,dia)=>{
    const s=parseInt(sys),d=parseInt(dia);
    if(s<50&&(s+100)>=80&&(s+100)<=250) return prefix+String(s+100)+sep+dia;
    if(s<50&&(s+10)>=80&&(s+10)<=250) return prefix+String(s+10)+sep+dia;
    return match;
  });

  // Fix impossible heart rates (should be 40-200)
  result=result.replace(/((?:heart rate|HR|pulse)[:\s]*)(\d{1,3})\s*(?:bpm|beats)/gi,(match,prefix,hr)=>{
    const h=parseInt(hr);
    if(h<10&&(h*10)>=40&&(h*10)<=200) return match.replace(hr,String(h*10));
    return match;
  });

  // === CLEAN UP ===
  result=result.replace(/^[-*\s]*(?:None stated|None discussed|Not mentioned|None documented|N\/A)\s*$/gm,'');
  result=result.replace(/\n{3,}/g,'\n\n').trim();

  return result;
}

/* Generate note via Ollama with streaming */
async function generateOllamaNote(){
  const transcript=formatTxForPrompt();
  const prompt=buildClinicalPrompt(transcript,App.noteFormat);
  const doVerify=App.ollamaVerify;
  console.log('[ClinicalFlow] Generating note. Verification pass:',doVerify?'ON':'OFF');

  // Show generating state
  D.noteEmpty.style.display='none';D.noteSec.style.display='block';D.noteGen.style.display='none';
  updStatus('generating');

  // Create a single streaming section that will fill in
  D.noteSec.innerHTML='';
  const streamEl=document.createElement('div');
  streamEl.className='note-section';
  const passLabel=doVerify?'Pass 1/2':'';
  streamEl.innerHTML=`<div class="note-section-header"><span class="note-section-title">${passLabel?passLabel+' — ':''}Generating with ${esc(App.ollamaModel)}...</span></div><div class="note-section-body streaming" id="streamingNoteBody"></div>`;
  D.noteSec.appendChild(streamEl);
  const bodyEl=document.getElementById('streamingNoteBody');

  let fullText='';

  try{
    // ── PASS 1: Generate the note ──
    fullText=await streamOllamaResponse(prompt,bodyEl,0.3,4096);
    bodyEl.classList.remove('streaming');

    // ── PASS 2: Verify (optional) ──
    if(doVerify&&fullText.length>50){
      console.log('[ClinicalFlow] Starting verification pass...');
      streamEl.querySelector('.note-section-title').textContent='Pass 2/2 — Verifying accuracy...';
      bodyEl.classList.add('streaming');

      const verifyPrompt=buildVerificationPrompt(transcript,fullText);
      const verifyText=await streamOllamaResponse(verifyPrompt,null,0.1,2048);

      const hasCorrections=verifyText.toLowerCase().includes('corrected note');
      if(hasCorrections){
        fullText=extractCorrectedNote(verifyText);
        toast('Verification — corrections applied','success');
      }else{
        toast('Verification — note is accurate','success');
      }
      bodyEl.classList.remove('streaming');
    }

    // Post-process: programmatic corrections (drug names, instruction leaks, cleanup)
    fullText=postProcessNote(fullText,transcript);

    // Parse final note into sections
    const sections=parseOllamaResponse(fullText);
    App.noteSections=sections;
    App.noteGenerated=true;
    renderNoteSec(sections);
    D.regenBtn.style.display='flex';D.copyBtn.style.display='flex';D.expPdfBtn.style.display='flex';D.expBtn.style.display='inline-flex';
    updStatus('ready');
    toast('Clinical note ready for review','success');

  }catch(e){
    if(e.name==='AbortError'){
      console.log('[ClinicalFlow] Note generation was cancelled');
      toast('Generation cancelled','info');
      updStatus('ready');
      return;
    }
    console.error('Ollama generation error:',e);
    if(bodyEl)bodyEl.classList.remove('streaming');
    toast(`Ollama error: ${e.message}. Falling back to rule-based.`,'error',6000);
    await generateRuleBasedNote();
  }
}

/* Shared streaming helper — streams Ollama response, optionally renders to an element */
async function streamOllamaResponse(prompt,renderEl,temperature,numCtx){
  // Cancel any existing in-flight request (Fix 5: race condition prevention)
  if(ollamaAbortCtrl){ollamaAbortCtrl.abort();ollamaAbortCtrl=null;}
  ollamaAbortCtrl=new AbortController();

  const r=await fetch(App.ollamaUrl+'/api/generate',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    signal:ollamaAbortCtrl.signal,
    body:JSON.stringify({
      model:App.ollamaModel,
      prompt:prompt,
      stream:true,
      options:{temperature:temperature||0.3,num_ctx:numCtx||4096}
    })
  });

  if(!r.ok){
    const err=await r.text();
    throw new Error(`Ollama returned ${r.status}: ${err}`);
  }

  const reader=r.body.getReader();
  const decoder=new TextDecoder();
  let fullText='';

  try{
    while(true){
      const{done,value}=await reader.read();
      if(done)break;
      const chunk=decoder.decode(value,{stream:true});
      const lines=chunk.split('\n').filter(l=>l.trim());
      for(const line of lines){
        try{
          const j=JSON.parse(line);
          if(j.response){
            fullText+=j.response;
            if(renderEl){
              renderEl.innerHTML=formatNoteMarkdown(fullText);
              renderEl.closest('.note-section')?.scrollIntoView({block:'end',behavior:'smooth'});
            }
          }
        }catch(e){/* skip malformed JSON chunks */}
      }
    }
  }catch(e){
    if(e.name==='AbortError'){
      console.log('[ClinicalFlow] Generation cancelled');
      throw e; // Re-throw so caller can handle
    }
    throw e;
  }finally{
    ollamaAbortCtrl=null;
  }
  return fullText;
}

/* Convert markdown-ish Ollama output to simple HTML for display */
function formatNoteMarkdown(text){
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
    .replace(/\n/g,'<br>');
}

/* Parse Ollama's response text into structured sections */
function parseOllamaResponse(text){
  // Try to parse as JSON first (Fix 2: supports JSON mode if enabled later)
  try{
    const trimmed=text.trim();
    if(trimmed.startsWith('{')){
      const json=JSON.parse(trimmed);
      const parts=Object.entries(json).map(([key,val],i)=>({
        key:`ai-section-${i}`,
        title:key.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()),
        content:typeof val==='string'?val:JSON.stringify(val,null,2)
      }));
      if(parts.length>0){
        const formatTitles={soap:'SOAP Note',hpi:'HPI-Focused Note',problem:'Problem-Oriented Note'};
        return{title:formatTitles[App.noteFormat]||'Clinical Note',sections:parts};
      }
    }
  }catch(e){/* Not JSON, proceed with text parsing */}

  // Multi-format header detection — handles various LLM output styles
  // Matches: **HEADER**, # HEADER, ## HEADER, === HEADER ===, HEADER:, ---HEADER---
  const headerPatterns=[
    /\*\*([A-Z][A-Z &/\-:()0-9]+(?:\[.*?\])?)\**/g,  // **SUBJECTIVE**
    /^#{1,3}\s+([A-Z][A-Z &/\-:()0-9]+)/gm,            // # SUBJECTIVE or ## SUBJECTIVE
    /^={3,}\s*([A-Z][A-Z &/\-:()0-9]+)\s*={3,}/gm,     // === SUBJECTIVE ===
  ];

  let parts=[];
  for(const regex of headerPatterns){
    let lastIdx=0,lastTitle=null,match;
    regex.lastIndex=0;
    const tempParts=[];
    while((match=regex.exec(text))!==null){
      if(lastTitle!==null){
        tempParts.push({title:lastTitle,content:text.substring(lastIdx,match.index).trim()});
      }
      lastTitle=match[1].trim();
      lastIdx=match.index+match[0].length;
    }
    if(lastTitle!==null){
      tempParts.push({title:lastTitle,content:text.substring(lastIdx).trim()});
    }
    if(tempParts.length>parts.length) parts=tempParts; // Use whichever pattern found the most sections
  }

  // Fallback: try splitting on lines that look like "Subjective:" or "PLAN:"
  if(parts.length===0){
    const colonHeaders=/^([A-Z][A-Za-z &/\-()]+):$/gm;
    let lastIdx=0,lastTitle=null,match;
    while((match=colonHeaders.exec(text))!==null){
      if(lastTitle!==null){
        parts.push({title:lastTitle,content:text.substring(lastIdx,match.index).trim()});
      }
      lastTitle=match[1].trim();
      lastIdx=match.index+match[0].length;
    }
    if(lastTitle!==null){
      parts.push({title:lastTitle,content:text.substring(lastIdx).trim()});
    }
  }

  // If still no sections found, treat entire text as single section
  if(parts.length===0){
    parts.push({title:'Clinical Note',content:text.trim()});
  }

  const sections=parts.map((p,i)=>({
    key:`ai-section-${i}`,
    title:p.title.replace(/\*+|#+|=+/g,'').trim(),
    content:p.content.replace(/^\n+|\n+$/g,'').replace(/\*\*([^*]+)\*\*/g,'$1')
  }));

  const formatTitles={soap:'SOAP Note',hpi:'HPI-Focused Note',problem:'Problem-Oriented Note'};
  return{title:formatTitles[App.noteFormat]||'Clinical Note',sections};
}

/* 16. CLINICAL NOTE GENERATION — routes to Ollama or rule-based */
async function generateNote(){
  if(App.entries.length===0){toast('No transcript to generate from.','warning');return;}
  if(App.isRecording){toast('Stop recording first.','warning');return;}

  if(App.aiEngine==='ollama'&&App.ollamaConnected){
    await generateOllamaNote();
  }else{
    if(App.aiEngine==='ollama'&&!App.ollamaConnected){
      toast('Ollama not connected. Using rule-based fallback.','warning',4000);
    }
    await generateRuleBasedNote();
  }
}

async function generateRuleBasedNote(){
  D.noteEmpty.style.display='none';D.noteSec.style.display='none';D.noteGen.style.display='flex';updStatus('generating');
  await wait(1800);
  const a=analyzeTx();let sections;
  switch(App.noteFormat){case 'soap':sections=genSOAP(a);break;case 'hpi':sections=genHPI(a);break;case 'problem':sections=genProblem(a);break;default:sections=genSOAP(a);}
  App.noteSections=sections;App.noteGenerated=true;renderNoteSec(sections);
  D.noteGen.style.display='none';D.noteSec.style.display='block';
  D.regenBtn.style.display='flex';D.copyBtn.style.display='flex';D.expPdfBtn.style.display='flex';D.expBtn.style.display='inline-flex';
  updStatus('ready');toast('Clinical note generated','success');
}

/* Analyze transcript — extract structured medical data */
function analyzeTx(){
  const docE=App.entries.filter(e=>e.spkRole==='doctor');
  const patE=App.entries.filter(e=>e.spkRole==='patient');
  const all=App.entries.map(e=>e.text).join(' ').toLowerCase();
  const patTx=patE.map(e=>e.text).join(' ');
  const docTx=docE.map(e=>e.text).join(' ');

  // Chief complaint: first substantive patient statement
  let cc='Not documented';
  if(patE.length>0){
    const sub=patE.find(e=>e.text.split(/\s+/).length>4);
    cc=sub?sub.text:patE[0].text;
    if(cc.length>200)cc=cc.substring(0,197)+'...';
  }

  // Symptoms
  const symKw=['pain','ache','fever','cough','fatigue','dizzy','dizziness','nausea','headache','swelling','bleeding','weakness','numbness','tingling','shortness of breath','chest pain','back pain','abdominal pain','sore throat','rash','vomiting'];
  const syms=symKw.filter(s=>all.includes(s));
  const meds=MED_RX.filter(m=>all.includes(m.toLowerCase()));

  // Vitals
  const vitals=[];
  const vr=/(?:bp|blood pressure)[:\s]*(\d+\/\d+)|(?:heart rate|hr|pulse)[:\s]*(\d+)|(?:temp|temperature)[:\s]*([\d.]+)|(?:o2|oxygen|spo2|sat)[:\s]*(\d+)|(?:resp|respiratory)[:\s]*(\d+)/gi;
  let m;while((m=vr.exec(all))!==null){if(m[1])vitals.push(`BP: ${m[1]}`);if(m[2])vitals.push(`HR: ${m[2]}`);if(m[3])vitals.push(`Temp: ${m[3]}`);if(m[4])vitals.push(`SpO2: ${m[4]}%`);if(m[5])vitals.push(`RR: ${m[5]}`);}

  // Patient history — filter out short yes/no responses
  const patHist=patE.map(e=>e.text).filter(s=>s.split(/\s+/).length>3);
  const patientHistory=patHist.length>0?patHist.join('\n\n'):'Patient history not captured in transcript.';

  // Doctor exam findings — only what was actually said
  const examKw=['blood pressure','heart rate','pulse','temperature','oxygen','spo2','normal','abnormal','tender','swollen','clear','breath sounds','heart sounds','regular','irregular','murmur','soft','non-tender','alert','oriented','afebrile','well-appearing','no distress','lungs clear','intact','exam','neurological','cranial nerves','focal','deficit'];
  const examStmts=docE.filter(e=>examKw.some(k=>e.text.toLowerCase().includes(k))).map(e=>e.text);
  const examFindings=examStmts.length>0?examStmts.join('\n'):'Physical examination findings not documented in transcript.\n[Provider to complete exam documentation]';

  // Duration extraction
  const durMatch=patTx.match(/(?:for\s+(?:about\s+)?)?(\d+)\s*(day|week|month|year)s?\b/i);
  const duration=durMatch?durMatch[0]:null;

  return{cc,patTx,docTx,all,syms,meds,vitals,dur:fmt(App.elapsed),patientHistory,examFindings,duration};
}

/* SOAP Note Generator */
function genSOAP(a){
  let subj=`Chief Complaint: ${a.cc}`;
  if(a.duration)subj+=`\nDuration: ${a.duration}`;
  subj+='\n\nHistory of Present Illness:';
  subj+='\n'+a.patientHistory;
  if(a.syms.length)subj+=`\n\nAssociated Symptoms: ${a.syms.join(', ')}`;
  if(a.meds.length)subj+=`\nCurrent Medications Mentioned: ${a.meds.join(', ')}`;

  let obj=`Vitals: ${a.vitals.length?a.vitals.join(', '):'[Not recorded in transcript]'}`;
  obj+='\n\nPhysical Examination:\n'+a.examFindings;

  let assess='';
  if(a.syms.length>0)assess+=`Presenting symptoms include ${a.syms.join(', ')}.`;
  else assess+='Clinical presentation as documented above.';
  assess+='\n\nDifferential diagnosis and clinical assessment to be completed by provider.';

  let plan='';
  if(a.meds.length)plan+='Medications Discussed:\n'+a.meds.map(m=>`  - ${m.charAt(0).toUpperCase()+m.slice(1)}`).join('\n')+'\n\n';
  plan+='Diagnostics: As clinically indicated.\nPatient Education: Discussed condition and treatment plan.\nFollow-up: As discussed during encounter.\nDisposition: Per provider determination.';

  return{title:'SOAP Note',sections:[
    {key:'subjective',title:'Subjective',content:subj},
    {key:'objective',title:'Objective',content:obj},
    {key:'assessment',title:'Assessment',content:assess},
    {key:'plan',title:'Plan',content:plan}
  ]};
}

/* HPI-Focused Note Generator */
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

/* Problem-Oriented Note Generator */
function genProblem(a){
  const prob=a.cc.split(/[.,!?]/)[0].trim()||'Primary Concern';
  return{title:'Problem-Oriented Note',sections:[
    {key:'overview',title:'Visit Overview',content:`Date: ${fmtDate(App.sessionStartTime||new Date())}\nDuration: ${a.dur}\nChief Complaint: ${a.cc}\nSpeakers: ${App.speakers.map(s=>s.name).join(', ')}`},
    {key:'problem-1',title:`Problem 1: ${prob}`,content:['Subjective:',a.patientHistory,'','Objective:',a.vitals.length?`Vitals: ${a.vitals.join(', ')}`:'[Vitals not recorded]',a.examFindings,'','Assessment:',a.syms.length?`Presenting with ${a.syms.join(', ')}.`:'See history above.','Clinical assessment to be completed by provider.','','Plan:','Management as discussed during encounter.'].join('\n')},
    {key:'medications',title:'Medications',content:a.meds.length?a.meds.map(m=>`- ${m.charAt(0).toUpperCase()+m.slice(1)}`).join('\n'):'No medications mentioned in transcript.'},
    {key:'followup',title:'Follow-Up',content:'Follow-up as discussed during encounter.\nReturn if symptoms worsen or new symptoms develop.'}
  ]};
}

/* Note Rendering */
function renderNoteSec(nd){
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
        const s=App.noteSections.sections.find(x=>x.key===key);
        if(s)s.content=body.innerText; // innerText preserves line breaks
        toast('Section saved','success');
      }else{
        body.contentEditable='true';body.focus();e.target.textContent='Save';
        const range=document.createRange();range.selectNodeContents(body);range.collapse(false);
        const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
      }
    });
  });
}

/* 17. PDF EXPORT & COPY — FIXED: uses innerText to capture edits with line breaks */
async function exportPDF(){
  if(!App.noteGenerated){toast('Generate a note first.','warning');return;}
  const nd=App.noteSections;const date=fmtDate(App.sessionStartTime||new Date());
  const dur=fmt(App.elapsed);const speakers=App.speakers.map(s=>`${s.name} (${ROLES[s.role]?.label})`).join(', ');

  let sectionsHtml='';
  nd.sections.forEach(s=>{
    const live=document.getElementById(`section-${s.key}`);
    const content=live?live.innerText:s.content;
    sectionsHtml+=`<div style="margin-bottom:20px;"><h3 style="font-size:14px;font-weight:700;color:#0891B2;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px 0;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">${esc(s.title)}</h3><div style="font-size:13px;line-height:1.7;color:#334155;white-space:pre-wrap;">${esc(content)}</div></div>`;
  });

  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>ClinicalFlow Note - ${date}</title>
<style>@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'DM Sans',system-ui,sans-serif;padding:0.75in 1in;color:#1a1a1a;max-width:8.5in;}.header{border-bottom:2px solid #0891B2;padding-bottom:12px;margin-bottom:24px;}.title{font-size:22px;font-weight:700;color:#0B0F14;}.subtitle{font-size:11px;color:#0891B2;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;}.meta{font-size:12px;color:#64748B;margin-top:6px;line-height:1.6;}.disclaimer{font-size:10px;color:#94A3B8;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:4px;padding:8px 12px;margin-bottom:16px;line-height:1.5;}.footer{margin-top:32px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10px;color:#94A3B8;display:flex;justify-content:space-between;}@media print{body{padding:0.5in 0.75in;}@page{margin:0.5in;size:letter;}}</style></head><body>
<div class="header"><div class="subtitle">ClinicalFlow — Clinical Documentation</div><div class="title">${esc(nd.title||'Clinical Note')}</div><div class="meta">Date: ${esc(date)}<br>Duration: ${esc(dur)} | Speakers: ${esc(speakers)}</div></div>
<div class="disclaimer">⚠ This note was auto-generated from a transcribed clinical encounter. It should be reviewed, verified, and amended by the treating provider before inclusion in the medical record.</div>
${sectionsHtml}
<div class="footer"><span>Generated by ClinicalFlow — For review by treating provider</span><span>${fmtDT(new Date())}</span></div>
<script>window.onafterprint=()=>window.close();window.print();<\/script></body></html>`;

  const printWin=window.open('','_blank','width=850,height=1100');
  if(!printWin){toast('Pop-up blocked! Allow pop-ups or use Copy.','error',6000);return;}
  printWin.document.write(html);printWin.document.close();
  toast('Print dialog opened — choose "Save as PDF"','success',5000);
}

async function copyNote(){
  if(!App.noteSections?.sections)return;
  const text=App.noteSections.sections.map(s=>{const live=document.getElementById(`section-${s.key}`);return`=== ${s.title.toUpperCase()} ===\n${live?live.innerText:s.content}`;}).join('\n\n');
  const hdr=`${App.noteSections.title}\nDate: ${fmtDate(App.sessionStartTime||new Date())}\nGenerated by ClinicalFlow\n${'─'.repeat(40)}\n\n`;
  try{await navigator.clipboard.writeText(hdr+text);toast('Note copied!','success');}
  catch(e){const ta=document.createElement('textarea');ta.value=hdr+text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('Note copied!','success');}
}

function downloadTextNote(){
  if(!App.noteSections?.sections)return;
  const text=App.noteSections.sections.map(s=>{const live=document.getElementById(`section-${s.key}`);return`=== ${s.title.toUpperCase()} ===\n${live?live.innerText:s.content}`;}).join('\n\n');
  const hdr=`${App.noteSections.title}\nDate: ${fmtDate(App.sessionStartTime||new Date())}\nGenerated by ClinicalFlow\n${'─'.repeat(40)}\n\n`;
  const blob=new Blob([hdr+text],{type:'text/plain'});const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`ClinicalFlow_Note_${new Date().toISOString().split('T')[0]}.txt`;
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);toast('Text file downloaded!','success');
}

/* 18. SESSION */
function newSession(){
  if(App.isRecording)stopRecording();
  // Cancel any in-flight Ollama request
  if(ollamaAbortCtrl){ollamaAbortCtrl.abort();ollamaAbortCtrl=null;}
  App.entries=[];App.nextEntryId=1;App.speakers=[];App.nextSpkId=1;App.activeSpkId=null;
  App.noteGenerated=false;App.noteSections={};App.sessionStartTime=null;
  App.audioBlob=null;App.audioChunks=[];
  clearSavedSession(); // Clear auto-saved data
  resetTimer();
  D.txEntries.innerHTML='';D.txEmpty.style.display='flex';D.txEntries.style.display='none';
  D.noteSec.innerHTML='';D.noteSec.style.display='none';D.noteEmpty.style.display='flex';D.noteGen.style.display='none';
  ['regenBtn','copyBtn','expPdfBtn'].forEach(k=>D[k].style.display='none');
  D.expBtn.style.display='none';D.genBtn.style.display='none';
  hideDownloadBtns();
  renderSpeakers();updSpkCount();updWordCount();updStatus('ready');D.actSpkBadge.style.display='none';
  toast('New session started','info');
}

/* 19. SEARCH — uses CSS class now, not inline display */
function toggleSearch(){
  const vis=D.searchBar.classList.contains('visible');
  if(vis){D.searchBar.classList.remove('visible');D.searchInput.value='';clrHL();}
  else{D.searchBar.classList.add('visible');D.searchInput.focus();}
}
const doSearch=debounce(q=>{clrHL();if(!q.trim())return;const lq=q.toLowerCase();let f=0;D.txEntries.querySelectorAll('.transcript-entry').forEach(el=>{const t=el.querySelector('.entry-text');if(t&&t.textContent.toLowerCase().includes(lq)){el.style.background='var(--accent-dim)';f++;}});if(f===0)toast(`No results for "${q}"`,'info');},300);
function clrHL(){D.txEntries.querySelectorAll('.transcript-entry').forEach(el=>el.style.background='');}

/* 20. SETTINGS & TOGGLES */
function initToggles(){
  document.querySelectorAll('.toggle').forEach(t=>{
    // Skip ollamaVerify — it has its own handler in initEvents
    if(t.id==='settingOllamaVerify')return;
    t.addEventListener('click',()=>{
      const s=t.dataset.setting;const a=t.classList.toggle('active');t.setAttribute('aria-checked',a);
      if(s&&App.settings.hasOwnProperty(s))App.settings[s]=a;
      document.querySelectorAll(`.toggle[data-setting="${s}"]`).forEach(x=>{x.classList.toggle('active',a);x.setAttribute('aria-checked',a);});
      if(s==='timestamps'||s==='highlightTerms')renderEntries();
    });
    t.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();t.click();}});
  });
}
function initFmtSel(){
  D.fmtSel.querySelectorAll('.format-option').forEach(opt=>{
    opt.addEventListener('click',()=>{D.fmtSel.querySelectorAll('.format-option').forEach(o=>{o.classList.remove('selected');o.setAttribute('aria-checked','false');});opt.classList.add('selected');opt.setAttribute('aria-checked','true');App.noteFormat=opt.dataset.format;});
    opt.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();opt.click();}});
  });
}

/* 21. API KEY */
function loadApiKey(){const key=localStorage.getItem('ms-dg-key')||'';App.dgKey=key;if(D.dgInput)D.dgInput.value=key?'••••••••••••••••':'';updApiStatus();}
function saveApiKey(){const key=D.dgInput.value.trim();if(!key||key.includes('•')){toast('Enter a valid API key.','warning');return;}App.dgKey=key;localStorage.setItem('ms-dg-key',key);D.dgInput.value='••••••••••••••••';updApiStatus();toast('API key saved! Deepgram will be used for transcription.','success');}
function updApiStatus(){if(App.dgKey){D.dgStatus.className='api-key-status connected';D.dgStatusText.textContent='Deepgram API key saved';updConn('connected','Deepgram Medical');}else{D.dgStatus.className='api-key-status disconnected';D.dgStatusText.textContent='No API key — using browser fallback';updConn('fallback','Browser ASR');}}

/* 22. KEYBOARD SHORTCUTS — added T for transcript download */
function initKeys(){
  document.addEventListener('keydown',e=>{
    const tag=e.target.tagName.toLowerCase();if(tag==='input'||tag==='textarea'||e.target.contentEditable==='true')return;
    switch(e.key.toLowerCase()){
      case ' ':e.preventDefault();toggleRec();break;
      case 'p':if(App.isRecording){e.preventDefault();pauseRecording();}break;
      case 'g':if(!App.isRecording&&App.entries.length>0){e.preventDefault();generateNote();}break;
      case 'e':if(App.noteGenerated){e.preventDefault();exportPDF();}break;
      case 'n':e.preventDefault();if(App.entries.length>0||App.noteGenerated)openModal(D.newSessModal);else newSession();break;
      case 't':if(App.entries.length>0){e.preventDefault();downloadTranscript();}break;
      case 'escape':closeAllModals();closeSettings();if(D.searchBar.classList.contains('visible'))toggleSearch();break;
      case 'f':if(e.ctrlKey||e.metaKey){e.preventDefault();toggleSearch();}break;
    }
  });
}

/* 23. DEMO MODE — triple-click help button */
const DEMO=[
  // Script 1: Multi-Problem Visit — Diabetes + Knee Pain
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
function initDemo(){
  let clicks=0,timer=null;
  document.getElementById('helpBtn').addEventListener('click',()=>{
    clicks++;clearTimeout(timer);
    timer=setTimeout(()=>{
      if(clicks>=3&&!App.demoRunning){closeAllModals();runDemo();}
      else{openModal(D.helpModal);}
      clicks=0;
    },400);
  });
}
async function runDemo(){
  App.demoRunning=true;newSession();
  addSpeaker('Dr. Patel','doctor');addSpeaker('Mr. Robinson','patient');addSpeaker('Maria (MA)','other');
  setActiveSpk(App.speakers[2].id); // Start with MA
  App.sessionStartTime=new Date();updateRecUI(true);App.isRecording=true;startTimer();
  function simW(){if(!App.demoRunning)return;D.waveBars.forEach(b=>{b.style.height=`${Math.random()*28+4}px`;b.classList.remove('inactive');b.style.background='var(--accent)';});if(App.demoRunning)requestAnimationFrame(simW);}simW();
  toast('Demo mode — simulating clinical encounter','info',4000);
  for(const item of DEMO){
    if(!App.demoRunning)break;
    const sp=App.speakers.find(s=>s.role===item.s);if(sp)setActiveSpk(sp.id);
    const words=item.t.split(' ');let partial='';
    for(let i=0;i<words.length;i++){partial+=(i>0?' ':'')+words[i];updatePartial(partial);await wait(80+Math.random()*60);}
    removePartial();addEntry(item.t,0.92+Math.random()*0.08);await wait(item.d);
  }
  App.demoRunning=false;App.isRecording=false;stopTimer();resetWave();updateRecUI(false);
  D.genBtn.style.display='inline-flex';showDownloadBtns();
  toast('Demo complete! Click "Generate Note" to create documentation.','success',5000);
}

/* ── SIDEBAR TOGGLE & PANEL RESIZE ── */

function initSidebarToggle(){
  const sidebar=document.getElementById('sidebar');
  const toggle=document.getElementById('sidebarToggle');
  const app=document.getElementById('app');
  if(!sidebar||!toggle)return;

  // Restore saved state
  const saved=localStorage.getItem('ms-sidebar-collapsed');
  if(saved==='true'){
    sidebar.classList.add('collapsed');
    app.classList.add('sidebar-collapsed');
    // Reapply panel ratio with collapsed sidebar
    const savedRatio=localStorage.getItem('ms-panel-ratio');
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
    localStorage.setItem('ms-sidebar-collapsed',collapsing);
    // Reapply panel ratio with new sidebar state
    const savedRatio=localStorage.getItem('ms-panel-ratio');
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
      // Reset to default
      app.style.gridTemplateColumns='';
    }
  });
}

function initPanelResize(){
  const handle=document.getElementById('resizeHandle');
  const app=document.getElementById('app');
  const sidebar=document.getElementById('sidebar');
  if(!handle||!app)return;

  let isDragging=false;
  let startX=0;
  let startTxFr=1;
  let startNoteFr=1;

  // Restore saved ratio
  const savedRatio=localStorage.getItem('ms-panel-ratio');
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
    // cols: [sidebar, transcript, note]
    if(cols.length<3)return{txFr:1,noteFr:1};
    const txPx=parseFloat(cols[1]);
    const notePx=parseFloat(cols[2]);
    const total=txPx+notePx;
    if(total===0)return{txFr:1,noteFr:1};
    return{txFr:txPx/total,noteFr:notePx/total};
  }

  function applyRatio(txFr,noteFr){
    // Clamp: min 20% each side
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
    // Save ratio
    const cur=getCurrentFractions();
    localStorage.setItem('ms-panel-ratio',JSON.stringify({tx:cur.txFr,note:cur.noteFr}));
  });

  // Touch support for tablet
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
    localStorage.setItem('ms-panel-ratio',JSON.stringify({tx:cur.txFr,note:cur.noteFr}));
  });

  // Double-click to reset to 50/50
  handle.addEventListener('dblclick',()=>{
    applyRatio(1,1);
    localStorage.removeItem('ms-panel-ratio');
    toast('Panel sizes reset','info',2000);
  });
}

/* 24. EVENT LISTENERS */
function initEvents(){
  D.recBtn.addEventListener('click',toggleRec);
  D.pauseBtn.addEventListener('click',pauseRecording);
  D.genBtn.addEventListener('click',generateNote);
  D.expPdfBtn.addEventListener('click',exportPDF);D.expBtn.addEventListener('click',exportPDF);
  D.copyBtn.addEventListener('click',copyNote);D.regenBtn.addEventListener('click',generateNote);
  if(D.dlTxBtn)D.dlTxBtn.addEventListener('click',downloadTranscript);
  if(D.dlAudioBtn)D.dlAudioBtn.addEventListener('click',downloadAudio);
  document.getElementById('newSessionBtn').addEventListener('click',()=>{if(App.entries.length>0||App.noteGenerated)openModal(D.newSessModal);else newSession();});
  document.getElementById('settingsToggleBtn').addEventListener('click',openSettings);
  D.setClose.addEventListener('click',closeSettings);D.setOverlay.addEventListener('click',closeSettings);
  D.themeSw.querySelectorAll('.theme-option').forEach(b=>b.addEventListener('click',()=>setTheme(b.dataset.theme)));
  D.dgSave.addEventListener('click',saveApiKey);
  D.dgInput.addEventListener('keydown',e=>{if(e.key==='Enter')saveApiKey();});
  D.dgInput.addEventListener('focus',()=>{if(D.dgInput.value.includes('•'))D.dgInput.value='';});
  D.langSel.addEventListener('change',e=>{App.language=e.target.value;if(App.recognition)App.recognition.lang=App.language;});
  document.getElementById('cancelNewSession').addEventListener('click',()=>closeModal(D.newSessModal));
  document.getElementById('confirmNewSession').addEventListener('click',()=>{closeModal(D.newSessModal);newSession();});
  D.addSpkBtn.addEventListener('click',()=>openModal(D.addSpkModal));
  document.getElementById('cancelAddSpeaker').addEventListener('click',()=>closeModal(D.addSpkModal));
  document.getElementById('confirmAddSpeaker').addEventListener('click',()=>{
    const nm=document.getElementById('newSpeakerName').value.trim();if(!nm){toast('Enter a speaker name.','warning');return;}
    const sel=D.addSpkModal.querySelector('.role-option.selected');addSpeaker(nm,sel?.dataset.role||'other');
    document.getElementById('newSpeakerName').value='';closeModal(D.addSpkModal);toast(`Speaker "${nm}" added`,'success');
  });
  /* Role option buttons — CSS classes only, no inline styles */
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

  /* Sidebar toggle */
  initSidebarToggle();
  /* Panel resize handles */
  initPanelResize();

  /* Ollama / AI Engine events */
  if(D.aiEngineToggle){
    D.aiEngineToggle.querySelectorAll('.ai-engine-option').forEach(btn=>{
      btn.addEventListener('click',()=>{
        D.aiEngineToggle.querySelectorAll('.ai-engine-option').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        App.aiEngine=btn.dataset.engine;
        D.ollamaSettings.style.display=App.aiEngine==='ollama'?'block':'none';
        saveOllamaSettings();
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
    });
  }
  // Verification toggle
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
}

/* 25. INIT */
async function init(){
  cacheDOM();loadTheme();loadApiKey();loadOllamaSettings();initToggles();initFmtSel();initKeys();initEvents();initDemo();
  hideDownloadBtns();
  // Load external corrections dictionary (non-blocking)
  loadCorrectionsDictionary();
  // Auto-check Ollama connection on startup (non-blocking)
  if(App.aiEngine==='ollama')ollamaCheck();
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR&&!App.dgKey)toast('Add a Deepgram API key in Settings, or use Chrome/Edge for browser fallback.','warning',8000);
  // Check for crash recovery (Fix 1)
  const saved=getSavedSession();
  if(saved){
    const age=Date.now()-new Date(saved.savedAt).getTime();
    const mins=Math.round(age/60000);
    const timeLabel=mins<60?`${mins} min ago`:`${Math.round(mins/60)}h ago`;
    const ct=saved.entries.length;
    // Show recovery prompt
    const recover=confirm(`Unsaved session detected (${ct} entries, saved ${timeLabel}).\n\nRestore this session?\n\nClick OK to restore, or Cancel to start fresh.`);
    if(recover){
      restoreSession(saved);
    }else{
      clearSavedSession();
    }
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
