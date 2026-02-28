/* ============================================================
   CLINICALFLOW — Transcript Entries, Rendering, Search
   ============================================================ */
import { App, CORRECTIONS_DICT, cfg } from './state.js';
import { D, fmt, fmtDate, fmtDT, wc, esc, debounce, toast } from './ui.js';
import { getActiveSpk, addSpeaker, setActiveSpk, ROLES, setRenderEntries } from './speakers.js';
import { saveSession } from './session.js';
import { hlTerms as _hlTerms, applyLiveCorrections as _applyCorrections, MED_TERMS, MED_RX } from './pure.js';
import { isDentalTemplate } from './dental-chart.js';
import { processPerioEntry } from './perio-voice-parser.js';
export { MED_TERMS, MED_RX };

export function hlTerms(text){ return _hlTerms(text); }

export function applyLiveCorrections(t){
  return _applyCorrections(t, CORRECTIONS_DICT);
}

export function addEntry(text,conf=1){
  if(!text.trim())return;
  text=applyLiveCorrections(text);
  if(!getActiveSpk()&&App.speakers.length===0){addSpeaker('Doctor','doctor');addSpeaker('Patient','patient');setActiveSpk(App.speakers[0].id);}
  const sp=getActiveSpk();const e={id:App.nextEntryId++,spkId:sp?.id||0,spkName:sp?.name||'Unknown',spkRole:sp?.role||'unknown',spkColor:sp?.cc||'unknown',text:text.trim(),ts:App.elapsed,conf};
  App.entries.push(e);if(sp)sp.wc+=wc(text);removePartial();renderOneEntry(e);updWordCount();
  if(App.settings.autoScroll)D.txContent.scrollTop=D.txContent.scrollHeight;
  /* Process perio voice commands for dental templates */
  if(isDentalTemplate(App.noteFormat))try{processPerioEntry(text.trim());}catch(ex){/* perio parse error — non-fatal */}
  saveSession();
}

export function updatePartial(text){
  let el=document.getElementById('partialEntry');const sp=getActiveSpk();
  if(!el){el=document.createElement('div');el.className='transcript-entry';el.id='partialEntry';
    el.innerHTML=`<div class="entry-speaker-indicator ${sp?.cc||'unknown'}"></div><div class="entry-content"><div class="entry-header"><span class="entry-speaker-name ${sp?.cc||'unknown'}">${esc(sp?.name||'Unknown')}</span><span class="entry-timestamp">${fmt(App.elapsed)}</span></div><div class="entry-text partial"><span class="partial-text"></span><span class="typing-cursor"></span></div></div>`;
    D.txEntries.appendChild(el);D.txEmpty.style.display='none';D.txEntries.style.display='block';}
  const t=el.querySelector('.partial-text');if(t)t.textContent=text;
  if(App.settings.autoScroll)D.txContent.scrollTop=D.txContent.scrollHeight;
}

export function removePartial(){const el=document.getElementById('partialEntry');if(el)el.remove();}

export function renderOneEntry(e){
  D.txEmpty.style.display='none';D.txEntries.style.display='block';
  const el=document.createElement('div');el.className='transcript-entry';el.dataset.entryId=e.id;
  const ts=App.settings.timestamps?`<span class="entry-timestamp">${fmt(e.ts)}</span>`:'';
  const confH=e.conf<0.8?`<div class="confidence-bar"><div class="confidence-fill ${e.conf>0.6?'medium':'low'}" style="width:${Math.round(e.conf*100)}%"></div></div>`:'';
  let txt=esc(e.text);if(App.settings.highlightTerms)txt=hlTerms(txt);
  el.innerHTML=`<div class="entry-speaker-indicator ${e.spkColor}"></div><div class="entry-content"><div class="entry-header"><span class="entry-speaker-name ${e.spkColor}">${esc(e.spkName)}</span>${ts}</div><div class="entry-text">${txt}</div>${confH}</div>`;
  D.txEntries.appendChild(el);
}

export function renderEntries(){D.txEntries.innerHTML='';if(App.entries.length===0){D.txEmpty.style.display='flex';D.txEntries.style.display='none';return;}D.txEmpty.style.display='none';D.txEntries.style.display='block';App.entries.forEach(e=>renderOneEntry(e));}
export function clearTx(){App.entries=[];App.nextEntryId=1;D.txEntries.innerHTML='';D.txEmpty.style.display='flex';D.txEntries.style.display='none';updWordCount();toast('Transcript cleared','info');}
export function updWordCount(){const t=App.entries.reduce((s,e)=>s+wc(e.text),0);D.wordCount.textContent=`${t} word${t!==1?'s':''}`;}

/* Transcript Download */
export function downloadTranscript(){
  if(App.entries.length===0){toast('No transcript to download.','warning');return;}
  const hdr=['ClinicalFlow — Transcript',`Date: ${fmtDate(App.sessionStartTime||new Date())}`,`Duration: ${fmt(App.elapsed)}`,`Speakers: ${App.speakers.map(s=>`${s.name} (${ROLES[s.role]?.label})`).join(', ')}`,`Words: ${App.entries.reduce((s,e)=>s+wc(e.text),0)}`,'─'.repeat(50),''].join('\n');
  const body=App.entries.map(e=>`[${fmt(e.ts)}] ${e.spkName} (${ROLES[e.spkRole]?.label||'Unknown'}):\n${e.text}\n`).join('\n');
  const blob=new Blob([hdr+body],{type:'text/plain'});const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`ClinicalFlow_Transcript_${new Date().toISOString().split('T')[0]}.txt`;
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);toast('Transcript downloaded','success');
}

/* Search */
export function toggleSearch(){
  const vis=D.searchBar.classList.contains('visible');
  if(vis){D.searchBar.classList.remove('visible');D.searchInput.value='';clrHL();}
  else{D.searchBar.classList.add('visible');D.searchInput.focus();}
}
export const doSearch=debounce(q=>{clrHL();if(!q.trim())return;const lq=q.toLowerCase();let f=0;D.txEntries.querySelectorAll('.transcript-entry').forEach(el=>{const t=el.querySelector('.entry-text');if(t&&t.textContent.toLowerCase().includes(lq)){el.style.background='var(--accent-dim)';f++;}});if(f===0)toast(`No results for "${q}"`,'info');},300);
export function clrHL(){D.txEntries.querySelectorAll('.transcript-entry').forEach(el=>el.style.background='');}

/* Register renderEntries with speakers module to break circular dep */
setRenderEntries(renderEntries);
