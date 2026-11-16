import {useCallback,useEffect,useState,type Dispatch,type SetStateAction} from 'react';

export function readProgressKey(owner:string,slug:string,readerId:string|null):string {
  return 'dn_read:v2:'+JSON.stringify([readerId===null?['anonymous']:['account',readerId],owner,slug]);
}
export function parseReadProgress(raw:string|null):Set<string> {
  try {
    const value:unknown=raw===null?[]:JSON.parse(raw);
    return new Set(Array.isArray(value)&&value.every(id=>typeof id==='string')?value:[]);
  } catch {return new Set();}
}
const empty=new Set<string>();
/** Never migrate ambiguous, browser-wide legacy read history into an account. */
export function useReadProgress(owner:string,slug:string,readerId:string|null|undefined) {
  const key=readerId===undefined?null:readProgressKey(owner,slug,readerId);
  const [saved,setSaved]=useState<{key:string|null;ids:Set<string>}>({key:null,ids:empty});
  useEffect(()=>{
    if(!key)return;
    let ids:Set<string>;
    try {ids=parseReadProgress(localStorage.getItem(key));} catch {ids=new Set();}
    setSaved({key,ids});
  },[key]);
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
