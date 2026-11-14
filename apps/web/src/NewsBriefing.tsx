import {useEffect,useState} from 'react';
import {BookOpen,CalendarDays,ChevronLeft,ChevronRight,ExternalLink,FileText,Link2,X} from 'lucide-react';
import type {BriefingEdition,BriefingEvidence} from '@distilled/core';
import {Dialog} from './Dialog';
import {SourceLogo} from './SourceLogo';
import {sourceEvidenceLabels} from './source-evidence-labels';

type Language='en'|'ar'|'fr';
const copy={
 en:{title:'News Briefing',close:'Close',copy:'Copy link',copied:'Copied',failed:'Could not copy',read:'Read full article',text:'Source text',previous:'Previous source',next:'Next source',source:'Source',noSources:'No references yet',reference:'Reference'},
 fr:{title:'Brief d’actualité',close:'Fermer',copy:'Copier le lien',copied:'Copié',failed:'Échec de copie',read:'Lire l’article complet',text:'Texte de la source',previous:'Source précédente',next:'Source suivante',source:'Source',noSources:'Aucune référence pour le moment',reference:'Référence'},
 ar:{title:'موجز الأخبار',close:'إغلاق',copy:'نسخ الرابط',copied:'تم النسخ',failed:'تعذر النسخ',read:'قراءة المقال كاملاً',text:'نص المصدر',previous:'المصدر السابق',next:'المصدر التالي',source:'المصدر',noSources:'لا توجد مراجع بعد',reference:'المرجع'}
};
function display(value:string){
 const decoder=document.createElement('textarea');
 for(let pass=0;pass<3;pass++){
  const next=value.replace(/&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]+);/gi,entity=>{decoder.innerHTML=entity;return decoder.value;});
  if(next===value)break;value=next;
 }return value;
}
function publicUrl(value:string|undefined){
 try{const url=new URL(value??'');return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:undefined;}catch{return undefined;}
}
export function NewsBriefing(props:{edition:BriefingEdition;selectedIndex:number;language:Language;onClose:()=>void;mediaLabel:(media:BriefingEvidence['media'][number])=>string}){
 const {edition,language}=props,labels=copy[language],rtl=language==='ar';
 const lastIndex=Math.max(0,edition.sections.length-1);
 const [selection,setSelection]=useState({story:Math.min(lastIndex,Math.max(0,props.selectedIndex)),source:0});
 const [copied,setCopied]=useState<{url:string;status:'copied'|'failed'}>();
 useEffect(()=>setSelection({story:Math.min(lastIndex,Math.max(0,props.selectedIndex)),source:0}),[edition.id,props.selectedIndex,lastIndex]);
 const storyIndex=Math.min(selection.story,lastIndex),section=edition.sections[storyIndex];
 const sourceIndex=Math.min(selection.source,Math.max(0,(section?.evidence.length??0)-1)),entry=section?.evidence[sourceIndex];
 const text=(section?.summary??edition.summary).replace(/\r\n/g,'\n'),boundary=text.indexOf('\n');
 const heading=section?.title.trim()||(boundary>0?text.slice(0,boundary).trim():'')||edition.title;
 const body=!section?.title.trim()&&boundary>0?text.slice(boundary+1).trim():text.startsWith(heading)?text.slice(heading.length).trimStart():text;
 const evidenceLabels=entry?sourceEvidenceLabels(entry):undefined;
 const publisher=entry?display(entry.sourceTitle.trim()&&entry.sourceTitle.trim()!==evidenceLabels?.headline?entry.sourceTitle:evidenceLabels?.publisher??''):'';
 const links=[...new Set((entry?(entry.links.length?entry.links:[entry.sourceUrl]):[]).flatMap(value=>{const url=publicUrl(value);return url?[url]:[];}))];
 const articleUrl=links[0];
 const date=entry&&Number.isFinite(Date.parse(entry.postedAt))?new Date(entry.postedAt):undefined;
 const sourceText=entry?display(entry.text):'';
 return <Dialog label={labels.title} className="news-briefing-dialog" onClose={props.onClose}>
  <section className="news-briefing-card" lang={language} dir={rtl?'rtl':'ltr'}>
   <header className="news-briefing-header"><div><BookOpen size={25} aria-hidden="true"/><h2>{labels.title}</h2></div><button type="button" aria-label={labels.close} onClick={props.onClose}><X size={21} aria-hidden="true"/></button></header>
   <h3 className="news-briefing-headline" dir="auto">{display(heading)}</h3>
   <div className="news-briefing-meta">
    {entry?<span className="news-briefing-publisher"><SourceLogo key={entry.sourceId+sourceIndex} source={articleUrl??entry.sourceUrl??entry.sourceTitle}/><strong dir="auto">{publisher}</strong></span>:null}
    {date?<span className="news-briefing-date"><CalendarDays size={22} aria-hidden="true"/><time dateTime={entry!.postedAt}>{new Intl.DateTimeFormat(language==='en'?'en-US':language,{month:'short',day:'numeric',year:'numeric'}).format(date)}</time></span>:null}
    <nav className="news-briefing-references" aria-label={labels.reference}>{edition.sections.map((_,index)=><button key={index} type="button" aria-label={`${labels.reference} ${index+1}`} aria-pressed={storyIndex===index} onClick={()=>setSelection({story:index,source:0})}>[{index+1}]</button>)}</nav>
   </div>
   <div className="news-briefing-description"><FileText size={27} aria-hidden="true"/><p dir="auto">{display(body)}</p></div>
   {entry&&sourceText.trim()&&sourceText.trim()!==display(body).trim()?<details className="news-briefing-source-text"><summary>{labels.text}</summary><p dir="auto">{sourceText}</p></details>:null}
   {!entry?<p className="news-briefing-empty">{labels.noSources}</p>:null}
   {(links.length>1||Boolean(entry?.media.length))?<div className="news-briefing-related">
    {links.slice(1).map(link=><a key={link} href={link} target="_blank" rel="noopener noreferrer"><Link2 size={15} aria-hidden="true"/>{new URL(link).hostname.replace(/^www\./,'')}</a>)}
    {entry?.media.map((media,index)=>{const url=publicUrl(media.url);return url?<a key={index} href={url} target="_blank" rel="noopener noreferrer">{props.mediaLabel(media)}</a>:<span key={index}>{props.mediaLabel(media)}</span>;})}
   </div>:null}
   <footer className="news-briefing-footer">
    {(section?.evidence.length??0)>1?<nav className="news-briefing-source-nav" aria-label={labels.source}>
     <button type="button" aria-label={labels.previous} disabled={sourceIndex===0} onClick={()=>setSelection(current=>({...current,source:sourceIndex-1}))}><ChevronLeft size={19} aria-hidden="true"/></button>
     <span>{labels.source} {sourceIndex+1} / {section!.evidence.length}</span>
     <button type="button" aria-label={labels.next} disabled={sourceIndex===section!.evidence.length-1} onClick={()=>setSelection(current=>({...current,source:sourceIndex+1}))}><ChevronRight size={19} aria-hidden="true"/></button>
    </nav>:null}
    <div className="news-briefing-actions">
     {articleUrl?<>
      <button type="button" className="news-briefing-copy" onClick={async()=>{
       try{await navigator.clipboard.writeText(articleUrl);setCopied({url:articleUrl,status:'copied'});}
       catch{setCopied({url:articleUrl,status:'failed'});}
      }}><Link2 size={20} aria-hidden="true"/><span aria-live="polite">{copied?.url===articleUrl?(copied.status==='copied'?labels.copied:labels.failed):labels.copy}</span></button>
      <a className="news-briefing-read" href={articleUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={20} aria-hidden="true"/>{labels.read}</a>
     </>:null}
    </div>
   </footer>
  </section>
 </Dialog>;
}
