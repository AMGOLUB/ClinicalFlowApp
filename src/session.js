/* ============================================================
   CLINICALFLOW — Session Persistence & Archiving
   ============================================================ */
import { App, tauriInvoke, cfg, getAbortCtrl, setAbortCtrl } from './state.js';
import { D, toast, showConfirm, fmtDT, esc, updStatus, showDownloadBtns, hideDownloadBtns } from './ui.js';
import { renderEntries, clearTx, updWordCount } from './transcript.js';
import { renderSpeakers, updSpkCount } from './speakers.js';
import { renderNoteSec } from './notes.js';
import { stopRecording, resetTimer, updateRecUI } from './recording.js'; // circular — safe: only called at runtime

/* Session Auto-Save & Recovery */
let _saveTimer=null;
function _buildSessionData(){
  return {
    entries:App.entries,
    speakers:App.speakers,
    nextEntryId:App.nextEntryId,
    nextSpkId:App.nextSpkId,
    activeSpkId:App.activeSpkId,
    elapsed:App.elapsed,
    sessionStartTime:App.sessionStartTime?.toISOString()||null,
    noteFormat:App.noteFormat,
    noteSections:App.noteSections,
    noteGenerated:App.noteGenerated,
    codingResults:App.codingResults,
    dentalChart:App.dentalChart,
    savedAt:new Date().toISOString()
  };
}
export function saveSession(){
  try{
    if(window.__TAURI__){
      // Debounce encrypted saves (PBKDF2 + AES is expensive) — at most once per 2s
      if(_saveTimer)clearTimeout(_saveTimer);
      _saveTimer=setTimeout(()=>{
        _saveTimer=null;
        const data=_buildSessionData();
        tauriInvoke('save_session_encrypted',{sessionJson:JSON.stringify(data)}).catch(e=>console.warn('[ClinicalFlow] Session save failed:',e));
      },2000);
    }else{
      localStorage.setItem('ms-active-session',JSON.stringify(_buildSessionData()));
    }
  }catch(e){console.warn('[ClinicalFlow] Auto-save failed:',e);}
}

export function clearSavedSession(){
  if(_saveTimer){clearTimeout(_saveTimer);_saveTimer=null;}
  if(window.__TAURI__){
    tauriInvoke('clear_session').catch(e=>console.warn('[ClinicalFlow] Session clear failed:',e));
  }else{
    localStorage.removeItem('ms-active-session');
  }
}

export async function getSavedSession(){
  try{
    let raw;
    if(window.__TAURI__){
      try{raw=await tauriInvoke('load_session_encrypted');}catch(e){raw=null;}
    }else{
      raw=localStorage.getItem('ms-active-session');
    }
    if(!raw)return null;
    const data=JSON.parse(raw);
    if(!data.entries||data.entries.length===0)return null;
    return data;
  }catch(e){return null;}
}

export function restoreSession(data){
  App.entries=data.entries||[];
  App.speakers=data.speakers||[];
  App.nextEntryId=data.nextEntryId||1;
  App.nextSpkId=data.nextSpkId||1;
  App.activeSpkId=data.activeSpkId||null;
  App.elapsed=data.elapsed||0;
  App.sessionStartTime=data.sessionStartTime?new Date(data.sessionStartTime):null;
  App.noteFormat=data.noteFormat||'soap';
  App.noteSections=data.noteSections||{};
  App.noteGenerated=!!data.noteGenerated;
  App.codingResults=data.codingResults||null;
  App.dentalChart=data.dentalChart||{mode:'adult',teeth:{}};
  renderEntries();renderSpeakers();updSpkCount();updWordCount();
  if(App.entries.length>0){
    D.genBtn.style.display='inline-flex';
    showDownloadBtns();
  }
  // Restore generated note if it was saved
  if(App.noteGenerated&&App.noteSections?.sections?.length>0){
    renderNoteSec(App.noteSections);
    D.noteEmpty.style.display='none';
    D.noteSec.style.display='block';
    D.noteGen.style.display='none';
    ['regenBtn','copyBtn','expPdfBtn'].forEach(k=>{if(D[k])D[k].style.display='inline-flex';});
    if(D.expBtn)D.expBtn.style.display='inline-flex';
  }
  toast(`Session restored — ${App.entries.length} entries recovered`,'success',4000);
}

