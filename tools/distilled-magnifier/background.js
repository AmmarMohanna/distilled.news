const origin='https://distilled-news-joud.distillednews-platform.workers.dev';
const levels=[1,1.1,1.25,1.5,1.75,2,2.5,3,4],pending=new Map();
function supported(url){try{return new URL(url).origin===origin;}catch{return false;}}

async function enable(tabId){
  const tab=await chrome.tabs.get(tabId);
  if(!supported(tab.url))return;
  const settings=await chrome.tabs.getZoomSettings(tabId);
  if(settings.mode!=='manual'){
    // Normalize previous native zoom once, before taking ownership of this tab.
    await chrome.tabs.setZoom(tabId,1);
    await chrome.tabs.setZoomSettings(tabId,{mode:'manual',scope:'per-tab'});
  }
  const factor=await chrome.tabs.getZoom(tabId);
  await chrome.tabs.sendMessage(tabId,{type:'distilled-apply-zoom',factor});
}

chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(!['distilled-magnifier-ready','distilled-zoom-step'].includes(message?.type)||!sender.tab?.id||sender.frameId!==0||!supported(sender.url))return;
  const id=sender.tab.id;
  const operation=(pending.get(id)??Promise.resolve()).catch(()=>{}).then(async()=>{
    await enable(id);
    if(message.type==='distilled-zoom-step'){
      const current=await chrome.tabs.getZoom(id);
      const next=message.direction===0?1:message.direction===1?(levels.find(value=>value>current+0.001)??4):([...levels].reverse().find(value=>value<current-0.001)??1);
      await chrome.tabs.setZoom(id,next);
    }
  });
  pending.set(id,operation);
  operation.then(()=>reply({ok:true}),()=>reply({ok:false})).finally(()=>{if(pending.get(id)===operation)pending.delete(id);});
  return true;
});

chrome.tabs.onZoomChange.addListener(async change=>{
  if(change.zoomSettings.mode!=='manual')return;
  try{
    const tab=await chrome.tabs.get(change.tabId);
    if(!supported(tab.url))return;
    const factor=Math.max(1,Math.min(4,change.newZoomFactor));
    if(factor!==change.newZoomFactor){await chrome.tabs.setZoom(change.tabId,factor);return;}
    await chrome.tabs.sendMessage(change.tabId,{type:'distilled-apply-zoom',factor});
  }catch{/* Navigation or closed tabs need no retry or stored user data. */}
});

chrome.action.onClicked.addListener(tab=>{
  if(tab.id&&supported(tab.url))enable(tab.id).then(()=>chrome.tabs.setZoom(tab.id,1)).catch(()=>{});
});
