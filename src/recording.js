/* ============================================================
   CLINICALFLOW — Recording Lifecycle & UI
   ============================================================ */
import { App, tauriInvoke, cfg } from './state.js';
import { getWhisperCode } from './languages.js';
import { D, fmt, toast, updConn, updStatus, showDownloadBtns, showConfirm, openModal, closeModal, wait } from './ui.js';
import { addSpeaker, setActiveSpk, renderSpeakers } from './speakers.js';
import { removePartial } from './transcript.js';
import { initAudio, startAudioRecording, stopAudioRecording, pauseAudioRecording, resumeAudioRecording,
         stopAudio, resetWave, animWave,
         startDeepgram, stopDeepgram, startWhisper, stopWhisper,
         pauseWhisper, resumeWhisper,
         startWebSpeech, stopWebSpeech } from './audio.js';
import { newSession, clearSavedSession } from './session.js'; // circular — safe: only called at runtime

function showRecChoice(){
  if(!window.__TAURI__){
    const r=confirm('Resume recording into the current transcript?\n\nOK = Resume, Cancel = Start fresh');
    return Promise.resolve(r?'resume':'new');
  }
  return new Promise(resolve=>{
    const modal=document.getElementById('recChoiceModal');
    const resumeBtn=document.getElementById('recChoiceResume');
    const newBtn=document.getElementById('recChoiceNew');
    const cancelBtn=document.getElementById('recChoiceCancel');
    function cleanup(result){closeModal(modal);resumeBtn.removeEventListener('click',onResume);newBtn.removeEventListener('click',onNew);cancelBtn.removeEventListener('click',onCancel);resolve(result);}
    function onResume(){cleanup('resume');}
    function onNew(){cleanup('new');}
    function onCancel(){cleanup('cancel');}
    resumeBtn.addEventListener('click',onResume);
    newBtn.addEventListener('click',onNew);
    cancelBtn.addEventListener('click',onCancel);
    openModal(modal);
  });
}

export async function startRecording(){
  try{
    if(App.entries.length>0){
      const choice=await showRecChoice();
      if(choice==='cancel')return;
      if(choice==='new'){
        const sure=await showConfirm('Clear transcript?','This will permanently delete the current transcript entries. Speakers and settings will be kept.','Clear transcript');
        if(!sure)return;
        App.entries=[];App.nextEntryId=1;
        App.noteGenerated=false;App.noteSections={};App.codingResults=null;
        clearSavedSession();
        D.txEntries.innerHTML='';D.txEmpty.style.display='flex';D.txEntries.style.display='none';
        D.noteSec.innerHTML='';D.noteSec.style.display='none';D.noteEmpty.style.display='flex';D.noteGen.style.display='none';
        if(D.codingPanel){D.codingPanel.innerHTML='';D.codingPanel.style.display='none';}
        ['regenBtn','copyBtn','expPdfBtn'].forEach(k=>{if(D[k])D[k].style.display='none';});
        if(D.expBtn)D.expBtn.style.display='none';if(D.genBtn)D.genBtn.style.display='none';
        toast('Transcript cleared','info',2000);
      }
      // choice==='resume' → keep entries, just start recording
    }

    console.debug('[REC] startRecording — mode:',App.transcriptionMode,'hasKey:',!!App.dgKey,'tauri:',!!tauriInvoke);
    if(tauriInvoke){
      if(App.transcriptionMode==='online'&&App.dgKey){
        console.debug('[REC] Starting cpal in STREAM mode for Deepgram');
        await tauriInvoke('start_recording',{mode:'stream',language:getWhisperCode(App.language)});
      }
    }else if(navigator.mediaDevices){
      App.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
      const track=App.stream.getAudioTracks()[0];
      if(track.muted)toast('Microphone is muted. Check your system audio settings.','error',8000);
      await initAudio(App.stream);
      if(!App.dgKey)startAudioRecording(App.stream);
    }
    App.isRecording=true;App.isPaused=false;App.sessionStartTime=App.sessionStartTime||new Date();
    if(App.speakers.length===0){addSpeaker('Doctor','doctor');addSpeaker('Patient','patient');setActiveSpk(App.speakers[0].id);}
    startTimer();updateRecUI(true);animWave();
    if(App.transcriptionMode==='online'&&App.dgKey){console.debug('[REC] Engine → Deepgram (online)');startDeepgram();}
    else if(tauriInvoke){console.debug('[REC] Engine → Whisper (offline/no key)');startWhisper();}
    else{console.debug('[REC] Engine → WebSpeech');startWebSpeech();}
    toast('Recording started','success');
  }catch(err){
    if(tauriInvoke)tauriInvoke('stop_recording').catch(()=>{});
    if(err.name==='NotAllowedError')toast('Microphone access denied.','error',6000);
    else if(err.name==='NotFoundError')toast('No microphone found.','error',6000);
    else toast('Failed to start recording: '+err,'error',8000);
  }
}

