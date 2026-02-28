/* ============================================================
   CLINICALFLOW — Speaker Management
   ============================================================ */
import { App } from './state.js';
import { D, esc, rInt } from './ui.js';

export const ROLES={doctor:{label:'Physician',ab:'Dr',cc:'doctor'},patient:{label:'Patient',ab:'Pt',cc:'patient'},other:{label:'Other',ab:'Ot',cc:'other'}};

export function addSpeaker(name,role='other'){const s={id:App.nextSpkId++,name,role,cc:ROLES[role]?.cc||'other',speaking:false,wc:0};App.speakers.push(s);renderSpeakers();updSpkCount();return s;}
export function renameSpeaker(id,nm){const s=App.speakers.find(x=>x.id===id);if(s){s.name=nm;App.entries.forEach(e=>{if(e.spkId===id)e.spkName=nm;});renderSpeakers();renderEntries();}}
export function setActiveSpk(id){App.speakers.forEach(s=>s.speaking=false);const s=App.speakers.find(x=>x.id===id);if(s){s.speaking=true;App.activeSpkId=id;D.actSpkBadge.style.display='flex';D.actSpkName.textContent=s.name;D.actSpkDot.style.background=`var(--speaker-${s.cc})`;}renderSpeakers();}
export function getActiveSpk(){return App.speakers.find(s=>s.id===App.activeSpkId)||null;}
export function updSpkCount(){D.speakerCount.textContent=`(${App.speakers.length})`;}
export function detectSpkChange(lvl){if(!App.settings.autoDetect||App.speakers.length<2)return;const now=Date.now();if(lvl<0.02){if(!App.silStart)App.silStart=now;else if(now-App.silStart>App.silThresh&&now-App.lastSpkChange>3000){const i=App.speakers.findIndex(s=>s.id===App.activeSpkId);setActiveSpk(App.speakers[(i+1)%App.speakers.length].id);App.lastSpkChange=now;App.silStart=null;}}else App.silStart=null;}

export function renderSpeakers(){
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

/* renderEntries is imported lazily to avoid circular dep with transcript.js */
let _renderEntries = null;
export function setRenderEntries(fn) { _renderEntries = fn; }
function renderEntries() { if (_renderEntries) _renderEntries(); }
