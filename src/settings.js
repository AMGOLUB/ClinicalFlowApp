/* ============================================================
   CLINICALFLOW — Settings Management
   ============================================================ */
import { App, cfg, tauriInvoke } from './state.js';
import { D, toast, updConn, wait } from './ui.js';
import { renderEntries } from './transcript.js';
import { subOpenBillingPortal, subLogOut } from './subscription.js';
import { TEMPLATE_CATEGORIES, getTemplateRegistry } from './templates.js';
import { isDentalTemplate, renderDentalPreview, updateDentalSummary } from './dental-chart.js';
import { updateNoteActions } from './notes.js';
import { closePalette } from './dictionary-features.js';

/* ── Ollama Integration ── */

export async function ollamaCheck(){
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
    if(count===0){
      toast('Ollama is running but has no models. Open a terminal and run: ollama pull llama3.1:8b','warning',10000);
    }
    return true;
  }catch(e){
    App.ollamaConnected=false;
    App.ollamaModels=[];
    populateModelSelect();
    updOllamaStatus('disconnected','Not connected — is Ollama running?');
    return false;
  }
}

export async function ollamaCheckWithRetry(maxRetries=3,delayMs=2000){
  for(let attempt=1;attempt<=maxRetries;attempt++){
    await ollamaCheck();
    if(App.ollamaConnected)return true;
    if(attempt<maxRetries){
      console.debug(`[ClinicalFlow] Ollama not ready, retry ${attempt}/${maxRetries} in ${delayMs}ms...`);
      await wait(delayMs);
      delayMs=Math.round(delayMs*1.5);
    }
  }
  return false;
}

export function updOllamaStatus(state,text){
  D.ollamaStatus.className='api-key-status '+state;
  D.ollamaStatusText.textContent=text;
}

export function populateModelSelect(){
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
  const saved=cfg.get('ms-ollama-model',null);
  if(saved&&App.ollamaModels.includes(saved)){
    D.ollamaModelSelect.value=saved;
    App.ollamaModel=saved;
  }else{
    App.ollamaModel=App.ollamaModels[0];
    D.ollamaModelSelect.value=App.ollamaModel;
  }
}

export function saveOllamaSettings(){
  cfg.set('ms-ollama-url',App.ollamaUrl);
  cfg.set('ms-ollama-model',App.ollamaModel);
  cfg.set('ms-ai-engine',App.aiEngine);
  cfg.set('ms-ollama-verify',App.ollamaVerify?'1':'0');
}

export function loadOllamaSettings(){
  App.ollamaUrl=cfg.get('ms-ollama-url','http://localhost:11434');
  App.ollamaModel=cfg.get('ms-ollama-model','llama3.1:8b');
  App.aiEngine=cfg.get('ms-ai-engine','cloud');
  App.ollamaVerify=cfg.get('ms-ollama-verify','0')==='1';
  if(D.ollamaUrl)D.ollamaUrl.value=App.ollamaUrl;
  if(D.aiEngineToggle){
    D.aiEngineToggle.querySelectorAll('.theme-option').forEach(b=>{
      b.classList.toggle('active',b.dataset.engine===App.aiEngine);
    });
    if(D.cloudAISettings)D.cloudAISettings.style.display=App.aiEngine==='cloud'?'':'none';
    if(D.ollamaSettings)D.ollamaSettings.style.display=App.aiEngine==='ollama'?'':'none';
  }
  const vt=document.getElementById('settingOllamaVerify');
  if(vt){vt.classList.toggle('active',App.ollamaVerify);vt.setAttribute('aria-checked',App.ollamaVerify);}
}

/* ── Claude API Key ── */

export function loadClaudeKey(){
  const key=cfg.get('ms-claude-key','');
  App.claudeKey=key;
  const input=document.getElementById('claudeKeyInput');
  if(input)input.value=key?'••••••••••••••••':'';
  App.claudeVerify=cfg.get('ms-claude-verify','1')==='1';
  const cvt=document.getElementById('settingClaudeVerify');
  if(cvt){cvt.classList.toggle('active',App.claudeVerify);cvt.setAttribute('aria-checked',App.claudeVerify);}
  updClaudeStatus();
}

