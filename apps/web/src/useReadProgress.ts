import {useCallback,useEffect,useRef,useState,type Dispatch,type SetStateAction} from 'react';

const readerScope=(readerId:string|null)=>readerId===null?['anonymous']:['account',readerId];
export function readProgressKey(feedId:string,readerId:string|null):string {
  return 'dn_read:v3:'+JSON.stringify([readerScope(readerId),feedId]);
}
export function legacyReadProgressKey(owner:string,slug:string,readerId:string|null):string {
  return 'dn_read:v2:'+JSON.stringify([readerScope(readerId),owner,slug]);
}
/** Bind old URL keys using retained edition identity, never owner-name similarity.
 * Keep legacy records intact: editions no longer retained cannot be safely bound.
 */
export function loadReadProgress(feedId:string,readerId:string|null,editionIds:readonly string[]):Set<string> {
  return loadReadState(feedId,readerId,editionIds).ids;
}
type Progress={ids:Set<string>;considered:Set<string>};
const decisionKey=(key:string,id:string)=>key+':decision:'+encodeURIComponent(id);
const baselineKey=(key:string,id:string)=>key+':read:'+encodeURIComponent(id);
/** Per-edition decisions are authoritative; unread is a persisted tombstone.
 * Baseline read facts preserve migrated IDs even if an older tab writes a stale
 * aggregate array. They never override an explicit read/unread decision. */
