/* ============================================================
   CLINICALFLOW — DOM Cache, Formatting, Toasts, Modals, Theme
   ============================================================ */
import { App, cfg } from './state.js';

/* DOM Cache */
export const D = {};
export function cacheDOM(){
  const g=id=>document.getElementById(id);
  D.html=document.documentElement;
  D.statusBadge=g('statusBadge');D.statusText=g('statusText');D.timer=g('sessionTimer');D.wordCount=g('wordCount');
  D.connInd=g('connectionIndicator');D.connText=g('connectionText');
  D.speakerList=g('speakerList');D.speakerCount=g('speakerCount');D.addSpkBtn=g('addSpeakerBtn');D.fmtSel=g('formatSelector');
  D.txContent=g('transcriptContent');D.txEmpty=g('transcriptEmpty');D.txEntries=g('transcriptEntries');
  D.liveDot=g('liveDot');D.searchBar=g('searchBar');D.searchInput=g('searchInput');
  D.dlTxBtn=g('downloadTranscriptBtn');
  D.noteContent=g('noteContent');D.noteEmpty=g('noteEmpty');D.noteGen=g('noteGenerating');D.noteSec=g('noteSections');D.codingPanel=g('codingPanel');
  D.regenBtn=g('regenerateNoteBtn');D.copyBtn=g('copyNoteBtn');D.expPdfBtn=g('exportPdfBtn');D.copyEhrBtn=g('copyEhrBtn');D.expHl7Btn=g('exportHl7Btn');D.genNarrBtn=g('genNarrativeBtn');D.syncPmsBtn=g('syncPmsBtn');
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
  D.txModeToggle=g('transcriptionModeToggle');D.onlineSettings=g('onlineTranscriptionSettings');
  D.aiEngineToggle=g('aiEngineToggle');D.cloudAISettings=g('cloudAISettings');D.ollamaSettings=g('ollamaSettings');
  D.ollamaUrl=g('ollamaUrl');D.ollamaTestBtn=g('ollamaTestBtn');
  D.ollamaStatus=g('ollamaStatus');D.ollamaStatusText=g('ollamaStatusText');
  D.ollamaModelSelect=g('ollamaModelSelect');D.ollamaRefreshBtn=g('ollamaRefreshBtn');
}

/* Utilities — re-exported from pure.js for testability */
export { fmt, wc, rInt, wait, debounce } from './pure.js';
export const fmtDate=d=>{const l=(typeof App!=='undefined'&&App.language)||'en-US';return d.toLocaleDateString(l,{weekday:'long',year:'numeric',month:'long',day:'numeric'});};
export const fmtDT=d=>{const l=(typeof App!=='undefined'&&App.language)||'en-US';return d.toLocaleString(l,{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});};
export function esc(t){const d=document.createElement('div');d.textContent=t;return d.innerHTML;}

/* Toasts */
export function toast(msg,type='info',dur=3500){
  const ic={success:'<polyline points="20 6 9 17 4 12"/>',error:'<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',warning:'<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',info:'<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'};
  const el=document.createElement('div');el.className=`toast ${type}`;
  el.innerHTML=`<span class="toast-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ic[type]}</svg></span><span>${esc(msg)}</span>`;
  D.toasts.appendChild(el);setTimeout(()=>{el.classList.add('leaving');el.addEventListener('animationend',()=>el.remove());},dur);
}