export function saveClaudeKey(){
  const input=document.getElementById('claudeKeyInput');
  const key=input.value.trim();
  if(!key||key.includes('•')){toast('Enter a valid API key.','warning');return;}
  if(!key.startsWith('sk-ant-')){toast('Anthropic API keys start with sk-ant-','warning');return;}
  App.claudeKey=key;
  cfg.set('ms-claude-key',key);
  input.value='••••••••••••••••';
  updClaudeStatus();
  toast('API key saved. Cloud AI is ready.','success');
}

export function updClaudeStatus(){
  const dot=document.getElementById('claudeStatus');
  const text=document.getElementById('claudeStatusText');
  if(!dot||!text)return;
  if(App.claudeKey){
    dot.className='api-key-status connected';
    text.textContent='API key saved — Cloud AI ready';
  }else{
    dot.className='api-key-status disconnected';
    text.textContent='No API key';
  }
}

/* ── Deepgram API Key ── */

export function loadApiKey(){
  const key=cfg.get('ms-dg-key','');App.dgKey=key;if(D.dgInput)D.dgInput.value=key?'••••••••••••••••':'';
  App.transcriptionMode=cfg.get('ms-tx-mode','online');
  if(D.txModeToggle){
    D.txModeToggle.querySelectorAll('.theme-option').forEach(b=>b.classList.toggle('active',b.dataset.mode===App.transcriptionMode));
  }
  if(D.onlineSettings)D.onlineSettings.style.display=App.transcriptionMode==='online'?'':'none';
  updApiStatus();
}

export function saveApiKey(){const key=D.dgInput.value.trim();if(!key||key.includes('•')){toast('Enter a valid API key.','warning');return;}App.dgKey=key;cfg.set('ms-dg-key',key);D.dgInput.value='••••••••••••••••';updApiStatus();toast('API key saved','success');}

export function updApiStatus(){
  if(App.transcriptionMode==='online'&&App.dgKey){
    D.dgStatus.className='api-key-status connected';D.dgStatusText.textContent='Online — API key saved';updConn('connected','Online — Deepgram connected');
  }else if(App.transcriptionMode==='online'&&!App.dgKey){
    D.dgStatus.className='api-key-status disconnected';D.dgStatusText.textContent='No API key configured';updConn('disconnected','No Deepgram API key');
  }else{
    D.dgStatus.className='api-key-status connected';D.dgStatusText.textContent='Offline — Whisper ready';updConn('connected','Offline (Whisper)');
  }
}

/* ── Toggles & Format Selector ── */

export function initToggles(){
  document.querySelectorAll('.toggle').forEach(t=>{
    if(t.id==='settingOllamaVerify'||t.id==='settingClaudeVerify')return;
    t.addEventListener('click',()=>{
      const s=t.dataset.setting;const a=t.classList.toggle('active');t.setAttribute('aria-checked',a);
      if(s&&App.settings.hasOwnProperty(s))App.settings[s]=a;
      document.querySelectorAll(`.toggle[data-setting="${s}"]`).forEach(x=>{x.classList.toggle('active',a);x.setAttribute('aria-checked',a);});
      if(s==='timestamps'||s==='highlightTerms')renderEntries();
      if(s==='showCopyEhr'||s==='showExportHl7'||s==='showNarrative'||s==='showSyncPms')updateNoteActions();
      if(s==='dictionaryFeatures'){if(!a)closePalette();updateNoteActions();}
      if(s==='noteLineActions')document.querySelectorAll('.note-line-actions').forEach(el=>{el.style.display=a?'':'none';});
    });
    t.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();t.click();}});
  });
}

export function initFmtSel(){
  refreshFmtSel();
  D.fmtSel.addEventListener('change',()=>{
    App.noteFormat=D.fmtSel.value;
    cfg.set('ms-note-format',App.noteFormat);
    _toggleDentalChart();
  });
  _toggleDentalChart();
}

