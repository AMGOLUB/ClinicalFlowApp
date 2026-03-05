/* ============================================================
   CLINICALFLOW — Lock Screen, Auto-Lock, Welcome Wizard
   ============================================================ */
import { App, __TAURI_READY__, tauriInvoke, cfg, Config, ConfigFallback, _initTauri } from './state.js';
import { D, toast, showConfirm } from './ui.js';
import { ollamaCheck } from './settings.js';
import { checkSubscriptionPrePin, checkTrialWarning, initSubGate, subShowGate, subWaitForGateClose, syncSessionToCfg, migrateSessionFromCfg } from './subscription.js';
import { LANGUAGES } from './languages.js';

/* Auto-lock state */
let _autoLockTimer=null;
let _autoLockMs=5*60*1000;
let _appLocked=false;

function _cacheLockDOM(){
  const g=id=>document.getElementById(id);
  return {
    screen:g('lockScreen'),
    entryDiv:g('lockPinEntry'),createDiv:g('lockPinCreate'),
    pinInput:g('lockPinInput'),unlockBtn:g('lockUnlockBtn'),error:g('lockError'),
    newPin:g('lockNewPin'),confirmPin:g('lockConfirmPin'),createBtn:g('lockCreateBtn'),createError:g('lockCreateError')
  };
}

function _enforcePinInput(el){
  if(!el||el._pinEnforced)return;
  el._pinEnforced=true;
  el.addEventListener('input',()=>{
    el.value=el.value.replace(/\D/g,'').slice(0,8);
  });
}

function _showLockScreen(mode){
  const L=_cacheLockDOM();
  _enforcePinInput(L.pinInput);
  _enforcePinInput(L.newPin);
  _enforcePinInput(L.confirmPin);
  L.screen.style.display='flex';
  if(mode==='create'){
    L.entryDiv.style.display='none';L.createDiv.style.display='block';
    L.newPin.value='';L.confirmPin.value='';L.createError.textContent='';
    setTimeout(()=>L.newPin.focus(),100);
  }else{
    L.entryDiv.style.display='block';L.createDiv.style.display='none';
    L.pinInput.value='';L.error.textContent='';
    setTimeout(()=>L.pinInput.focus(),100);
  }
}

function _hideLockScreen(){
  const L=_cacheLockDOM();
  L.screen.style.display='none';
  _appLocked=false;
}

function _waitForPinCreate(){
  return new Promise(resolve=>{
    const L=_cacheLockDOM();
    const ac=new AbortController();
    function attempt(){
      const pin=L.newPin.value;
      const conf=L.confirmPin.value;
      L.createError.textContent='';
      if(pin.length<4||pin.length>8){L.createError.textContent='PIN must be 4-8 digits';L.newPin.classList.add('shake');setTimeout(()=>L.newPin.classList.remove('shake'),400);return;}
      if(!/^\d+$/.test(pin)){L.createError.textContent='PIN must contain only numbers';L.newPin.classList.add('shake');setTimeout(()=>L.newPin.classList.remove('shake'),400);return;}
      if(pin!==conf){L.createError.textContent='PINs do not match';L.confirmPin.classList.add('shake');setTimeout(()=>L.confirmPin.classList.remove('shake'),400);return;}
      L.createBtn.disabled=true;L.createBtn.textContent='Setting up...';
      tauriInvoke('create_pin',{pin}).then(()=>{
        ac.abort();resolve();
      }).catch(e=>{
        L.createError.textContent='Failed: '+e;
        L.createBtn.disabled=false;L.createBtn.innerHTML='Set PIN &amp; Continue';
      });
    }
    L.createBtn.addEventListener('click',attempt,{signal:ac.signal});
    L.confirmPin.addEventListener('keydown',e=>{if(e.key==='Enter')attempt();},{signal:ac.signal});
    L.newPin.addEventListener('keydown',e=>{if(e.key==='Enter')L.confirmPin.focus();},{signal:ac.signal});
  });
}

