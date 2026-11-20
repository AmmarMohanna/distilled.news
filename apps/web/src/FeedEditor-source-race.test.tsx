import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect,vi} from 'vitest';
import {FeedEditor} from './FeedEditor';
import {assessSourceInput,searchSourceCandidates} from './api';
import {personalNewsBriefing} from '@distilled/core';
import {setWebsiteLanguage} from './LanguageControl';
vi.mock('./Dialog',()=>({Dialog:({children}:{children:React.ReactNode})=><div>{children}</div>}));
vi.mock('./api',()=>({getSourceQuerySuggestions:vi.fn(async()=>({suggestions:[],unavailable:false})),searchSourceCandidates:vi.fn(async()=>({results:[],unavailable:false})),getSources:vi.fn(async()=>[]),recommendSourceCandidates:vi.fn(async()=>({sources:[]})),assessSourceInput:vi.fn()}));
it.each(['another topic','https://publisher.example/'])('preserves the new query %s while an earlier source check is running',async latest=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const host=document.createElement('div'),root=createRoot(host);
 let finish!:(value:Awaited<ReturnType<typeof assessSourceInput>>)=>void;
 vi.mocked(assessSourceInput).mockClear();
 vi.mocked(assessSourceInput).mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
 const enter=async(element:HTMLInputElement,value:string)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));});
 try{
  await act(async()=>setWebsiteLanguage('en'));
  await act(async()=>root.render(<FeedEditor feed={{...personalNewsBriefing,title:'Economy',interestProfile:'Economy news'}} onClose={()=>{}} onSave={async()=>{}}/>));
  const input=host.querySelector<HTMLInputElement>('#feed-source-search')!;
  await enter(input,'https://publisher.example/');
  await act(async()=>host.querySelector<HTMLButtonElement>('.add-source-button')!.click());
  expect(assessSourceInput).toHaveBeenCalledTimes(1);
  await enter(input,'another topic');
  expect(input.value).toBe('another topic');
  if(latest!=='another topic')await enter(input,latest);
  await act(async()=>finish({input:'https://publisher.example/',status:'accepted',reason:'Relevant',checkedAt:new Date().toISOString()}));
  expect(input.value).toBe(latest);
 }finally{await act(async()=>root.unmount());vi.unstubAllGlobals();}
});

it.each([false,true])('shows successful results or honest timeout feedback (%s)',async timeout=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const container=document.createElement('div'),view=createRoot(container);
 vi.mocked(searchSourceCandidates).mockClear();
 vi.mocked(searchSourceCandidates).mockResolvedValue(timeout?{results:[],unavailable:false,accessIncomplete:true,verificationIncomplete:true}:{results:[{source:'https://techcrunch.com/',publisher:'techcrunch.com',title:'New processor development'}],unavailable:false});
 const enter=async(value:string)=>act(async()=>{const input=container.querySelector<HTMLInputElement>('#feed-source-search')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
 try{
  await act(async()=>setWebsiteLanguage('en'));
  await act(async()=>view.render(<FeedEditor feed={{...personalNewsBriefing,title:'Computing',interestProfile:'Computing developments'}} onClose={()=>{}} onSave={async()=>{}}/>));
  await enter('processor');
  await act(async()=>container.querySelector<HTMLButtonElement>('.source-search-submit')!.click());
  if(timeout){
   expect(container.querySelector('#feed-source-search-status')?.textContent).toContain('timed out');
   expect(container.querySelector('#feed-source-search-status')?.textContent).not.toContain('No freely accessible');
   return;
  }
  expect(container.querySelector('.source-web-results')?.textContent).toContain('New processor development');
  expect(container.querySelector('#feed-source-search-status')?.textContent).not.toContain('unavailable');
  await enter('another query');await enter('processor');
  await act(async()=>container.querySelector<HTMLButtonElement>('.source-search-submit')!.click());
  expect(searchSourceCandidates).toHaveBeenCalledTimes(1);
  expect(container.querySelector('.source-web-results')?.textContent).toContain('New processor development');
 }finally{await act(async()=>view.unmount());vi.unstubAllGlobals();}
});
it('shows verified progress immediately and ignores it after the user changes the query',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const host=document.createElement('div'),root=createRoot(host);
 let publish!:NonNullable<Parameters<typeof searchSourceCandidates>[3]>;
 let finish!:(value:Awaited<ReturnType<typeof searchSourceCandidates>>)=>void;
 const waiting=new Promise<Awaited<ReturnType<typeof searchSourceCandidates>>>(resolve=>{finish=resolve;});
 vi.mocked(searchSourceCandidates).mockImplementation((_query,_signal,_context,onProgress)=>{publish=onProgress!;return waiting;});
 const row={source:'https://independent.example/',publisher:'independent.example',title:'Verified research'};
 const enter=(input:HTMLInputElement,value:string)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
 try{
  await act(async()=>setWebsiteLanguage('en'));
  await act(async()=>root.render(<FeedEditor feed={{...personalNewsBriefing,title:'Science',interestProfile:'Scientific discoveries'}} onClose={()=>{}} onSave={async()=>{}}/>));
  const input=host.querySelector<HTMLInputElement>('#feed-source-search')!;
  await enter(input,'research');
  await act(async()=>host.querySelector<HTMLButtonElement>('.source-search-submit')!.click());
  await act(async()=>publish({results:[row],unavailable:false}));
  expect(host.querySelector('.source-web-results')?.textContent).toContain('Verified research');
  await enter(input,'another query');
  await act(async()=>publish({results:[row],unavailable:false}));
  expect(host.querySelector('.source-web-results')).toBeNull();
 }finally{await act(async()=>{finish({results:[row],unavailable:false});await waiting;root.unmount();});vi.unstubAllGlobals();}
});