function restoreSharedProgress(key:string,ids:Set<string>,considered:Set<string>){
  const decisions=new Map<string,boolean>();
  for(let i=0;i<localStorage.length;i++){
    const item=localStorage.key(i);if(!item)continue;
    const decision=item.startsWith(key+':decision:'),baseline=item.startsWith(key+':read:');
    if(!decision&&!baseline)continue;
    try{
      const id=decodeURIComponent(item.slice((key+(decision?':decision:':':read:')).length)),value=localStorage.getItem(item);
      if(!id||(value!=='1'&&value!=='0'))continue;
      considered.add(id);
      if(decision)decisions.set(id,value==='1');else if(value==='1')ids.add(id);
    }catch{/* Ignore malformed or inaccessible individual records. */}
  }
  for(const [id,read] of decisions){if(read)ids.add(id);else ids.delete(id);}
}
function loadReadState(feedId:string,readerId:string|null,editionIds:readonly string[],current?:Progress):Progress {
  const key=readProgressKey(feedId,readerId);
  const raw=current?null:localStorage.getItem(key);
  const metadata=current?null:localStorage.getItem(key+':considered');
  const result=new Set(current?.ids??parseReadProgress(raw));
  // Earlier v3 arrays cannot explain why a known ID is absent. Preserve those
  // decisions, but permit migration when previously unseen history is found.
  const considered=new Set(current?.considered??(raw!==null&&metadata===null?editionIds:parseReadProgress(metadata)));
  const fresh=new Set(editionIds.filter(id=>!considered.has(id)));
  if(current&&fresh.size===0)return current;
  const scope=JSON.stringify(readerScope(readerId));
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);if(!key?.startsWith('dn_read:v2:'))continue;
    try {
      const identity:unknown=JSON.parse(key.slice('dn_read:v2:'.length));
      if(!Array.isArray(identity)||identity.length!==3||typeof identity[1]!=='string'||typeof identity[2]!=='string'||JSON.stringify(identity[0])!==scope)continue;
      for(const id of parseReadProgress(localStorage.getItem(key)))if(fresh.has(id))result.add(id);
    }catch{/* Invalid or inaccessible legacy data is not migration evidence. */}
  }
  if(!current)restoreSharedProgress(key,result,considered);
  else for(const id of fresh){
    const decision=localStorage.getItem(decisionKey(key,id));
    if(decision==='0')result.delete(id);
    else if(decision==='1'||localStorage.getItem(baselineKey(key,id))==='1')result.add(id);
  }
  return {ids:result,considered:new Set([...considered,...editionIds])};
}
export function parseReadProgress(raw:string|null):Set<string> {
  try {
    const value:unknown=raw===null?[]:JSON.parse(raw);
    return new Set(Array.isArray(value)&&value.every(id=>typeof id==='string')?value:[]);
  } catch {return new Set();}
}
const empty=new Set<string>();
/** Never migrate ambiguous, browser-wide legacy read history into an account. */
export function useReadProgress(feedId:string|undefined,readerId:string|null|undefined,editionIds:readonly string[]=[]) {
  const key=readerId===undefined||!feedId?null:readProgressKey(feedId,readerId);
  const editionsKey=JSON.stringify([...new Set(editionIds)].sort());
  const [saved,setSaved]=useState<Progress&{key:string|null}>({key:null,ids:empty,considered:empty});
  const latest=useRef(saved);latest.current=saved;
  useEffect(()=>{
    if(!key)return;
    setSaved(current=>{
      // Merge only newly discovered IDs into the mounted reader's state. Never
      // replace unsaved progress with stale storage when storage is blocked.
      try {
        const progress=loadReadState(feedId!,readerId!,JSON.parse(editionsKey),current.key===key?current:undefined);
        const next=progress===current?current:{key,...progress};latest.current=next;return next;
      } catch {const next=current.key===key?current:{key,ids:new Set<string>(),considered:new Set<string>()};latest.current=next;return next;}
    });
  },[key,editionsKey]);
  useEffect(()=>{
    if(!key||saved.key!==key)return;
    try {
      localStorage.setItem(key,JSON.stringify([...saved.ids]));
      localStorage.setItem(key+':considered',JSON.stringify([...saved.considered]));
      for(const id of saved.ids)if(localStorage.getItem(baselineKey(key,id))!=='1')localStorage.setItem(baselineKey(key,id),'1');
    } catch { /* Reading still works with storage disabled/full. */ }
  },[key,saved]);
  useEffect(()=>{
    if(!key)return;
    const synchronize=(event:StorageEvent)=>{
      const current=latest.current;if(current.key!==key)return;
      if(event.key!==null&&!event.key.startsWith(key+':decision:')&&!event.key.startsWith(key+':read:'))return;
      try{
        if(event.storageArea&&event.storageArea!==localStorage)return;
        const ids=new Set(current.ids),considered=new Set(current.considered);
        if(event.key===null)ids.clear();
        else{
          const prefix=key+(event.key.startsWith(key+':decision:')?':decision:':':read:');
          const id=decodeURIComponent(event.key.slice(prefix.length));if(!id)return;
          // Read the latest stored value, not a possibly delayed event payload.
          const decision=localStorage.getItem(decisionKey(key,id));
          if(decision==='1'||(decision!=='0'&&localStorage.getItem(baselineKey(key,id))==='1'))ids.add(id);else ids.delete(id);
          considered.add(id);
        }
        const next={key,ids,considered};latest.current=next;setSaved(next);
      }catch{/* Keep in-memory progress when browser storage is unavailable. */}
    };
    window.addEventListener('storage',synchronize);return()=>window.removeEventListener('storage',synchronize);
  },[key]);
  const setIds:Dispatch<SetStateAction<Set<string>>>=useCallback(next=>{
    if(!key)return;
    const previous=latest.current.key===key?latest.current:{ids:empty,considered:empty};
    const ids=typeof next==='function'?next(new Set(previous.ids)):next;
    for(const id of new Set([...previous.ids,...ids]))if(previous.ids.has(id)!==ids.has(id)){
      try{localStorage.setItem(decisionKey(key,id),ids.has(id)?'1':'0');}catch{/* Keep this tab usable without persistent storage. */}
    }
    const updated={key,ids,considered:new Set([...previous.considered,...previous.ids,...ids])};latest.current=updated;setSaved(updated);
  },[key]);
  // Account/feed changes hide the previous reader's IDs before effects run.
  return [saved.key===key?saved.ids:empty,setIds] as const;
}
