import {useCallback,useEffect,useState,type Dispatch,type SetStateAction} from 'react';

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
  useEffect(()=>{
    if(!key)return;
    setSaved(current=>{
      // Merge only newly discovered IDs into the mounted reader's state. Never
      // replace unsaved progress with stale storage when storage is blocked.
      try {
        const progress=loadReadState(feedId!,readerId!,JSON.parse(editionsKey),current.key===key?current:undefined);
        return progress===current?current:{key,...progress};
      } catch {return current.key===key?current:{key,ids:new Set(),considered:new Set()};}
    });
  },[key,editionsKey]);
  useEffect(()=>{
    if(!key||saved.key!==key)return;
    try {
      localStorage.setItem(key,JSON.stringify([...saved.ids]));
      localStorage.setItem(key+':considered',JSON.stringify([...saved.considered]));
    } catch { /* Reading still works with storage disabled/full. */ }
  },[key,saved]);
  const setIds:Dispatch<SetStateAction<Set<string>>>=useCallback(next=>{
    if(!key)return;
    setSaved(current=>{
      const previous=current.key===key?current:{ids:empty,considered:empty};
      const ids=typeof next==='function'?next(previous.ids):next;
      return {key,ids,considered:new Set([...previous.considered,...previous.ids,...ids])};
    });
  },[key]);
  // Account/feed changes hide the previous reader's IDs before effects run.
  return [saved.key===key?saved.ids:empty,setIds] as const;
}
