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
  const raw=localStorage.getItem(readProgressKey(feedId,readerId));
  const result=parseReadProgress(raw);
  // A stable record is authoritative, including an intentional mark-as-unread.
  if(raw!==null)return result;
  const known=new Set(editionIds),scope=JSON.stringify(readerScope(readerId));
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);if(!key?.startsWith('dn_read:v2:'))continue;
    try {
      const identity:unknown=JSON.parse(key.slice('dn_read:v2:'.length));
      if(!Array.isArray(identity)||identity.length!==3||typeof identity[1]!=='string'||typeof identity[2]!=='string'||JSON.stringify(identity[0])!==scope)continue;
      for(const id of parseReadProgress(localStorage.getItem(key)))if(known.has(id))result.add(id);
    }catch{/* Invalid or inaccessible legacy data is not migration evidence. */}
  }
  return result;
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
  const [saved,setSaved]=useState<{key:string|null;ids:Set<string>}>({key:null,ids:empty});
  useEffect(()=>{
    if(!key)return;
    let ids:Set<string>;
    try {ids=loadReadProgress(feedId!,readerId!,JSON.parse(editionsKey));} catch {ids=new Set();}
    setSaved({key,ids});
  },[key,editionsKey]);
  useEffect(()=>{
    if(!key||saved.key!==key)return;
    try {localStorage.setItem(key,JSON.stringify([...saved.ids]));} catch { /* Reading still works with storage disabled/full. */ }
  },[key,saved]);
  const setIds:Dispatch<SetStateAction<Set<string>>>=useCallback(next=>{
    if(!key)return;
    setSaved(current=>({key,ids:typeof next==='function'?next(current.key===key?current.ids:empty):next}));
  },[key]);
  // Account/feed changes hide the previous reader's IDs before effects run.
  return [saved.key===key?saved.ids:empty,setIds] as const;
}