function _waitForPinEntry(){
  return new Promise(resolve=>{
    const L=_cacheLockDOM();
    const ac=new AbortController();
    function attempt(){
      const pin=L.pinInput.value;
      L.error.textContent='';
      if(!pin){L.error.textContent='Enter your PIN';return;}
      L.unlockBtn.disabled=true;L.unlockBtn.textContent='Verifying...';
      tauriInvoke('authenticate',{pin}).then(ok=>{
        if(ok){
          ac.abort();resolve();
        }else{
          L.error.textContent='Incorrect PIN';
          L.pinInput.classList.add('shake');
          setTimeout(()=>L.pinInput.classList.remove('shake'),400);
          L.pinInput.value='';L.pinInput.focus();
          L.unlockBtn.disabled=false;L.unlockBtn.textContent='Unlock';
        }
      }).catch(e=>{
        L.error.textContent='Error: '+e;
        L.unlockBtn.disabled=false;L.unlockBtn.textContent='Unlock';
      });
    }
    L.unlockBtn.addEventListener('click',attempt,{signal:ac.signal});
    L.pinInput.addEventListener('keydown',e=>{if(e.key==='Enter')attempt();},{signal:ac.signal});
    const forgotBtn=document.getElementById('lockForgotPin');
    if(forgotBtn){
      forgotBtn.addEventListener('click',async()=>{
        const ok=await showConfirm('Reset PIN?','This will erase all saved settings (API keys, preferences) and session data. You will set up a new PIN and reconfigure the app from scratch.','Delete All');
        if(!ok)return;
        try{
          await tauriInvoke('reset_pin');
          window.location.reload();
        }catch(e){
          L.error.textContent='Reset failed: '+e;
        }
      },{signal:ac.signal});
    }
  });
}

export function _resetAutoLock(){
  if(_autoLockMs<=0)return;
  clearTimeout(_autoLockTimer);
  if(tauriInvoke)tauriInvoke('update_activity').catch(()=>{});
  _autoLockTimer=setTimeout(()=>{
    if(App.isRecording||App.isPaused||D.statusText?.textContent==='Generating...'){
      _resetAutoLock();
      return;
    }
    lockApp();
  },_autoLockMs);
}

export function _startAutoLock(){
  ['mousemove','keydown','touchstart','click','scroll'].forEach(ev=>
    document.addEventListener(ev,_resetAutoLock,{passive:true})
  );
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){
      clearTimeout(_autoLockTimer);
      const hiddenMs=Math.min(_autoLockMs,60000);
      if(hiddenMs<=0)return;
      _autoLockTimer=setTimeout(()=>{
        if(App.isRecording||App.isPaused||D.statusText?.textContent==='Generating...'){
          _resetAutoLock();return;
        }
        lockApp();
      },hiddenMs);
    }else{
      _resetAutoLock();
    }
  });
  _resetAutoLock();
}

export async function lockApp(){
  if(_appLocked)return;
  _appLocked=true;
  clearTimeout(_autoLockTimer);
  if(tauriInvoke){
    try{await tauriInvoke('lock_app');}catch(e){console.warn('[ClinicalFlow] lock_app failed:',e);}
  }
  _showLockScreen('enter');
  await _waitForPinEntry();
  _hideLockScreen();
  _resetAutoLock();
}

/* Expose auto-lock mutators for initEvents security settings */
export function setAutoLockMs(ms){ _autoLockMs=ms; }
export function getAutoLockTimer(){ return _autoLockTimer; }
export function clearAutoLockTimer(){ clearTimeout(_autoLockTimer); }

/* ── Welcome Wizard ── */

