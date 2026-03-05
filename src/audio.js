/* ============================================================
   CLINICALFLOW — Audio Capture, Waveform, Transcription Engines
   ============================================================ */
import { App, tauriInvoke, tauriListen, CORRECTIONS_DICT } from './state.js';
import { D, toast, updConn, showDownloadBtns } from './ui.js';
import { detectSpkChange, addSpeaker, setActiveSpk, getActiveSpk } from './speakers.js';
import { addEntry, updatePartial, removePartial, applyLiveCorrections, MED_RX } from './transcript.js';
import { getWhisperCode } from './languages.js';

let whisperUnlisten = null;
let dgTauriUnlisten = null;

/* Audio & Waveform */
export async function initAudio(stream){try{App.audioCtx=new(window.AudioContext||window.webkitAudioContext)();App.analyser=App.audioCtx.createAnalyser();App.analyser.fftSize=256;App.analyser.smoothingTimeConstant=0.7;App.audioCtx.createMediaStreamSource(stream).connect(App.analyser);animWave();}catch(e){console.warn('Audio analysis unavailable:',e);}}
export function animWave(){if(!App.isRecording||App.isPaused){resetWave();return;}const buf=new Uint8Array(App.analyser.frequencyBinCount);App.analyser.getByteFrequencyData(buf);const avg=buf.reduce((a,b)=>a+b,0)/buf.length/255;const n=D.waveBars.length;for(let i=0;i<n;i++){const v=buf[Math.floor(i/n*buf.length)]/255;D.waveBars[i].style.height=`${Math.max(4,v*32)}px`;D.waveBars[i].classList.remove('inactive');D.waveBars[i].style.background=avg>0.05?'var(--accent)':'var(--text-tertiary)';}detectSpkChange(avg);App.animFrame=requestAnimationFrame(animWave);}
export function resetWave(){D.waveBars.forEach(b=>{b.style.height='4px';b.classList.add('inactive');b.style.background='';});if(App.animFrame){cancelAnimationFrame(App.animFrame);App.animFrame=null;}}
export function stopAudio(){resetWave();if(App.audioCtx){App.audioCtx.close().catch(()=>{});App.audioCtx=null;App.analyser=null;}}

/* Audio Recording (for download) */
export function startAudioRecording(stream){
  try{
    const mime=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':MediaRecorder.isTypeSupported('audio/webm')?'audio/webm':'audio/mp4';
    App.mediaRecorder=new MediaRecorder(stream,{mimeType:mime});App.audioChunks=[];
    App.mediaRecorder.ondataavailable=e=>{if(e.data.size>0)App.audioChunks.push(e.data);};
    App.mediaRecorder.onstop=()=>{if(App.audioChunks.length>0){App.audioBlob=new Blob(App.audioChunks,{type:mime});showDownloadBtns();}};
    App.mediaRecorder.start(1000);
  }catch(e){console.warn('MediaRecorder not supported:',e);}
}
export function stopAudioRecording(){if(App.mediaRecorder&&App.mediaRecorder.state!=='inactive')App.mediaRecorder.stop();}
export function pauseAudioRecording(){if(App.mediaRecorder&&App.mediaRecorder.state==='recording')App.mediaRecorder.pause();}
export function resumeAudioRecording(){if(App.mediaRecorder&&App.mediaRecorder.state==='paused')App.mediaRecorder.resume();}
export function downloadAudio(){
  if(!App.audioBlob){toast('No audio recording available.','warning');return;}
  const ext=App.audioBlob.type.includes('webm')?'webm':'mp4';
  const url=URL.createObjectURL(App.audioBlob);const a=document.createElement('a');
  a.href=url;a.download=`ClinicalFlow_Audio_${new Date().toISOString().split('T')[0]}.${ext}`;
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);toast('Audio recording downloaded','success');
}

/* Memory Check */
export async function checkMemory() {
  if (!window.__TAURI__ || !tauriInvoke) return;
  try {
    const mem = await tauriInvoke('check_system_memory');
    console.debug(`[ClinicalFlow] Memory: ${mem.available_gb.toFixed(1)}GB free / ${mem.total_gb.toFixed(1)}GB total (${mem.used_percent.toFixed(0)}% used)`);
    if (mem.available_gb > 0.05 && mem.available_gb < 1.0) {
      toast('Very low memory — close other apps to avoid crashes.', 'error', 10000);
    } else if (mem.available_gb >= 1.0 && mem.available_gb < 2.0) {
      toast(`Low memory (${mem.available_gb.toFixed(1)}GB free). Performance may be affected.`, 'warning', 6000);
    }
  } catch (e) {
    console.warn('[ClinicalFlow] Memory check failed:', e);
  }
}

