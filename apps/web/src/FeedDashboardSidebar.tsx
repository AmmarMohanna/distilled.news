import {useState,type ReactNode} from "react";
import type { BriefingEdition } from '@distilled/core';
import { useLanguage } from './LanguageControl';

export function FeedDashboardSidebar({editions,readIds,savedIds,onOpen,paused,sourceContent,statusText}:{editions:BriefingEdition[];readIds:Set<string>;savedIds:Set<string>;onOpen:(edition:BriefingEdition)=>void;paused:boolean;sourceContent?:ReactNode;statusText?:string}) {
  const {t}=useLanguage();
  const activity=editions.filter(item=>readIds.has(item.id)||savedIds.has(item.id)).slice(0,3);
  const compact=true;
  const [panel,setPanel]=useState(0);
  const today=new Date().toDateString();
  const count=editions.filter(item=>new Date(item.publishedAt).toDateString()===today).length;
  const text=editions.map(item=>item.title+' '+item.summary).join(' ');
  const topics=[['Lebanon',/lebanon|lebanese/i],['Technology',/technology|software|cloud/i],['Economy',/economy|economic|markets/i],['AI',/\bAI\b|artificial intelligence/i],['Sustainability',/climate|energy|sustainab/i],['Global Politics',/diplomac|election|parliament|politic/i]].filter(([,pattern])=>(pattern as RegExp).test(text));
  const panels=[

    <section key="summary" className="briefing-side-card"><h2>{t('Feed Summary')}</h2><p>{t('Your published briefings, brought together in one place. Open a story to explore its supporting sources.')}</p><span className="briefing-side-meta">{count} {t('published today')}</span><span className={`briefing-live ${paused?'is-paused':''}`}><i/>{t(paused?'Paused':'Live')}</span>{statusText && <small className="briefing-schedule">{statusText}</small>}</section>,
    sourceContent?<section key="sources" className="briefing-side-card"><h2>{t("Sources")}</h2>{sourceContent}</section>:null,
    topics.length>0?<section key="topics" className="briefing-side-card"><h2>{t('Topics in this feed')}</h2><div className="briefing-topic-chips">{topics.map(([topic],index)=><span className={`topic-tint-${index%5}`} key={String(topic)}>{t(String(topic))}</span>)}</div></section>:null,
    <section key="activity" className="briefing-side-card"><h2>{t('Recent activity')}</h2>{activity.length?activity.map((item,index)=><button className="briefing-activity" key={item.id} onClick={()=>onOpen(item)}><i className={`topic-tint-${index%5}`}/><span><strong>{item.title}</strong><small>{t(savedIds.has(item.id)?'Saved':'Read')}</small></span></button>):<p>{t('Stories you read or save will appear here.')}</p>}</section>
  ].filter(Boolean);
  const selected=Math.min(panel,panels.length-1);
  return <aside className="briefing-sidebar" aria-label={t('Feed overview')}>{compact?panels[selected]:panels}{compact&&panels.length>1&&<nav className="briefing-pagination" aria-label={t('Overview pages')}><button aria-label={t('Previous overview')} disabled={selected===0} onClick={()=>setPanel(selected-1)}>&larr;</button><span>{selected+1} / {panels.length}</span><button aria-label={t('Next overview')} disabled={selected===panels.length-1} onClick={()=>setPanel(selected+1)}>&rarr;</button></nav>}</aside>;
}
