import type {ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';
import type {BriefingEditionSection} from '@distilled/core';
import {normalizeSummary} from './summary-format';

/** Render the explicit headline/body boundary supplied by the briefing adapter. */
export function BriefingText(props:{
  summary:string;
  sections:Pick<BriefingEditionSection,'title'|'summary'>[];
  direction:'ltr'|'rtl';
  fallbackHeadline?:string;
  fallbackSummary?:string;
  renderBody:(text:string)=>ReactNode;
}){
  const {sections,summary}=props;
  const structured=sections.length>0&&sections.every(s=>!s.title.trim()&&s.summary.includes('\n'))&&
    normalizeSummary(summary)===normalizeSummary(sections.map((s,i)=>`${s.summary} [${i+1}]`).join('\n\n'));
  if(!structured)return <StoryText headline={props.fallbackHeadline} body={normalizeSummary(props.fallbackSummary??summary)} direction={props.direction} renderBody={props.renderBody}/>;

  return <div className="news-stories" dir={props.direction}>
    {sections.map((section,index)=>{
      const text=section.summary.replace(/\r\n/g,'\n'),boundary=text.indexOf('\n');
      return <div className="news-story" key={index}>
        <StoryText headline={text.slice(0,boundary).trim()} body={`${text.slice(boundary+1).trim()} [${index+1}]`} direction={props.direction} headingClassName="news-story-heading news-headline" renderBody={props.renderBody}/>
      </div>;
    })}
  </div>;
}

function StoryText(props:{headline?:string;body:string;direction:'ltr'|'rtl';headingClassName?:string;renderBody:(text:string)=>ReactNode}){
 const heading=props.headline?<h3 className={props.headingClassName??'news-headline'} dir={props.direction}><bdi dir={props.direction}>{props.headline}</bdi></h3>:null;
 // Keep text visible when retained content has no separate headline to expand.
 if(!heading||!props.body.trim())return <>{heading}{props.renderBody(props.body)}</>;
 return <details className="news-story-details" dir={props.direction}>
  <summary className="news-story-toggle">{heading}<ChevronDown size={18} aria-hidden="true"/></summary>
  {props.renderBody(props.body)}
 </details>;
}
