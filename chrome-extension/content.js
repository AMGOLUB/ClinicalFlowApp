/* ClinicalFlow EHR Paste — Content Script
   Injects note text into the focused EHR text field */
chrome.runtime.onMessage.addListener(function(msg,sender,sendResponse){
  if(msg.action==='pasteText'){
    var el=document.activeElement;

    /* Check if the active element is an editable field */
    if(el&&isEditable(el)){
      insertText(el,msg.text);
      sendResponse({ok:true});
    }else{
      /* No focused editable field — try to find a visible large text area */
      var target=findEditableField();
      if(target){
        target.focus();
        insertText(target,msg.text);
        sendResponse({ok:true,auto:true});
      }else{
        sendResponse({ok:false,error:'No text field focused — click in an EHR field first'});
      }
    }
  }
  return true;
});

function isEditable(el){
  if(!el||!el.tagName)return false;
  var tag=el.tagName.toUpperCase();
  if(tag==='TEXTAREA'||tag==='INPUT')return true;
  if(el.contentEditable==='true'||el.contentEditable==='plaintext-only')return true;
  if(el.getAttribute('role')==='textbox')return true;
  return false;
}

function insertText(el,text){
  if(el.contentEditable==='true'||el.contentEditable==='plaintext-only'||el.getAttribute('role')==='textbox'){
    /* Rich text / contentEditable (common in Epic Hyperdrive, Athena) */
    document.execCommand('insertText',false,text);
  }else{
    /* Standard textarea / input */
    var start=el.selectionStart||0;
    var end=el.selectionEnd||0;
    var val=el.value||'';
    el.value=val.substring(0,start)+text+val.substring(end);
    el.selectionStart=el.selectionEnd=start+text.length;
    /* Dispatch events so React/Angular/Vue detect the change */
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  }
}

function findEditableField(){
  var candidates=document.querySelectorAll('textarea, [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"]');
  for(var i=0;i<candidates.length;i++){
    var c=candidates[i];
    var rect=c.getBoundingClientRect();
    /* Find visible, reasonably sized field */
    if(rect.width>80&&rect.height>40&&rect.top>=0&&rect.top<window.innerHeight){
      return c;
    }
  }
  return null;
}