export function showWelcomeWizard(){
  return new Promise(resolve=>{
    const wiz=document.getElementById('welcomeWizard');
    wiz.style.display='flex';
    let selectedMode='online';

    const screens=[
      document.getElementById('wizScreen1'),
      document.getElementById('wizScreenLang'),
      document.getElementById('wizScreen2'),
      document.getElementById('wizScreen3a'),
      document.getElementById('wizScreen3g'),
      document.getElementById('wizScreen3b'),
      document.getElementById('wizScreen4')
    ];

    // Populate wizard language select
    const wizLangSel=document.getElementById('wizLanguageSelect');
    if(wizLangSel){
      wizLangSel.innerHTML='';
      for(const lang of LANGUAGES){
        const opt=document.createElement('option');
        opt.value=lang.code;opt.textContent=lang.label;
        wizLangSel.appendChild(opt);
      }
      wizLangSel.value='en-US';
    }

    function showScreen(id){
      screens.forEach(s=>s.style.display='none');
      const el=document.getElementById(id);
      el.style.display='block';
      el.style.animation='none';
      el.offsetHeight;
      el.style.animation='';
    }

    document.getElementById('wizGetStarted').addEventListener('click',()=>showScreen('wizScreenLang'));

    document.getElementById('wizBackLang').addEventListener('click',()=>showScreen('wizScreen1'));
    document.getElementById('wizNextLang').addEventListener('click',()=>{
      if(wizLangSel) App.language=wizLangSel.value;
      showScreen('wizScreen2');
    });

    const modeCards=document.querySelectorAll('.wiz-mode-card');
    modeCards.forEach(card=>{
      card.addEventListener('click',()=>{
        modeCards.forEach(c=>c.classList.remove('selected'));
        card.classList.add('selected');
        selectedMode=card.dataset.mode;
      });
    });

    document.getElementById('wizBack2').addEventListener('click',()=>showScreen('wizScreenLang'));
    document.getElementById('wizNext2').addEventListener('click',()=>{
      if(selectedMode==='online'){
        showScreen('wizScreen3a');
      }else if(selectedMode==='groq'){
        showScreen('wizScreen3g');
      }else{
        showScreen('wizScreen3b');
        _wizCheckOffline();
      }
    });

    document.getElementById('wizBack3a').addEventListener('click',()=>showScreen('wizScreen2'));
    document.getElementById('wizNext3a').addEventListener('click',()=>showScreen('wizScreen4'));

    // Test Deepgram key
    document.getElementById('wizTestDg').addEventListener('click',async()=>{
      const key=document.getElementById('wizDgKey').value.trim();
      const statusEl=document.getElementById('wizDgStatus');
      if(!key){statusEl.className='wiz-key-status error';statusEl.textContent='Enter a key first';return;}
      statusEl.className='wiz-key-status';statusEl.textContent='Testing...';
      try{
        const ctrl=new AbortController();
        const timer=setTimeout(()=>ctrl.abort(),5000);
        const resp=await fetch('https://api.deepgram.com/v1/projects',{
          method:'GET',
          headers:{'Authorization':'Token '+key},
          signal:ctrl.signal
        });
        clearTimeout(timer);
        if(resp.ok){
          statusEl.className='wiz-key-status success';statusEl.textContent='Key is valid';
        }else if(resp.status===401||resp.status===403){
          statusEl.className='wiz-key-status error';statusEl.textContent='Invalid API key';
        }else{
          statusEl.className='wiz-key-status success';statusEl.textContent='Key accepted (status '+resp.status+')';
        }
      }catch(e){
        statusEl.className='wiz-key-status error';statusEl.textContent='Connection failed: '+e.message;
      }
    });

    // Test Claude key
    document.getElementById('wizTestClaude').addEventListener('click',async()=>{
      const key=document.getElementById('wizClaudeKey').value.trim();
      const statusEl=document.getElementById('wizClaudeStatus');
      if(!key){statusEl.className='wiz-key-status error';statusEl.textContent='Enter a key first';return;}
      statusEl.className='wiz-key-status';statusEl.textContent='Testing...';
      try{
        const ctrl=new AbortController();
        const timer=setTimeout(()=>ctrl.abort(),5000);
        const resp=await fetch('https://api.anthropic.com/v1/messages',{
          method:'POST',
          headers:{'x-api-key':key,'anthropic-version':'2023-06-01','content-type':'application/json','anthropic-dangerous-direct-browser-access':'true'},
          body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:1,messages:[{role:'user',content:'hi'}]}),
          signal:ctrl.signal
        });
        clearTimeout(timer);
        if(resp.ok||resp.status===200){
          statusEl.className='wiz-key-status success';statusEl.textContent='Key is valid';
        }else if(resp.status===401){
          statusEl.className='wiz-key-status error';statusEl.textContent='Invalid API key';
        }else{
          statusEl.className='wiz-key-status success';statusEl.textContent='Key accepted (status '+resp.status+')';
        }
      }catch(e){
        statusEl.className='wiz-key-status error';statusEl.textContent='Connection failed: '+e.message;
      }
    });

    // Groq setup screen navigation
    document.getElementById('wizBack3g').addEventListener('click',()=>showScreen('wizScreen2'));
    document.getElementById('wizNext3g').addEventListener('click',()=>showScreen('wizScreen4'));

    // Test Groq key
    document.getElementById('wizTestGroq').addEventListener('click',async()=>{
      const key=document.getElementById('wizGroqKey').value.trim();
      const statusEl=document.getElementById('wizGroqStatus');
      if(!key){statusEl.className='wiz-key-status error';statusEl.textContent='Enter a key first';return;}
      if(!key.startsWith('gsk_')){statusEl.className='wiz-key-status error';statusEl.textContent='Groq keys start with gsk_';return;}
      statusEl.className='wiz-key-status';statusEl.textContent='Testing...';
      try{
        const ctrl=new AbortController();
        const timer=setTimeout(()=>ctrl.abort(),5000);
        const resp=await fetch('https://api.groq.com/openai/v1/models',{
          method:'GET',
          headers:{'Authorization':'Bearer '+key},
          signal:ctrl.signal
        });
        clearTimeout(timer);
        if(resp.ok){
          statusEl.className='wiz-key-status success';statusEl.textContent='Key is valid';
        }else if(resp.status===401||resp.status===403){
          statusEl.className='wiz-key-status error';statusEl.textContent='Invalid API key';
        }else{
          statusEl.className='wiz-key-status success';statusEl.textContent='Key accepted (status '+resp.status+')';
        }
      }catch(e){
        statusEl.className='wiz-key-status error';statusEl.textContent='Connection failed: '+e.message;
      }
    });

    // Test Claude key (Groq screen — same logic as online screen)
    document.getElementById('wizTestClaudeGroq').addEventListener('click',async()=>{
      const key=document.getElementById('wizClaudeKeyGroq').value.trim();
      const statusEl=document.getElementById('wizClaudeStatusGroq');
      if(!key){statusEl.className='wiz-key-status error';statusEl.textContent='Enter a key first';return;}
      statusEl.className='wiz-key-status';statusEl.textContent='Testing...';
      try{
        const ctrl=new AbortController();
        const timer=setTimeout(()=>ctrl.abort(),5000);
        const resp=await fetch('https://api.anthropic.com/v1/messages',{
          method:'POST',
          headers:{'x-api-key':key,'anthropic-version':'2023-06-01','content-type':'application/json','anthropic-dangerous-direct-browser-access':'true'},
          body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:1,messages:[{role:'user',content:'hi'}]}),
          signal:ctrl.signal
        });
        clearTimeout(timer);
        if(resp.ok||resp.status===200){
          statusEl.className='wiz-key-status success';statusEl.textContent='Key is valid';
        }else if(resp.status===401){
          statusEl.className='wiz-key-status error';statusEl.textContent='Invalid API key';
        }else{
          statusEl.className='wiz-key-status success';statusEl.textContent='Key accepted (status '+resp.status+')';
        }
      }catch(e){
        statusEl.className='wiz-key-status error';statusEl.textContent='Connection failed: '+e.message;
      }
    });

    document.getElementById('wizBack3b').addEventListener('click',()=>showScreen('wizScreen2'));
    document.getElementById('wizNext3b').addEventListener('click',()=>showScreen('wizScreen4'));
    document.getElementById('wizTestOllama').addEventListener('click',()=>_wizCheckOffline());

    document.getElementById('wizFinish').addEventListener('click',()=>{
      const dgKey=document.getElementById('wizDgKey')?.value.trim()||'';
      const claudeKey=document.getElementById('wizClaudeKey')?.value.trim()||'';
      const groqKey=document.getElementById('wizGroqKey')?.value.trim()||'';
      const claudeKeyGroq=document.getElementById('wizClaudeKeyGroq')?.value.trim()||'';
      App.transcriptionMode=selectedMode; // 'online', 'groq', or 'offline'
      App.aiEngine=selectedMode==='offline'?'ollama':'cloud';
      if(dgKey){App.dgKey=dgKey;}
      if(groqKey){App.groqKey=groqKey;}
      // Use Claude key from whichever screen was filled
      const finalClaudeKey=claudeKey||claudeKeyGroq;
      if(finalClaudeKey){App.claudeKey=finalClaudeKey;}
      if(wizLangSel) App.language=wizLangSel.value;
      tauriInvoke('set_welcome_completed').catch(e=>console.warn('[ClinicalFlow] set_welcome_completed failed:',e));
      wiz.style.display='none';
      resolve({mode:selectedMode,dgKey,claudeKey:finalClaudeKey,groqKey});
    });
  });
}

