import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import type {BriefingEdition,BriefingEvidence} from '@distilled/core';
import {NewsBriefing} from './NewsBriefing';
vi.mock('./Dialog',()=>({Dialog:({children,label}:{children:React.ReactNode;label:string})=><div role="dialog" aria-label={label}>{children}</div>}));
const evidence=(overrides:Partial<BriefingEvidence>={}):BriefingEvidence=>({messageId:'message',sourceId:'source',sourceType:'channel',sourceProvider:'rss',sourceTitle:'ABC',headline:'Article headline',sourceUrl:'https://abc.example/feed',postedAt:'2026-10-25T12:00:00Z',text:'Full original source evidence.',links:['https://abc.example/article'],media:[],...overrides});
const edition={id:'edition',title:'Edition',summary:'Retained summary',sections:[{title:'',summary:'First headline\nFirst explanation.',evidence:[evidence(),evidence({sourceId:'other',sourceTitle:'Other publisher',links:['https://other.example/article']})]},{title:'Second headline',summary:'Second explanation.',evidence:[evidence({sourceId:'second',links:['https://second.example/article']})]}]} as BriefingEdition;
async function render(check:(host:HTMLDivElement)=>Promise<void>|void,props:Partial<React.ComponentProps<typeof NewsBriefing>>={}){
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const host=document.createElement('div'),root=createRoot(host);
 try{await act(async()=>root.render(<NewsBriefing edition={edition} selectedIndex={0} language="en" onClose={()=>{}} mediaLabel={media=>media.label??media.type} {...props}/>));await check(host);}
 finally{await act(async()=>root.unmount());vi.unstubAllGlobals();vi.restoreAllMocks();}
}
it('shows the briefing headline, full elaboration, publisher, source date and numbered references',async()=>{
 await render(host=>{
  expect(host.querySelector('h2')?.textContent).toBe('News Briefing');expect(host.querySelector('h3')?.textContent).toBe('First headline');
  expect(host.querySelector('.news-briefing-description')?.textContent).toContain('First explanation.');
  expect(host.querySelector('.news-briefing-publisher')?.textContent).toBe('ABC');expect(host.querySelector('time')?.textContent).toBe('Oct 25, 2026');
  expect([...host.querySelectorAll('.news-briefing-references button')].map(button=>button.textContent)).toEqual(['[1]','[2]']);
  expect(host.querySelector('.news-briefing-read')?.getAttribute('href')).toBe('https://abc.example/article');expect(host.textContent).toContain('Full original source evidence.');
 });
});
it('navigates all references and supporting sources, copying the same article used by Read full article',async()=>{
 const writeText=vi.fn(async()=>{});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});
 await render(async host=>{
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Next source"]')!.click());
  expect(host.querySelector('.news-briefing-publisher')?.textContent).toBe('Other publisher');
  await act(async()=>host.querySelector<HTMLButtonElement>('.news-briefing-copy')!.click());expect(writeText).toHaveBeenCalledWith('https://other.example/article');expect(host.querySelector('.news-briefing-copy')?.textContent).toBe('Copied');
  await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Reference 2"]')!.click());
  expect(host.querySelector('h3')?.textContent).toBe('Second headline');expect(host.querySelector('.news-briefing-read')?.getAttribute('href')).toBe('https://second.example/article');expect(host.querySelector('.news-briefing-copy')?.textContent).toBe('Copy link');
 });
});
it('supports Arabic, close control and long text without clamping',async()=>{
 const onClose=vi.fn();await render(host=>{
  expect(host.querySelector('section')?.getAttribute('dir')).toBe('rtl');expect(host.querySelector('h2')?.textContent).toBe('موجز الأخبار');
  host.querySelector<HTMLButtonElement>('[aria-label="إغلاق"]')!.click();expect(onClose).toHaveBeenCalledOnce();
  expect(host.querySelector('.news-briefing-description')?.textContent).toContain('First explanation.');
 },{language:'ar',onClose});
});
it('rejects unsafe article and attachment URLs without losing the explanation',async()=>{
 const unsafe={...edition,sections:[{title:'Headline',summary:'Explanation.',evidence:[evidence({sourceUrl:'javascript:alert(1)',links:['data:text/html,unsafe'],media:[{type:'photo',url:'javascript:alert(2)'}]})]}]};
 await render(host=>{expect(host.querySelector('.news-briefing-read')).toBeNull();expect([...host.querySelectorAll('a')].every(a=>/^https?:/.test(a.href))).toBe(true);expect(host.querySelector('.news-briefing-description')?.textContent).toContain('Explanation.');},{edition:unsafe});
});
