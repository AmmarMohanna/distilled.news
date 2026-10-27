import {CircleAlert,LoaderCircle,Newspaper,RotateCw} from 'lucide-react';
import {useLanguage} from './LanguageControl';

/** The offline page's quiet illustration, adapted to an in-page feed state. */
export function FeedListState({failed=false,onRetry}:{failed?:boolean;onRetry?:()=>Promise<void>}){
 const {t}=useLanguage();
 return <div className="feed-list-state" role={failed?'alert':'status'}>
  <div className="feed-state-art" aria-hidden="true">
   <span className="feed-state-cloud feed-state-cloud-left"/><span className="feed-state-cloud feed-state-cloud-right"/>
   <span className="feed-state-tile"><Newspaper size={54} strokeWidth={1.35}/><span className="feed-state-indicator">{failed?<CircleAlert size={20}/>:<LoaderCircle size={20} className="feed-state-spinner"/>}</span></span>
  </div>
  <h2 className="feed-state-title">{t(failed?"Couldn't load your feeds":'Loading feeds\u2026')}</h2>
  {failed&&onRetry&&<button type="button" className="feed-state-retry" onClick={()=>void onRetry().catch(()=>{})}><RotateCw size={18} aria-hidden/>{t('Try Again')}</button>}
 </div>;
}