/* Deepgram Real-Time ASR */
export function startDeepgram(){
  const key=App.dgKey;if(!key){toast('No API key — switching to offline.','warning');if(tauriInvoke){startWhisper();}else{App.engine='webspeech';startWebSpeech();}return;}
  const p=new URLSearchParams({model:'nova-3-medical',language:App.language,smart_format:'true',punctuate:'true',interim_results:'true',utterance_end_ms:'1500',vad_events:'true',diarize:'true',encoding:'linear16',sample_rate:'16000',channels:'1'});
  const topMeds=MED_RX.slice(0,80);
  const clinicalTerms=['crepitus','effusion','erythematous','tympanic','bilateral','McMurray','ligamentous laxity','monofilament','syncope','dyspnea','pneumonia','hypertension','diabetes','atrial fibrillation','pulmonary embolism','anaphylaxis','pneumothorax'];
  const correctionTerms=CORRECTIONS_DICT.map(c=>c[1]).filter(t=>typeof t==='string');
  const allKeyterms=[...new Set([...topMeds,...clinicalTerms,...correctionTerms])];
  allKeyterms.slice(0,100).forEach(t=>p.append('keyterm',t));
  const url='wss://api.deepgram.com/v1/listen?'+p.toString();
  try{
    App.dgSocket=new WebSocket(url,['token',key]);
    App.dgSocket.onopen=()=>{App.engine='deepgram';updConn('connected','Online — connected');toast('Online transcription connected — speak now','success');App._audioChunks=0;if(tauriInvoke)startDGTauriPipeline();else startDGAudioPipeline();App.dgKA=setInterval(()=>{if(App.dgSocket&&App.dgSocket.readyState===WebSocket.OPEN)App.dgSocket.send(JSON.stringify({type:'KeepAlive'}));},8000);};
    App.dgSocket.onmessage=ev=>{if(typeof ev.data!=='string')return;try{handleDGMsg(JSON.parse(ev.data));}catch(err){console.error('[DG] parse error:',err);}};
    App.dgSocket.onerror=err=>{console.error('[DG] error:',err);toast('Online transcription failed — switching to offline.','error',5000);if(tauriInvoke){tauriInvoke('stop_recording').catch(()=>{}).then(()=>startWhisper());}else{App.engine='webspeech';updConn('fallback','Browser speech recognition');startWebSpeech();}};
    App.dgSocket.onclose=ev=>{clearInterval(App.dgKA);stopDGAudioPipeline();stopDGTauriPipeline();if(App.isRecording&&!App.isPaused&&App.engine==='deepgram'){if(ev.code===1008||ev.code===1003||ev.code===1002){toast('Transcription API key invalid. Check Settings.','error',6000);if(tauriInvoke){tauriInvoke('stop_recording').catch(()=>{}).then(()=>startWhisper());}else{App.engine='webspeech';updConn('fallback','Browser speech recognition');startWebSpeech();}}else setTimeout(()=>{if(App.isRecording&&!App.isPaused)startDeepgram();},1000);}};
  }catch(e){console.error('[DG] init:',e);if(tauriInvoke){tauriInvoke('stop_recording').catch(()=>{}).then(()=>startWhisper());}else{App.engine='webspeech';updConn('fallback','Browser speech recognition');startWebSpeech();}}
}
function startDGAudioPipeline(){
  if(!App.stream)return;
  try{App.dgAudioCtx=new(window.AudioContext||window.webkitAudioContext)({sampleRate:16000});const src=App.dgAudioCtx.createMediaStreamSource(App.stream);const proc=App.dgAudioCtx.createScriptProcessor(4096,1,1);src.connect(proc);proc.connect(App.dgAudioCtx.destination);
  proc.onaudioprocess=e=>{if(App.isPaused||!App.dgSocket||App.dgSocket.readyState!==WebSocket.OPEN)return;const f=e.inputBuffer.getChannelData(0);const pcm=new Int16Array(f.length);for(let i=0;i<f.length;i++){const s=Math.max(-1,Math.min(1,f[i]));pcm[i]=s<0?s*0x8000:s*0x7FFF;}App.dgSocket.send(pcm.buffer);App._audioChunks++;};
  App.dgProcessor=proc;App.dgSource=src;}catch(err){console.error('[DG] pipeline:',err);}
}
function stopDGAudioPipeline(){if(App.dgProcessor){try{App.dgProcessor.disconnect();}catch(e){}App.dgProcessor=null;}if(App.dgSource){try{App.dgSource.disconnect();}catch(e){}App.dgSource=null;}if(App.dgAudioCtx){App.dgAudioCtx.close().catch(()=>{});App.dgAudioCtx=null;}}
async function startDGTauriPipeline(){
  if(!tauriListen)return;
  dgTauriUnlisten=await tauriListen('audio-pcm',(ev)=>{
    if(!App.dgSocket||App.dgSocket.readyState!==WebSocket.OPEN||App.isPaused)return;
    const b64=ev.payload;
    const raw=atob(b64);
    const bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    App.dgSocket.send(bytes.buffer);
  });
}
function stopDGTauriPipeline(){if(dgTauriUnlisten){dgTauriUnlisten();dgTauriUnlisten=null;}}
function handleDGMsg(data){
  if(data.type==='Results'){const alt=data.channel.alternatives[0];const tx=alt.transcript;if(!tx||!tx.trim())return;
  if(alt.words&&alt.words.length>0&&alt.words[0].speaker!==undefined)handleDGSpk(alt.words[0].speaker);
  if(data.is_final){removePartial();addEntry(tx.trim(),alt.confidence||0.95);}else updatePartial(tx);}
  else if(data.type==='UtteranceEnd')removePartial();
}
function handleDGSpk(idx){if(idx<App.speakers.length){const t=App.speakers[idx];if(t.id!==App.activeSpkId){setActiveSpk(t.id);App.lastSpkChange=Date.now();}}else{const role=App.speakers.length===0?'doctor':App.speakers.length===1?'patient':'other';const s=addSpeaker('Speaker '+(App.speakers.length+1),role);setActiveSpk(s.id);}}
export function stopDeepgram(){stopDGAudioPipeline();stopDGTauriPipeline();clearInterval(App.dgKA);if(App.dgSocket){if(App.dgSocket.readyState===WebSocket.OPEN){try{App.dgSocket.send(JSON.stringify({type:'CloseStream'}));}catch(e){}}App.dgSocket.close();App.dgSocket=null;}}

