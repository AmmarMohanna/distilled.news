import {useEffect,useState} from 'react';
import {BookOpen,CalendarDays,ExternalLink,Link2,X} from 'lucide-react';
import type {BriefingEdition,BriefingEvidence} from '@distilled/core';
import {Dialog} from './Dialog';
import {SourceLogo} from './SourceLogo';
import {sourceEvidenceLabels} from './source-evidence-labels';

type Language='en'|'ar'|'fr';
const copy={
 en:{title:'News Briefing',close:'Close',copy:'Copy link',copied:'Copied',failed:'Could not copy',read:'Read full article',text:'Source text',noSources:'No references yet',reference:'Reference'},
 fr:{title:'Brief d’actualité',close:'Fermer',copy:'Copier le lien',copied:'Copié',failed:'Échec de copie',read:'Lire l’article complet',text:'Texte de la source',noSources:'Aucune référence pour le moment',reference:'Référence'},
 ar:{title:'موجز الأخبار',close:'إغلاق',copy:'نسخ الرابط',copied:'تم النسخ',failed:'تعذر النسخ',read:'قراءة المقال كاملاً',text:'نص المصدر',noSources:'لا توجد مراجع بعد',reference:'المرجع'}
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
function evidenceDetails(entry:BriefingEvidence){
 const labels=sourceEvidenceLabels(entry);
 const publisher=display(entry.sourceTitle.trim()&&entry.sourceTitle.trim()!==labels.headline?entry.sourceTitle:labels.publisher);
 const links=[...new Set((entry.links.length?entry.links:[entry.sourceUrl]).flatMap(value=>{const url=publicUrl(value);return url?[url]:[];}))];
 const date=Number.isFinite(Date.parse(entry.postedAt))?new Date(entry.postedAt):undefined;
 return {publisher,links,date};
}
export function NewsBriefing(props:{edition:BriefingEdition;selectedIndex:number;language:Language;onClose:()=>void;mediaLabel:(media:BriefingEvidence['media'][number])=>string}){
 const {edition,language}=props,labels=copy[language],rtl=language==='ar';
 const lastIndex=Math.max(0,edition.sections.length-1);
 const [selectedStory,setSelectedStory]=useState(Math.min(lastIndex,Math.max(0,props.selectedIndex)));
 const [copied,setCopied]=useState<{url:string;status:'copied'|'failed'}>();
 useEffect(()=>setSelectedStory(Math.min(lastIndex,Math.max(0,props.selectedIndex))),[edition.id,props.selectedIndex,lastIndex]);
 const storyIndex=Math.min(selectedStory,lastIndex),section=edition.sections[storyIndex];
 const entry=section?.evidence[0];
 const text=(section?.summary??edition.summary).replace(/\r\n/g,'\n'),boundary=text.indexOf('\n');
 const heading=section?.title.trim()||(boundary>0?text.slice(0,boundary).trim():'')||edition.title;
 const body=!section?.title.trim()&&boundary>0?text.slice(boundary+1).trim():text.startsWith(heading)?text.slice(heading.length).trimStart():text;
 const {publisher,links,date}=entry?evidenceDetails(entry):{publisher:'',links:[],date:undefined};
 const articleUrl=links[0];
 return <Dialog label={labels.title} className="news-briefing-dialog" onClose={props.onClose}>
  <section className="news-briefing-card" lang={language} dir={rtl?'rtl':'ltr'}>
   <header className="news-briefing-header"><div><BookOpen size={20} aria-hidden="true"/><h2>{labels.title}</h2></div><button type="button" aria-label={labels.close} onClick={props.onClose}><X size={20} aria-hidden="true"/></button></header>
   <h3 className="news-briefing-headline" dir="auto">{display(heading)}</h3>
   <div className="news-briefing-meta">
    {entry?<span className="news-briefing-publisher"><SourceLogo key={entry.sourceId+storyIndex} source={articleUrl??entry.sourceUrl??entry.sourceTitle}/><strong dir="auto">{publisher}</strong></span>:null}
    {date?<span className="news-briefing-date"><CalendarDays size={18} aria-hidden="true"/><time dateTime={entry!.postedAt}>{new Intl.DateTimeFormat(language==='en'?'en-US':language,{month:'short',day:'numeric',year:'numeric'}).format(date)}</time></span>:null}
    <nav className="news-briefing-references" aria-label={labels.reference}>{edition.sections.map((_,index)=><button key={index} type="button" aria-label={`${labels.reference} ${index+1}`} aria-pressed={storyIndex===index} onClick={()=>setSelectedStory(index)}>{index+1}</button>)}</nav>
   </div>
   <div className="news-briefing-description"><p dir="auto">{display(body)}</p></div>
   {!entry?<p className="news-briefing-empty">{labels.noSources}</p>:null}
   {(links.length>1||Boolean(entry?.media.length))?<div className="news-briefing-related">
    {links.slice(1).map(link=><a key={link} href={link} target="_blank" rel="noopener noreferrer"><Link2 size={15} aria-hidden="true"/>{new URL(link).hostname.replace(/^www\./,'')}</a>)}
    {entry?.media.map((media,index)=>{const url=publicUrl(media.url);return url?<a key={index} href={url} target="_blank" rel="noopener noreferrer">{props.mediaLabel(media)}</a>:<span key={index}>{props.mediaLabel(media)}</span>;})}
   </div>:null}
   {(section?.evidence.length??0)>1?<div className="news-briefing-additional-sources">
    {section!.evidence.slice(1).map((source,index)=>{
     const details=evidenceDetails(source);
     return <div className="news-briefing-additional-source" key={`${source.sourceId}:${source.messageId}:${index}`}>
      <div className="news-briefing-meta">
       <span className="news-briefing-publisher"><SourceLogo source={details.links[0]??source.sourceUrl??source.sourceTitle}/><strong dir="auto">{details.publisher}</strong></span>
       {details.date?<span className="news-briefing-date"><CalendarDays size={18} aria-hidden="true"/><time dateTime={source.postedAt}>{new Intl.DateTimeFormat(language==='en'?'en-US':language,{month:'short',day:'numeric',year:'numeric'}).format(details.date)}</time></span>:null}
      </div>
      <div className="news-briefing-related">
       {details.links.map((link,linkIndex)=><a key={link} href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} aria-hidden="true"/>{linkIndex===0?labels.read:new URL(link).hostname.replace(/^www\./,'')}</a>)}
       {source.media.map((media,mediaIndex)=>{const url=publicUrl(media.url);return url?<a key={`media:${mediaIndex}`} href={url} target="_blank" rel="noopener noreferrer">{props.mediaLabel(media)}</a>:<span key={`media:${mediaIndex}`}>{props.mediaLabel(media)}</span>;})}
      </div>
     </div>;
    })}
   </div>:null}
   <footer className="news-briefing-footer">
    <div className="news-briefing-actions">
     {articleUrl?<>
      <button type="button" className="news-briefing-copy" onClick={async()=>{
       try{await navigator.clipboard.writeText(articleUrl);setCopied({url:articleUrl,status:'copied'});}
       catch{setCopied({url:articleUrl,status:'failed'});}
      }}><Link2 size={18} aria-hidden="true"/><span aria-live="polite">{copied?.url===articleUrl?(copied.status==='copied'?labels.copied:labels.failed):labels.copy}</span></button>
      <a className="news-briefing-read" href={articleUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={18} aria-hidden="true"/>{labels.read}</a>
     </>:null}
    </div>
   </footer>
  </section>
 </Dialog>;
}
