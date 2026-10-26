import {useEffect,useId,useRef,useState} from 'react';
import {LoaderCircle,Sparkles,X} from 'lucide-react';
import {summarizeUnread} from './api';
import {useLanguage} from './LanguageControl';

export function UnreadSummary({username,slug,readIds,contentKey}:{username:string;slug:string;readIds:string[];contentKey:string}){
  const {t}=useLanguage();
  const resultId=useId();
  const [summary,setSummary]=useState(''),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const version=useRef(0);
  useEffect(()=>{version.current++;setSummary('');setVisible(false);setBusy(false);setError('');return()=>{version.current++;};},[username,slug,contentKey]);
  async function generate(){
    setVisible(true);setError('');if(summary||busy)return;
    const request=version.current;setBusy(true);
    try{
      for(let attempt=0;attempt<15;attempt++){
        const result=await summarizeUnread(username,slug,readIds);
        if(request!==version.current)return;
        if(result.status==='ready'){setSummary(result.summary);return;}
        if(result.status==='empty'){setError(t('No recent unread briefings to summarize.'));return;}
        await new Promise(resolve=>setTimeout(resolve,2000));
        if(request!==version.current)return;
      }
      setError(t('Still preparing. Try again shortly.'));
    }catch(cause){if(request===version.current)setError(cause instanceof Error?cause.message:t('Could not summarize. Try again.'));}
    finally{if(request===version.current)setBusy(false);}
  }
  return <div className="unread-summary">
    <button type="button" className="unread-summary-button" onClick={()=>void generate()} disabled={busy} aria-expanded={visible} aria-controls={visible?resultId:undefined}>
      {busy?<LoaderCircle size={17} className="summary-spinner" aria-hidden/>:<Sparkles size={17} aria-hidden/>}
      {t(busy?'Summarizing…':'Summarize unread')}
    </button>
    {visible&&<section id={resultId} className="unread-summary-card" aria-live="polite" aria-label={t('Unread summary')} aria-busy={busy}>
      <button type="button" className="unread-summary-close" aria-label={t('Close summary')} onClick={()=>setVisible(false)}><X size={18} aria-hidden/></button>
      {busy?<p role="status">{t('Summarizing…')}</p>:error?<p role="alert">{error}</p>:<p dir="auto">{summary}</p>}
    </section>}
  </div>;
}
