import type {ReactNode} from 'react';
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
  if(!structured)return <>
    {props.fallbackHeadline?<h3 className="news-headline" dir={props.direction}><bdi dir={props.direction}>{props.fallbackHeadline}</bdi></h3>:null}
    {props.renderBody(normalizeSummary(props.fallbackSummary??summary))}
  </>;

  return <div className="news-stories" dir={props.direction}>
    {sections.map((section,index)=>{
      const text=section.summary.replace(/\r\n/g,'\n'),boundary=text.indexOf('\n');
      return <div className="news-story" key={index}>
        <h3 className="news-story-heading news-headline"><bdi dir={props.direction}>{text.slice(0,boundary).trim()}</bdi></h3>
        {props.renderBody(`${text.slice(boundary+1).trim()} [${index+1}]`)}
      </div>;
    })}
  </div>;
}
