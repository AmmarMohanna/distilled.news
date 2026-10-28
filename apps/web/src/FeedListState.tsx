import {RotateCw} from 'lucide-react';
import {useLanguage} from './LanguageControl';

/** Branded progress and retry, using the same mark as the app header. */
export function FeedListState({failed=false,onRetry}:{failed?:boolean;onRetry?:()=>Promise<void>}){
 const {t}=useLanguage();
 return <div className="feed-list-state" role={failed?'alert':'status'}>
  <div className="feed-state-art" aria-hidden="true">
   <span className={`distilled-logo-symbol feed-state-logo${failed?'':' is-loading'}`}/>
  </div>
  <h2 className="feed-state-title">{t(failed?"Couldn't load your feeds":'Loading feeds\u2026')}</h2>
  {failed&&onRetry&&<button type="button" className="feed-state-retry" onClick={()=>void onRetry().catch(()=>{})}><RotateCw size={18} aria-hidden/>{t('Try Again')}</button>}
 </div>;
}