/* Modals & Settings */
export function openModal(el){el.classList.add('visible');setTimeout(()=>{const f=el.querySelector('button,input,[tabindex]');if(f)f.focus();},100);}
export function closeModal(el){el.classList.remove('visible');}
export function closeAllModals(){document.querySelectorAll('.modal-overlay').forEach(m=>closeModal(m));}
export function openSettings(){D.setOverlay.classList.add('visible');D.setDrawer.classList.add('visible');}
export function closeSettings(){D.setOverlay.classList.remove('visible');D.setDrawer.classList.remove('visible');}
export function toggleSettings(){D.setDrawer.classList.contains('visible')?closeSettings():openSettings();}
export function showConfirm(title,desc,okLabel='Delete'){
  return new Promise(resolve=>{
    const modal=document.getElementById('genericConfirmModal');
    document.getElementById('genericConfirmTitle').textContent=title;
    document.getElementById('genericConfirmDesc').textContent=desc;
    document.getElementById('genericConfirmOkText').textContent=okLabel;
    const okBtn=document.getElementById('genericConfirmOk');
    const icon=document.getElementById('genericConfirmIcon');
    const isDanger=okLabel==='Delete'||okLabel==='Clear'||okLabel==='Delete All';
    okBtn.className=isDanger?'btn btn-danger btn-md':'btn btn-primary btn-md';
    icon.innerHTML=isDanger
      ?'<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'
      :'<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>';
    const cancelBtn=document.getElementById('genericConfirmCancel');
    function cleanup(result){closeModal(modal);cancelBtn.removeEventListener('click',onCancel);okBtn.removeEventListener('click',onOk);resolve(result);}
    function onCancel(){cleanup(false);}
    function onOk(){cleanup(true);}
    cancelBtn.addEventListener('click',onCancel);
    okBtn.addEventListener('click',onOk);
    openModal(modal);
  });
}

/* Theme */
export function setTheme(t){App.theme=t;D.html.setAttribute('data-theme',t);cfg.set('ms-theme',t);D.themeSw.querySelectorAll('.theme-option').forEach(b=>b.classList.toggle('active',b.dataset.theme===t));}
export function loadTheme(){setTheme(cfg.get('ms-theme','light'));}

/* Connection Indicator */
export const CONN_ICONS={
  connected:'<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>',
  disconnected:'<line x1="1" y1="1" x2="23" y2="23" class="conn-slash"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" class="conn-wave conn-wave-3"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" class="conn-wave conn-wave-2"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9" class="conn-wave conn-wave-1"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" class="conn-wave conn-wave-1"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0" class="conn-wave conn-wave-3"/><line x1="12" y1="20" x2="12.01" y2="20"/>',
  fallback:'<line x1="1" y1="1" x2="23" y2="23" class="conn-slash"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" class="conn-wave conn-wave-3"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" class="conn-wave conn-wave-2"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9" class="conn-wave conn-wave-1"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" class="conn-wave conn-wave-1"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0" class="conn-wave conn-wave-3"/><line x1="12" y1="20" x2="12.01" y2="20"/>'
};
export function updConn(status,text){
  D.connInd.className='connection-indicator';
  if(status==='connected')D.connInd.classList.add('connected');
  else if(status==='fallback')D.connInd.classList.add('fallback');
  else if(status==='disconnected')D.connInd.classList.add('disconnected');
  const icon=D.connInd.querySelector('.conn-icon');
  if(icon)icon.innerHTML=CONN_ICONS[status]||CONN_ICONS.disconnected;
  D.connText.textContent=text;
}

/* Status badge — shared across recording, notes, session */
export function updStatus(s,label){
  D.statusBadge.className='session-badge';
  if(s==='recording'){D.statusBadge.classList.add('recording');D.statusText.textContent='Recording';}
  else if(s==='paused'){D.statusBadge.classList.add('paused');D.statusText.textContent='Paused';}
  else if(s==='generating'){D.statusText.textContent=label?`Generating ${label}...`:'Generating...';}
  else{D.statusText.textContent='Ready';}
}

/* Download button visibility — shared across audio, recording, session */
export function showDownloadBtns(){
  if(D.dlTxBtn&&App.entries.length>0)D.dlTxBtn.style.display='flex';
  if(D.dlAudioBtn&&App.audioBlob)D.dlAudioBtn.style.display='inline-flex';
}
export function hideDownloadBtns(){
  if(D.dlTxBtn)D.dlTxBtn.style.display='none';
  if(D.dlAudioBtn)D.dlAudioBtn.style.display='none';
}