export function stopRecording(){
  if(App.engine==='whisper')stopWhisper();
  else if(App.engine==='deepgram'){stopDeepgram();if(tauriInvoke)tauriInvoke('stop_recording').catch(()=>{});}
  else{stopWebSpeech();if(tauriInvoke)tauriInvoke('stop_recording').catch(()=>{});}
  stopAudioRecording();
  if(App.stream){App.stream.getTracks().forEach(t=>t.stop());App.stream=null;}
  stopAudio();stopTimer();
  App.isRecording=false;App.isPaused=false;removePartial();
  App.speakers.forEach(s=>s.speaking=false);renderSpeakers();updateRecUI(false);
  if(App.entries.length>0){D.genBtn.style.display='inline-flex';showDownloadBtns();}
  toast('Recording stopped','info');
}

export function pauseRecording(){
  if(!App.isRecording)return;
  if(App.isPaused){
    App.isPaused=false;
    if(App.engine==='whisper')resumeWhisper();else if(App.engine==='deepgram'){if(tauriInvoke)resumeWhisper();startDeepgram();}else{try{App.recognition.start();}catch(e){}}
    resumeAudioRecording();startTimer();animWave();updStatus('recording');
    D.pauseBtn.querySelector('.icon-pause').style.display='';
    D.pauseBtn.querySelector('.icon-play').style.display='none';
    D.pauseBtn.setAttribute('aria-label','Pause recording');
    toast('Resumed','success');
  }else{
    App.isPaused=true;
    if(App.engine==='whisper')pauseWhisper();else if(App.engine==='deepgram'){if(tauriInvoke)pauseWhisper();stopDeepgram();}else{try{App.recognition.stop();}catch(e){}}
    pauseAudioRecording();stopTimer();resetWave();removePartial();updStatus('paused');
    D.pauseBtn.querySelector('.icon-pause').style.display='none';
    D.pauseBtn.querySelector('.icon-play').style.display='';
    D.pauseBtn.setAttribute('aria-label','Resume recording');
    toast('Paused','warning');
  }
}

export function toggleRec(){App.isRecording?stopRecording():startRecording();}

export function startTimer(){if(App.timerInterval)return;App.timerInterval=setInterval(()=>{App.elapsed++;D.timer.textContent=fmt(App.elapsed);},1000);}
export function stopTimer(){if(App.timerInterval){clearInterval(App.timerInterval);App.timerInterval=null;}}
export function resetTimer(){stopTimer();App.elapsed=0;D.timer.textContent='00:00';}

export function updateRecUI(on){
  D.recBtn.classList.toggle('recording',on);D.recBtn.setAttribute('aria-label',on?'Stop recording':'Start recording');
  D.pauseBtn.style.display=on?'flex':'none';D.liveDot.classList.toggle('visible',on);
  if(!on){
    // Reset pause button icon to pause (not play) for next recording
    const iconPause=D.pauseBtn.querySelector('.icon-pause');
    const iconPlay=D.pauseBtn.querySelector('.icon-play');
    if(iconPause)iconPause.style.display='';
    if(iconPlay)iconPlay.style.display='none';
  }
  if(on){updStatus('recording');D.genBtn.style.display='none';D.actSpkBadge.style.display='flex';}
  else{updStatus('ready');D.actSpkBadge.style.display='none';}
}
