import {Children, useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import {ChevronLeft, ChevronRight} from 'lucide-react';
import {useLanguage} from './LanguageControl';

/** Complete rows are paged within the space left by the page heading and controls. */
export function BriefingPages({children,resetKey}:{children:ReactNode;resetKey:string}) {
 const {t}=useLanguage();
 const rows=Children.toArray(children);
 const ref=useRef<HTMLDivElement>(null);
 const [capacity,setCapacity]=useState(1),[page,setPage]=useState(0);
 useLayoutEffect(()=>setPage(0),[resetKey]);
 useLayoutEffect(()=>{
  const node=ref.current;if(!node)return;
  const measure=()=>{
   const rowHeight=innerHeight<=450?80:104;
   const available=node.getBoundingClientRect().height-44;
   node.style.setProperty('--briefing-row-height',`${rowHeight}px`);
   setCapacity(Math.max(1,Math.floor(available/rowHeight)));
  };
  measure();const observer=new ResizeObserver(measure);observer.observe(node);
  window.addEventListener('resize',measure);
  return()=>{observer.disconnect();window.removeEventListener('resize',measure);};
 },[]);
 const pages=Math.max(1,Math.ceil(rows.length/capacity)),current=Math.min(page,pages-1);
 return <div className="briefing-pages" ref={ref}><div className="news-line">{rows.slice(current*capacity,(current+1)*capacity)}</div>{pages>1&&<nav className="briefing-pagination" aria-label={t('Story pages')}><button disabled={current===0} aria-label={t('Previous stories')} onClick={()=>setPage(current-1)}><ChevronLeft size={18}/></button><span aria-live="polite">{current+1} / {pages}</span><button disabled={current===pages-1} aria-label={t('Next stories')} onClick={()=>setPage(current+1)}><ChevronRight size={18}/></button></nav>}</div>;
}
