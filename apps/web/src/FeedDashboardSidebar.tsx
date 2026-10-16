import type { BriefingEdition } from '@distilled/core';
import { useLanguage } from './LanguageControl';

export function FeedDashboardSidebar({editions,readIds,savedIds,onOpen,paused}:{editions:BriefingEdition[];readIds:Set<string>;savedIds:Set<string>;onOpen:(edition:BriefingEdition)=>void;paused:boolean}) {
  const {t}=useLanguage();
  const activity=editions.filter(item=>readIds.has(item.id)||savedIds.has(item.id)).slice(0,4);
  const today=new Date().toDateString();
  const count=editions.filter(item=>new Date(item.publishedAt).toDateString()===today).length;
  const text=editions.map(item=>item.title+' '+item.summary).join(' ');
  const topics=[['Lebanon',/lebanon|lebanese/i],['Technology',/technology|software|cloud/i],['Economy',/economy|economic|markets/i],['AI',/\bAI\b|artificial intelligence/i],['Sustainability',/climate|energy|sustainab/i],['Global Politics',/diplomac|election|parliament|politic/i]].filter(([,pattern])=>(pattern as RegExp).test(text));
  return <aside className="briefing-sidebar" aria-label={t('Feed overview')}>
    <section className="briefing-side-card"><h2>{t('Feed Summary')}</h2><p>{t('Your published briefings, brought together in one place. Open a story to explore its supporting sources.')}</p><span className="briefing-side-meta">{count} {t('published today')}</span><span className={`briefing-live ${paused?'is-paused':''}`}><i/>{t(paused?'Paused':'Live')}</span></section>
    {topics.length>0&&<section className="briefing-side-card"><h2>{t('Topics in this feed')}</h2><div className="briefing-topic-chips">{topics.map(([topic],index)=><span className={`topic-tint-${index%5}`} key={String(topic)}>{t(String(topic))}</span>)}</div></section>}
    <section className="briefing-side-card"><h2>{t('Recent activity')}</h2>{activity.length?activity.map((item,index)=><button className="briefing-activity" key={item.id} onClick={()=>onOpen(item)}><i className={`topic-tint-${index%5}`}/><span><strong>{item.title}</strong><small>{t(savedIds.has(item.id)?'Saved':'Read')}</small></span></button>):<p>{t('Stories you read or save will appear here.')}</p>}</section>
  </aside>;
}
