/* ClinicalFlow EHR Paste — Popup Logic */
(async function(){
  const sectionList=document.getElementById('sectionList');
  const emptyState=document.getElementById('emptyState');
  const actions=document.getElementById('actions');
  const noteTitle=document.getElementById('noteTitle');
  const status=document.getElementById('status');
  const pasteAllBtn=document.getElementById('pasteAllBtn');

  let noteData=null;

  /* Read clipboard and look for ClinicalFlow structured data */
  try{
    const items=await navigator.clipboard.read();
    for(const item of items){
      if(item.types.includes('text/html')){
        const blob=await item.getType('text/html');
        const html=await blob.text();
        const match=html.match(/data-clinicalflow='([^']+)'/);
        if(match){
          try{
            const raw=match[1].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
            noteData=JSON.parse(raw);
          }catch(e){/* parse failed */}
        }
      }
    }
  }catch(e){
    status.textContent='Grant clipboard permission to read notes';
    status.className='cf-status cf-error';
    return;
  }

  if(!noteData||!noteData._clinicalflow){
    emptyState.style.display='';
    return;
  }

  /* Render sections */
  emptyState.style.display='none';
  sectionList.style.display='flex';
  actions.style.display='';
  noteTitle.textContent=noteData.title+(noteData.date?' — '+noteData.date:'');

  noteData.sections.forEach(function(sec){
    const btn=document.createElement('button');
    btn.className='cf-section-btn';
    const preview=sec.content.length>60?sec.content.substring(0,60)+'...':sec.content;
    btn.innerHTML='<span class="cf-section-title">'+escHtml(sec.title)+'</span>'
      +'<span class="cf-section-preview">'+escHtml(preview.replace(/\n/g,' '))+'</span>'
      +'<span class="cf-section-check">\u2713</span>';
    btn.addEventListener('click',function(){pasteSection(sec,btn);});
    sectionList.appendChild(btn);
  });

  pasteAllBtn.addEventListener('click',function(){pasteAll();});

  async function pasteSection(sec,btn){
    const text=sec.title.toUpperCase()+'\n'+sec.content;
    const tabs=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tabs[0]){status.textContent='No active tab';return;}
    chrome.tabs.sendMessage(tabs[0].id,{action:'pasteText',text:text},function(resp){
      if(chrome.runtime.lastError){
        status.textContent='Could not reach page — try refreshing';
        status.className='cf-status cf-error';
        return;
      }
      if(resp&&resp.ok){
        btn.classList.add('pasted');
        status.textContent=sec.title+' pasted';
        status.className='cf-status';
      }else{
        status.textContent=(resp&&resp.error)||'No text field found — click in an EHR field first';
        status.className='cf-status cf-error';
      }
    });
  }

  async function pasteAll(){
    const fullText=noteData.sections.map(function(s){return s.title.toUpperCase()+'\n'+s.content;}).join('\n\n');
    const tabs=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tabs[0]){status.textContent='No active tab';return;}
    chrome.tabs.sendMessage(tabs[0].id,{action:'pasteText',text:fullText},function(resp){
      if(chrome.runtime.lastError){
        status.textContent='Could not reach page — try refreshing';
        status.className='cf-status cf-error';
        return;
      }
      if(resp&&resp.ok){
        document.querySelectorAll('.cf-section-btn').forEach(function(b){b.classList.add('pasted');});
        status.textContent='All sections pasted';
        status.className='cf-status';
      }else{
        status.textContent=(resp&&resp.error)||'No text field found — click in an EHR field first';
        status.className='cf-status cf-error';
      }
    });
  }

  function escHtml(t){
    var d=document.createElement('div');d.textContent=t;return d.innerHTML;
  }
})();
