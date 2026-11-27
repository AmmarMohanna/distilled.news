import {toUiError, type UiMessage} from './api-errors';
import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {LoaderCircle,Sparkles,X} from 'lucide-react';
import {summarizeUnread} from './api';
import {useLanguage} from './LanguageControl';

export function UnreadSummary({username,slug,readIds,contentKey,readerId,hasUnread=true,summaryTarget}:{username:string;slug:string;readIds:string[];contentKey:string;readerId:string;hasUnread?:boolean;summaryTarget?:HTMLElement|null}){
  const {t}=useLanguage();
  const resultId=useId();
  const storageKey='dn-unread-summary:'+JSON.stringify([readerId,username,slug]);
  const save=(value:string)=>{try{localStorage.setItem(storageKey,JSON.stringify({contentKey,summary:value,expires:Date.now()+86_400_000}));}catch{/* Storage is optional. */}};
  const [summary,setSummary]=useState(''),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false);
  const [error,setError]=useState<UiMessage>('');
  const version=useRef(0);
  const selectionKey=JSON.stringify([...new Set(readIds)].sort());
  const latestSelection=useRef(selectionKey);latestSelection.current=selectionKey;
  const pending=useRef(false);
  useEffect(()=>{
    version.current++;pending.current=false;setSummary('');setVisible(false);setBusy(false);setError('');
    try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved&&saved.contentKey===contentKey&&saved.expires>Date.now()&&typeof saved.summary==='string'){setSummary(saved.summary);setVisible(true);}else localStorage.removeItem(storageKey);}catch{/* Ignore unavailable or invalid storage. */}
    return()=>{version.current++;};
  },[storageKey,contentKey]);
  useEffect(()=>{
    version.current++;
    if(pending.current){
      pending.current=false;setBusy(false);setError('');
      // An earlier completed summary may remain visible; pending text cannot.
      setVisible(Boolean(summary));
    }
  },[selectionKey]);
  async function generate(){
    if(busy||!hasUnread)return;setVisible(true);setError('');
    const request=version.current,requestedReadIds=[...readIds];pending.current=true;setBusy(true);
    const isCurrent=()=>request===version.current&&selectionKey===latestSelection.current;
    try{
      for(let attempt=0;attempt<15;attempt++){
        const result=await summarizeUnread(username,slug,requestedReadIds);
        if(!isCurrent())return;
        if(result.status==='ready'){setSummary(result.summary);save(result.summary);return;}
        if(result.status==='empty'){setError('No recent unread briefings to summarize.');return;}
        await new Promise(resolve=>setTimeout(resolve,2000));
        if(!isCurrent())return;
      }
      setError('Still preparing. Try again shortly.');
    }catch(cause){if(isCurrent())setError(toUiError(cause));}
    finally{if(isCurrent()){pending.current=false;setBusy(false);}}
  }
  const result=visible?<section id={resultId} className="unread-summary-section" aria-live="polite" aria-label={t('Unread summary')} aria-busy={busy}>
      <h2>{t("Summary")}</h2><div className="unread-summary-card">
      <button type="button" className="unread-summary-close" aria-label={t('Close summary')} onClick={()=>{setVisible(false);try{localStorage.removeItem(storageKey);}catch{/* Storage is optional. */}}}><X size={18} aria-hidden/></button>
      {busy?<p role="status">{t('Summarizing…')}</p>:error?<p role="alert">{t(error)}</p>:<p dir="auto">{summary}</p>}
      </div>
    </section>:null;
  return <div className="unread-summary">
    <button type="button" className="unread-summary-button" onClick={()=>void generate()} disabled={busy||!hasUnread} aria-expanded={visible} aria-controls={visible?resultId:undefined}>
      {busy?<LoaderCircle size={17} className="summary-spinner" aria-hidden/>:<Sparkles size={17} aria-hidden/>}
      {t(busy?'Summarizing…':'Summarize')}
    </button>
    {summaryTarget?createPortal(result,summaryTarget):summaryTarget===undefined?result:null}
  </div>;
}