/* Web Speech API */
export function initWebSpeech(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR)return false;
  App.recognition=new SR();App.recognition.continuous=true;App.recognition.interimResults=true;App.recognition.lang=App.language;App.recognition.maxAlternatives=1;
  App.recognition.onresult=ev=>{if(App.isPaused)return;for(let i=ev.resultIndex;i<ev.results.length;i++){const t=ev.results[i][0].transcript;if(ev.results[i].isFinal){removePartial();addEntry(t.trim(),ev.results[i][0].confidence);}else updatePartial(t);}};
  App.recognition.onerror=ev=>{if(ev.error==='no-speech'||ev.error==='aborted')return;if(ev.error==='not-allowed'||ev.error==='service-not-allowed'){toast('Microphone denied.','error',6000);/* stopRecording called by caller */return;}if(App.isRecording&&!App.isPaused)setTimeout(()=>{try{App.recognition.start();}catch(e){}},500);};
  App.recognition.onend=()=>{if(App.isRecording&&!App.isPaused&&App.engine==='webspeech')setTimeout(()=>{try{App.recognition.start();}catch(e){}},200);};
  return true;
}
export function startWebSpeech(){
  if(!App.recognition&&!initWebSpeech()){toast('No speech recognition available.','error',8000);return;}
  App.recognition.lang=App.language;updConn('fallback','Browser speech recognition');
  try{App.recognition.start();}catch(e){console.warn('Web Speech start:',e.message);}
}
export function stopWebSpeech(){if(App.recognition){try{App.recognition.stop();}catch(e){}}}

/* Whisper Engine (Local, via Tauri backend) */
export async function startWhisper(){
  if(!tauriInvoke){toast('Offline transcription requires the desktop app.','error');startWebSpeech();return;}
  await checkMemory();
  try{
    await tauriInvoke('start_recording',{mode:'whisper',language:getWhisperCode(App.language)});
    App.engine='whisper';
    updConn('connected','Offline (Whisper)');
    whisperUnlisten=await tauriListen('transcription',ev=>{
      const{text,is_partial}=ev.payload;
      if(is_partial){updatePartial(text);}
      else{removePartial();addEntry(text,0.95);}
    });
  }catch(e){
    console.error('Whisper start failed:',e);
    toast('Whisper failed: '+e,'error',6000);
  }
}
export async function stopWhisper(){
  if(!tauriInvoke)return;
  try{
    if(whisperUnlisten){whisperUnlisten();whisperUnlisten=null;}
    const wavPath=await tauriInvoke('stop_recording');
    if(wavPath)App.lastWavPath=wavPath;
  }catch(e){console.warn('Whisper stop:',e);}
}
/* Groq Engine (Cloud Whisper, via Tauri backend) */
export async function startGroq(){
  if(!tauriInvoke){toast('Groq transcription requires the desktop app.','error');startWebSpeech();return;}
  if(!App.groqKey){toast('No Groq API key — add one in Settings or switch modes.','warning');startWhisper();return;}
  try{
    await tauriInvoke('start_recording',{mode:'groq',language:getWhisperCode(App.language),groqApiKey:App.groqKey});
    App.engine='groq';
    updConn('connected','Online — Groq Whisper');
    whisperUnlisten=await tauriListen('transcription',ev=>{
      const{text,is_partial}=ev.payload;
      if(is_partial){updatePartial(text);}
      else{removePartial();addEntry(text,0.95);}
    });
  }catch(e){
    console.error('Groq start failed:',e);
    toast('Groq failed, falling back to offline: '+e,'warning',6000);
    startWhisper();
  }
}
export async function stopGroq(){
  if(!tauriInvoke)return;
  try{
    if(whisperUnlisten){whisperUnlisten();whisperUnlisten=null;}
    const wavPath=await tauriInvoke('stop_recording');
    if(wavPath)App.lastWavPath=wavPath;
  }catch(e){console.warn('Groq stop:',e);}
}

export async function pauseWhisper(){
  if(!tauriInvoke)return;
  try{await tauriInvoke('pause_recording');}catch(e){console.warn('Whisper pause:',e);}
}
export async function resumeWhisper(){
  if(!tauriInvoke)return;
  try{await tauriInvoke('resume_recording');}catch(e){console.warn('Whisper resume:',e);}
}