/* New Session */
export async function newSession(){
  if(App.isRecording)stopRecording();
  const ctrl=getAbortCtrl();
  if(ctrl){ctrl.abort();setAbortCtrl(null);}

  if(App.entries.length>0&&window.__TAURI__){
    try{
      const sessionData=JSON.stringify({
        entries:App.entries,
        speakers:App.speakers,
        noteFormat:App.noteFormat,
        noteSections:App.noteSections,
        codingResults:App.codingResults,
        dentalChart:App.dentalChart,
        elapsed:App.elapsed,
        archivedAt:new Date().toISOString()
      });
      const patientName=App.speakers.length>0?App.speakers[0].name:null;
      await tauriInvoke('archive_session_encrypted',{
        sessionJson:sessionData,
        patientName:patientName,
        audioSourcePath:App.lastWavPath||null
      });
      toast('Previous session archived','info',2000);
    }catch(e){
      console.error('[ClinicalFlow] Archive failed:',e);
      toast('Failed to archive session — data not cleared','error',6000);
      return false; // Do NOT clear the session if archival failed
    }
  }

  App.entries=[];App.nextEntryId=1;App.speakers=[];App.nextSpkId=1;App.activeSpkId=null;
  App.noteGenerated=false;App.noteSections={};App.codingResults=null;App.sessionStartTime=null;
  App.audioBlob=null;App.audioChunks=[];App.lastWavPath=null;
  App.dentalChart={mode:'adult',teeth:{}};
  const _dcSec=document.getElementById('dentalChartSection');
  if(_dcSec){_dcSec.style.display='none';const _c=document.getElementById('dentalChartContainer');if(_c)_c.innerHTML='';}
  clearSavedSession();
  resetTimer();
  D.txEntries.innerHTML='';D.txEmpty.style.display='flex';D.txEntries.style.display='none';
  D.noteSec.innerHTML='';D.noteSec.style.display='none';D.noteEmpty.style.display='flex';D.noteGen.style.display='none';
  if(D.codingPanel){D.codingPanel.innerHTML='';D.codingPanel.style.display='none';}
  ['regenBtn','copyBtn','expPdfBtn'].forEach(k=>D[k].style.display='none');
  D.expBtn.style.display='none';D.genBtn.style.display='none';
  hideDownloadBtns();
  renderSpeakers();updSpkCount();updWordCount();updStatus('ready');D.actSpkBadge.style.display='none';
  toast('New session started','info');
  if(window.__TAURI__)loadArchiveList();
  return true;
}

/* Archive Management */
export async function loadArchiveList(){
  if(!window.__TAURI__)return;
  const sec=document.getElementById('pastSessionsSection');
  if(sec)sec.style.display='';
  try{
    const sessions=await tauriInvoke('list_archived_sessions');
    const container=document.getElementById('archiveList');
    if(!container)return;
    const items=sessions.map(s=>`
      <div class="archive-item" data-filename="${esc(s.filename)}">
        <span class="archive-name">${esc(s.filename)}</span>
        <span class="archive-meta">${s.has_audio?'🎤 ':''}${(s.size_bytes/1024).toFixed(0)}KB</span>
        <button class="archive-delete-btn" data-filename="${esc(s.filename)}" title="Delete session" aria-label="Delete session">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `).join('');
    const clearBtn=sessions.length>1?`<button class="archive-clear-all" id="archiveClearAll" aria-label="Clear all sessions">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      Clear all
    </button>`:'';
    container.innerHTML=(items||'<div class="archive-empty">No archived sessions</div>')+clearBtn;
    container.querySelectorAll('.archive-item').forEach(el=>{
      el.querySelector('.archive-name').addEventListener('click',()=>loadFromArchive(el.dataset.filename));
    });
    container.querySelectorAll('.archive-delete-btn').forEach(btn=>{
      btn.addEventListener('click',(e)=>{e.stopPropagation();deleteFromArchive(btn.dataset.filename);});
    });
    const clearAllBtn=document.getElementById('archiveClearAll');
    if(clearAllBtn)clearAllBtn.addEventListener('click',clearAllArchive);
  }catch(e){console.warn('[ClinicalFlow] Archive list failed:',e);}
}

export async function loadFromArchive(filename){
  try{
    const raw=await tauriInvoke('load_archived_session_encrypted',{filename});
    const data=JSON.parse(raw);
    restoreSession(data);
    toast('Loaded archived session: '+filename,'success');
  }catch(e){toast('Failed to load session: '+e,'error');}
}

export async function deleteFromArchive(filename){
  if(!await showConfirm('Delete session?',`This will permanently remove "${filename}" and any associated audio.`))return;
  try{
    const el=document.querySelector(`.archive-item[data-filename="${CSS.escape(filename)}"]`);
    if(el){el.classList.add('deleting');await new Promise(r=>setTimeout(r,320));}
    await tauriInvoke('delete_archived_session',{filename});
    toast('Session deleted','info',2000);
    loadArchiveList();
  }catch(e){toast('Failed to delete session: '+e,'error');}
}

export async function clearAllArchive(){
  if(!await showConfirm('Delete all sessions?','This will permanently remove all past sessions and associated audio.','Delete all'))return;
  try{
    const items=document.querySelectorAll('.archive-item');
    const clearBtn=document.getElementById('archiveClearAll');
    if(clearBtn)clearBtn.classList.add('deleting');
    items.forEach((el,i)=>setTimeout(()=>el.classList.add('deleting'),i*60));
    await new Promise(r=>setTimeout(r,items.length*60+320));
    const sessions=await tauriInvoke('list_archived_sessions');
    for(const s of sessions){
      await tauriInvoke('delete_archived_session',{filename:s.filename});
    }
    toast('All sessions cleared','info',2000);
    loadArchiveList();
  }catch(e){toast('Failed to clear sessions: '+e,'error');}
}