function _toggleDentalChart(){
  const sec=document.getElementById('dentalChartSection');
  if(!sec)return;
  const show=isDentalTemplate(App.noteFormat);
  sec.style.display=show?'':'none';
  const dsg=document.getElementById('settingsDentalGroup');
  if(dsg) dsg.style.display=show?'':'none';
  if(show){
    renderDentalPreview();
    updateDentalSummary();
  }
}

export function updateDentalChartVisibility(){ _toggleDentalChart(); }

export function refreshFmtSel(){
  const sel=D.fmtSel;if(!sel)return;
  const registry=getTemplateRegistry(cfg);
  const prev=sel.value||App.noteFormat||'soap';
  sel.innerHTML='';
  for(const cat of TEMPLATE_CATEGORIES){
    const templates=Object.values(registry).filter(t=>t.category===cat.id);
    if(templates.length===0)continue;
    const group=document.createElement('optgroup');
    group.label=cat.label;
    for(const tmpl of templates){
      const opt=document.createElement('option');
      opt.value=tmpl.id;opt.textContent=tmpl.label;
      if(tmpl.description)opt.title=tmpl.description;
      group.appendChild(opt);
    }
    sel.appendChild(group);
  }
  if(registry[prev])sel.value=prev;
  else sel.value='soap';
  App.noteFormat=sel.value;
}

/* ── Custom Template CRUD ── */

export function buildCustomPrompt(name,sections){
  let prompt=`Output a **${name}** with these sections:\n\n`;
  for(const s of sections)prompt+=`**${s.toUpperCase()}**\n`;
  prompt+=`\nFor each section, extract relevant information from the transcript. If no information is available for a section, write "Not discussed." Do not fabricate findings.`;
  return prompt;
}

export function saveCustomTemplate(){
  const nameInput=document.getElementById('customTemplateName');
  const name=(nameInput?.value||'').trim();
  if(!name){toast('Enter a template name','warning');return;}
  const rows=document.querySelectorAll('.template-section-input');
  const sections=[];
  rows.forEach(input=>{const v=input.value.trim();if(v)sections.push(v);});
  if(sections.length<2){toast('Add at least 2 sections','warning');return;}
  const id='custom_'+name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/_+$/,'');
  const prompt=buildCustomPrompt(name,sections);
  const tmpl={id,label:name,description:'Custom template',category:'custom',sections,noteTitle:name,prompt};
  let customs=[];
  try{customs=JSON.parse(cfg.get('ms-custom-templates','[]'));}catch(e){}
  customs=customs.filter(c=>c.id!==id);
  customs.push(tmpl);
  cfg.set('ms-custom-templates',JSON.stringify(customs));
  refreshFmtSel();
  App.noteFormat=id;
  D.fmtSel.value=id;
  const modal=document.getElementById('customTemplateModal');
  if(modal)modal.style.display='none';
  toast('Template saved','success');
}

export function addTemplateSection(){
  const list=document.getElementById('templateSectionList');
  if(!list)return;
  const row=document.createElement('div');
  row.className='template-section-row';
  row.innerHTML='<input type="text" class="template-section-input" placeholder="Section name">'
    +'<button class="btn btn-xs btn-ghost template-section-remove">&times;</button>';
  row.querySelector('.template-section-remove').addEventListener('click',()=>row.remove());
  list.appendChild(row);
  row.querySelector('input').focus();
}

export function removeTemplateSection(btn){
  btn.closest('.template-section-row')?.remove();
}

/* ── Account & Subscription ── */

