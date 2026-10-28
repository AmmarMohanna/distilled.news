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
  const [summary,setSummary]=useState(''),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const version=useRef(0);
  useEffect(()=>{
    version.current++;setSummary('');setVisible(false);setBusy(false);setError('');
    try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved&&saved.contentKey===contentKey&&saved.expires>Date.now()&&typeof saved.summary==='string'){setSummary(saved.summary);setVisible(true);}else localStorage.removeItem(storageKey);}catch{/* Ignore unavailable or invalid storage. */}
    return()=>{version.current++;};
  },[storageKey,contentKey]);
  async function generate(){
    if(busy||!hasUnread)return;setVisible(true);setError('');
    const request=version.current;setBusy(true);
    try{
      for(let attempt=0;attempt<15;attempt++){
        const result=await summarizeUnread(username,slug,readIds);
        if(request!==version.current)return;
        if(result.status==='ready'){setSummary(result.summary);save(result.summary);return;}
        if(result.status==='empty'){setError(t('No recent unread briefings to summarize.'));return;}
        await new Promise(resolve=>setTimeout(resolve,2000));
        if(request!==version.current)return;
      }
      setError(t('Still preparing. Try again shortly.'));
    }catch(cause){if(request===version.current)setError(cause instanceof Error?cause.message:t('Could not summarize. Try again.'));}
    finally{if(request===version.current)setBusy(false);}
  }
  const result=visible?<section id={resultId} className="unread-summary-section" aria-live="polite" aria-label={t('Unread summary')} aria-busy={busy}>
      <h2>{t("Summary")}</h2><div className="unread-summary-card">
      <button type="button" className="unread-summary-close" aria-label={t('Close summary')} onClick={()=>{setVisible(false);try{localStorage.removeItem(storageKey);}catch{/* Storage is optional. */}}}><X size={18} aria-hidden/></button>
      {busy?<p role="status">{t('Summarizing…')}</p>:error?<p role="alert">{error}</p>:<p dir="auto">{summary}</p>}
      </div>
    </section>:null;
  return <div className="unread-summary">
    <button type="button" className="unread-summary-button" onClick={()=>void generate()} disabled={busy||!hasUnread} aria-expanded={visible} aria-controls={visible?resultId:undefined}>
      {busy?<LoaderCircle size={17} className="summary-spinner" aria-hidden/>:<Sparkles size={17} aria-hidden/>}
      {t(busy?'Summarizing…':'Summarize unread')}
    </button>
    {summaryTarget?createPortal(result,summaryTarget):summaryTarget===undefined?result:null}
  </div>;
}
