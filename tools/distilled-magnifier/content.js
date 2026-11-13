let ready=false;
function connect(){
  if(!document.documentElement?.hasAttribute('data-distilled-magnification-ready'))return;
  chrome.runtime.sendMessage({type:'distilled-magnifier-ready'}).then(response=>{ready=response?.ok===true;}).catch(()=>{ready=false;});
}
window.addEventListener('distilled:magnification-ready',connect);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',connect,{once:true});else connect();
chrome.runtime.onMessage.addListener(message=>{
  if(message?.type!=='distilled-apply-zoom'||!Number.isFinite(message.factor))return;
  window.dispatchEvent(new CustomEvent('distilled:browser-zoom',{detail:message.factor}));
});
// Route keys through the same browser API so menu percentages stay in sync.
window.addEventListener('keydown',event=>{
  if(ready&&(event.ctrlKey||event.metaKey)&&!event.altKey&&
    (['+','=','-','0'].includes(event.key)||['NumpadAdd','NumpadSubtract'].includes(event.code))){
    event.preventDefault();event.stopImmediatePropagation();
    const direction=event.key==='0'?0:event.key==='-'||event.code==='NumpadSubtract'?-1:1;
    chrome.runtime.sendMessage({type:'distilled-zoom-step',direction}).catch(()=>{});
  }
},true);