export function loadAccountSettings(){
  const email=cfg.get('ms-supabase-email');
  const tier=cfg.get('ms-sub-tier');
  const status=cfg.get('ms-sub-status');
  const trialEnds=cfg.get('ms-trial-ends');
  const subEnds=cfg.get('ms-sub-ends');

  const emailEl=document.getElementById('settingsEmail');
  if(emailEl) emailEl.textContent=email||'\u2014';

  const planEl=document.getElementById('settingsPlan');
  if(planEl){
    planEl.textContent={'trial':'Free Trial','pro':'ClinicalFlow Pro','team':'ClinicalFlow Team','enterprise':'Enterprise'}[tier]||'\u2014';
  }

  const statusEl=document.getElementById('settingsSubStatus');
  if(statusEl){
    const map={
      'trial':{text:'\u25CF Active (trial)',color:'var(--accent)'},
      'active':{text:'\u25CF Active',color:'#34D399'},
      'past_due':{text:'\u26A0 Payment due',color:'#FBBF24'},
      'canceled':{text:'\u25CB Canceled',color:'var(--text-tertiary)'},
      'expired':{text:'\u2715 Expired',color:'#F87171'}
    };
    const s=map[status]||{text:'\u2014',color:'var(--text-tertiary)'};
    statusEl.textContent=s.text;
    statusEl.style.color=s.color;
  }

  const trialRow=document.getElementById('settingsTrialRow');
  const trialEl=document.getElementById('settingsTrialEnds');
  if(trialRow&&trialEl){
    if(status==='trial'&&trialEnds){
      const daysLeft=Math.max(0,Math.ceil((new Date(trialEnds).getTime()-Date.now())/(1000*60*60*24)));
      trialEl.textContent=`${daysLeft} day${daysLeft!==1?'s':''} remaining`;
      trialRow.style.display='flex';
    }else{
      trialRow.style.display='none';
    }
  }

  const subEndsRow=document.getElementById('settingsSubEndsRow');
  const subEndsEl=document.getElementById('settingsSubEnds');
  if(subEndsRow&&subEndsEl){
    if((status==='active'||status==='canceled')&&subEnds){
      subEndsEl.textContent=new Date(subEnds).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
      subEndsRow.style.display='flex';
    }else{
      subEndsRow.style.display='none';
    }
  }

  // Team seats
  const seatsRow=document.getElementById('settingsSeatsRow');
  const seatsEl=document.getElementById('settingsSeats');
  if(seatsRow&&seatsEl){
    const seats=parseInt(cfg.get('ms-sub-seats','0'))||0;
    if(tier==='team'&&seats>0){
      seatsEl.textContent=`${seats} seat${seats!==1?'s':''}`;
      seatsRow.style.display='flex';
    }else{
      seatsRow.style.display='none';
    }
  }

  // Device name
  const devicesRow=document.getElementById('settingsDevicesRow');
  const devicesEl=document.getElementById('settingsDevices');
  if(devicesRow&&devicesEl){
    if(tier==='team'&&tauriInvoke){
      tauriInvoke('get_device_info').then(([,name])=>{
        devicesEl.textContent=name;
        devicesRow.style.display='flex';
      }).catch(()=>{devicesRow.style.display='none';});
    }else{
      devicesRow.style.display='none';
    }
  }

  // Billing portal
  document.getElementById('settingsManageBilling')?.addEventListener('click',async()=>{
    try{await subOpenBillingPortal(cfg);}
    catch(err){toast('Could not open billing portal: '+err.message,'error');}
  },{once:true});

  // Logout
  document.getElementById('settingsLogout')?.addEventListener('click',async()=>{
    await subLogOut(cfg);
    if(window.__TAURI__){window.location.reload();}
  },{once:true});
}

/* ── EHR Integration Settings ── */

export function loadEhrSettings(){
  const el=(id,key)=>{const e=document.getElementById(id);if(e)e.value=cfg.get(key,'');};
  el('ehrFacilityName','ms-ehr-facility-name');
  el('ehrFacilityId','ms-ehr-facility-id');
  el('ehrDefaultMrn','ms-ehr-default-mrn');
}

export function initEhrSettings(){
  const wire=(id,key)=>{const e=document.getElementById(id);if(e)e.addEventListener('change',()=>cfg.set(key,e.value.trim()));};
  wire('ehrFacilityName','ms-ehr-facility-name');
  wire('ehrFacilityId','ms-ehr-facility-id');
  wire('ehrDefaultMrn','ms-ehr-default-mrn');
}
