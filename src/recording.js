/* ============================================================
   CLINICALFLOW — Recording Lifecycle & UI
   ============================================================ */
import { App, tauriInvoke, cfg } from './state.js';
import { getWhisperCode } from './languages.js';
import { D, fmt, toast, updConn, updStatus, showDownloadBtns, wait } from './ui.js';
import { addSpeaker, setActiveSpk, renderSpeakers } from './speakers.js';
import { removePartial } from './transcript.js';
import { initAudio, startAudioRecording, stopAudioRecording, pauseAudioRecording, resumeAudioRecording,
         stopAudio, resetWave, animWave,
         startDeepgram, stopDeepgram, startWhisper, stopWhisper,
         pauseWhisper, resumeWhisper,
         startWebSpeech, stopWebSpeech } from './audio.js';
import { newSession } from './session.js'; // circular — safe: only called at runtime

export async function startRecording(){
  try{
    if(App.entries.length>0){
      newSession();
      await wait(150);
      toast('Previous session cleared — starting fresh','info',2000);
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
    startTimer();updateRecUI(true);
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
    D.pauseBtn.querySelector('svg').innerHTML='<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>';
    toast('Resumed','success');
  }else{
    App.isPaused=true;
    if(App.engine==='whisper')pauseWhisper();else if(App.engine==='deepgram'){if(tauriInvoke)pauseWhisper();stopDeepgram();}else{try{App.recognition.stop();}catch(e){}}
    pauseAudioRecording();stopTimer();resetWave();removePartial();updStatus('paused');
    D.pauseBtn.querySelector('svg').innerHTML='<polygon points="5 3 19 12 5 21 5 3"/>';
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
  if(on){updStatus('recording');D.genBtn.style.display='none';D.actSpkBadge.style.display='flex';}
  else{updStatus('ready');D.actSpkBadge.style.display='none';}
}