async function _wizCheckOffline(){
  const ollamaIcon=document.getElementById('wizOllamaIcon');
  const ollamaStatus=document.getElementById('wizOllamaStatus');
  const whisperIcon=document.getElementById('wizWhisperIcon');
  whisperIcon.className='wiz-check-icon ok';
  ollamaStatus.textContent='Checking...';
  ollamaIcon.className='wiz-check-icon';
  try{
    const resp=await fetch('http://localhost:11434/api/tags',{signal:AbortSignal.timeout(3000)});
    if(resp.ok){
      const data=await resp.json();
      const count=data.models?.length||0;
      ollamaIcon.className='wiz-check-icon ok';
      ollamaStatus.textContent=`Connected — ${count} model${count!==1?'s':''} available`;
    }else{
      ollamaIcon.className='wiz-check-icon warn';
      ollamaStatus.textContent='Ollama responded with error '+resp.status;
    }
  }catch(e){
    ollamaIcon.className='wiz-check-icon warn';
    ollamaStatus.textContent='Not running — install from ollama.com and run "ollama serve"';
  }
}

/* ── Main Auth Entry Point ── */

export async function checkAuthAndInit(initApp){
  _initTauri();

  if(!__TAURI_READY__){
    await initApp();
    return;
  }

  // Step 1: Pre-PIN subscription check (login BEFORE PIN)
  let subResult=null;
  const hasEnv=typeof window.ENV!=='undefined'&&window.ENV.SUPABASE_URL&&!window.ENV.SUPABASE_URL.startsWith('__');
  if(hasEnv){
    initSubGate(null);  // null = pre-PIN mode
    subResult=await checkSubscriptionPrePin();

    if(!subResult.valid){
      if(subResult.reason==='not_registered'){
        subShowGate('auth');
      }else if(subResult.status==='pending_verification'){
        subShowGate('pending_verification');
      }else{
        subShowGate('expired',subResult.reason);
      }
      await subWaitForGateClose();
      // Re-check after gate closes (user may have logged in / upgraded)
      subResult=await checkSubscriptionPrePin();
    }

    // Trial warning toast (once per day, <=3 days remaining)
    if(subResult&&subResult.valid){
      checkTrialWarning(subResult);
    }
  }

  // Step 2: PIN entry / creation
  let isFirstLaunch=false;
  try{
    const hasPin=await tauriInvoke('check_has_pin');
    if(!hasPin){
      isFirstLaunch=true;
      _showLockScreen('create');
      await _waitForPinCreate();
      _hideLockScreen();
    }else{
      _showLockScreen('enter');
      await _waitForPinEntry();
      _hideLockScreen();
    }
  }catch(e){
    console.error('[ClinicalFlow] Auth check failed:',e);
  }

  // Step 3: Initialize config (needs PIN in AppState for decryption)
  cfg.init(window.__TAURI__ ? Config : ConfigFallback);
  await cfg.load();

  // Step 4: Sync pre-PIN session data into cfg
  if(hasEnv){
    await syncSessionToCfg(cfg);
    // Migration: if cfg has old tokens but no session.json, populate it
    await migrateSessionFromCfg(cfg);
  }

  // Step 5: Welcome wizard
  let wizResult=null;
  try{
    const welcomeDone=await tauriInvoke('check_welcome_completed');
    if(!welcomeDone){
      wizResult=await showWelcomeWizard();
    }
  }catch(e){
    console.error('[ClinicalFlow] Welcome check failed:',e);
  }

  await initApp();

  if(wizResult){
    cfg.set('ms-tx-mode',App.transcriptionMode);
    cfg.set('ms-ai-engine',App.aiEngine);
    cfg.set('ms-language',App.language);
    if(wizResult.dgKey){cfg.set('ms-dg-key',wizResult.dgKey);}
    if(wizResult.groqKey){cfg.set('ms-groq-key',wizResult.groqKey);}
    if(wizResult.claudeKey){cfg.set('ms-claude-key',wizResult.claudeKey);}
    await cfg._flush();
  }

  _autoLockMs=parseInt(cfg.get('ms-autolock-minutes','5'),10)*60*1000;
  if(_autoLockMs>0)_startAutoLock();
}
