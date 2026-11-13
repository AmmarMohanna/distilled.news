import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { FeedEditor } from './FeedEditor';
import { getSources, recommendSourceCandidates, assessSourceInput, searchSourceCandidates, getSourceQuerySuggestions } from './api';
import { personalNewsBriefing } from '@distilled/core';
import {setWebsiteLanguage} from './LanguageControl';

it('translates every schedule option when language changes and preserves the selected interval',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const host=document.createElement('div'),root=createRoot(host);
 try {
  await act(async()=>root.render(<FeedEditor feed={{...personalNewsBriefing,title:'Home',updateIntervalMinutes:120}} onClose={()=>{}} onSave={async()=>{}}/>));
  const select=host.querySelector('.feed-rhythm-menu')!;
  for(const language of ['fr','ar','en'] as const){
   await act(async()=>setWebsiteLanguage(language));
   const labels=[...select.querySelectorAll('[role="option"]')].map(option=>option.textContent);
   expect(labels).toHaveLength(6);
   expect(select.querySelector('[aria-selected="true"]')?.getAttribute('data-value')).toBe('120');
   if(language!=='en')expect(labels.join(' ')).not.toMatch(/Every|Daily/);
   if(language==='ar')expect(labels.join(' ')).toContain('كل ساعتين');
  }
 }finally{await act(async()=>root.unmount());localStorage.removeItem('dn_language');vi.unstubAllGlobals();}
});

vi.mock('./Dialog', () => ({Dialog:({children,className}:{children:React.ReactNode;className:string})=><div className={className}>{children}</div>}));

vi.mock('./api', () => ({getSourceQuerySuggestions:vi.fn(async()=>({suggestions:[],unavailable:false})),searchSourceCandidates:vi.fn(async()=>({results:[],unavailable:false})),getSources:vi.fn(async()=>[{enabled:true,sourceUrl:'https://example.com/feed.xml'}]),recommendSourceCandidates:vi.fn(async()=>({sources:['https://example.com/feed.xml']})),assessSourceInput:vi.fn(async(_title:string,_description:string,input:string)=>({input,status:'accepted',reason:'Relevant',checkedAt:new Date().toISOString()}))}));
it('gets query-only suggestions without a full search or description-derived text',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.useFakeTimers();
 vi.mocked(getSourceQuerySuggestions).mockResolvedValueOnce({suggestions:['Georges Khabbaz interview'],unavailable:false});
 const host=document.createElement('div'),root=createRoot(host),before=vi.mocked(searchSourceCandidates).mock.calls.length;
 try{
  await act(async()=>root.render(<FeedEditor feed={{...personalNewsBriefing,title:'Georges Khabbaz',interestProfile:'Films and theater productions'}} onClose={()=>{}} onSave={async()=>{}}/>));
  const input=host.querySelector<HTMLInputElement>('#feed-source-search')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'geo');input.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(host.querySelector('#source-query-suggestions')).toBeNull();
  await act(async()=>vi.advanceTimersByTimeAsync(5000));expect(searchSourceCandidates).toHaveBeenCalledTimes(before);
  expect(getSourceQuerySuggestions).toHaveBeenLastCalledWith('geo','en',expect.any(AbortSignal));
  expect(host.querySelector('#source-query-suggestions')?.textContent).toBe('Georges Khabbaz interview');
  expect(host.querySelector('#source-query-suggestions')?.textContent).not.toContain('theater productions');
  await act(async()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
  await act(async()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
  expect(searchSourceCandidates).toHaveBeenLastCalledWith('Georges Khabbaz interview',expect.any(AbortSignal),{title:'Georges Khabbaz',description:'Films and theater productions'});
 }finally{await act(async()=>root.unmount());vi.useRealTimers();vi.unstubAllGlobals();}
});
it('explains an off-topic search without displaying unrelated sources',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 vi.mocked(searchSourceCandidates).mockResolvedValueOnce({results:[],unavailable:false,topicMismatch:true});
 const host=document.createElement('div'),root=createRoot(host);
 try{
  await act(async()=>setWebsiteLanguage('en'));
  await act(async()=>root.render(<FeedEditor feed={{...personalNewsBriefing,title:'Ammar Mohanna',interestProfile:'News about Ammar Mohanna'}} onClose={()=>{}} onSave={async()=>{}}/>));
  const input=host.querySelector<HTMLInputElement>('#feed-source-search')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'workforce');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>host.querySelector<HTMLButtonElement>('.source-search-submit')!.click());
  expect(host.querySelector('#feed-source-search-status')?.textContent).toContain('The results were off topic for this feed');
  expect(host.querySelector('#feed-source-search-status')?.classList.contains('source-search-feedback')).toBe(true);
  expect(host.querySelector('.source-web-results')).toBeNull();
 }finally{await act(async()=>root.unmount());vi.unstubAllGlobals();}
});
it('searches a publisher name and assesses the selected publisher before adding it',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.useFakeTimers();
 vi.mocked(searchSourceCandidates).mockResolvedValueOnce({results:[{source:'https://www.aljadeed.tv/',title:'Al Jadeed',publisher:'www.aljadeed.tv'}],unavailable:false});
 const host=document.createElement('div'),root=createRoot(host);
 try{
  await act(async()=>setWebsiteLanguage('en'));
  await act(async()=>root.render(<FeedEditor feed={{...personalNewsBriefing,title:'Lebanon',interestProfile:'Lebanon news'}} onClose={()=>{}} onSave={async()=>{}}/>));
  const input=host.querySelector<HTMLInputElement>('#feed-source-search')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'aljadded');input.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(host.querySelector('.add-source-button')).toBeNull();
  await act(async()=>host.querySelector<HTMLButtonElement>('.source-search-submit')!.click());
  await act(async()=>vi.advanceTimersByTimeAsync(650));
  expect(searchSourceCandidates).toHaveBeenLastCalledWith('aljadded',expect.any(AbortSignal),{title:'Lebanon',description:'Lebanon news'});
  expect(host.querySelector('.source-web-results')?.textContent).toContain('Al Jadeed');
  await act(async()=>host.querySelector<HTMLButtonElement>('.source-web-results button')!.click());
  expect(assessSourceInput).toHaveBeenLastCalledWith('Lebanon','Lebanon news','https://www.aljadeed.tv/',expect.objectContaining({searchQuery:'aljadded'}));
  expect(host.querySelector('.selected-sources')?.textContent).toContain('aljadeed.tv');
 }finally{await act(async()=>root.unmount());vi.useRealTimers();vi.unstubAllGlobals();}
});
it('hides blocked publishers from search results',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.useFakeTimers();
 vi.mocked(searchSourceCandidates).mockResolvedValueOnce({results:[{source:'https://lovin.co/',title:'Georges Khabbaz on Lovin',publisher:'lovin.co',blocked:true,httpStatus:403},{source:'https://other.example/',title:'Another interview',publisher:'other.example'}],unavailable:false});
 const host=document.createElement('div'),root=createRoot(host);
 try{
  await act(async()=>setWebsiteLanguage('en'));
  await act(async()=>root.render(<FeedEditor feed={{...personalNewsBriefing,title:'Georges Khabbaz',interestProfile:'Entertainment'}} onClose={()=>{}} onSave={async()=>{}}/>));
  const input=host.querySelector<HTMLInputElement>('#feed-source-search')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'Georges Khabbaz');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>host.querySelector<HTMLButtonElement>('.source-search-submit')!.click());
  await act(async()=>vi.advanceTimersByTimeAsync(650));
  const buttons=host.querySelectorAll<HTMLButtonElement>('.source-web-results button');
  expect(buttons).toHaveLength(1);expect(buttons[0].textContent).toContain('Another interview');expect(buttons[0].disabled).toBe(false);
 }finally{await act(async()=>root.unmount());vi.useRealTimers();vi.unstubAllGlobals();}
});
it('hides an already added publisher including its www and RSS variants',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.useFakeTimers();
 vi.mocked(searchSourceCandidates).mockResolvedValueOnce({results:[
  {source:'https://www.example.com/',title:'Already configured publisher',publisher:'example.com'},
  {source:'rss: https://example.com/another-feed',title:'Same publisher RSS',publisher:'example.com'},
  {source:'https://new.example/',title:'New publisher',publisher:'new.example'}
 ],unavailable:false});
 const host=document.createElement('div'),root=createRoot(host);
 try{
  await act(async()=>root.render(<FeedEditor feed={personalNewsBriefing} onClose={()=>{}} onSave={async()=>{}}/>));
  const input=host.querySelector<HTMLInputElement>('#feed-source-search')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'publisher news');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>host.querySelector<HTMLButtonElement>('.source-search-submit')!.click());
  await act(async()=>vi.advanceTimersByTimeAsync(180));
  expect(host.querySelectorAll('.source-web-result-choice')).toHaveLength(1);
  expect(host.querySelector('.source-web-results')?.textContent).toContain('New publisher');
  expect(host.querySelector('.source-web-results')?.textContent).not.toContain('Already configured');
 }finally{await act(async()=>root.unmount());vi.useRealTimers();vi.unstubAllGlobals();}
});
it('explains when all returned sources are hidden because they are already configured',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 vi.mocked(searchSourceCandidates).mockResolvedValueOnce({results:[{source:'https://www.example.com/',title:'Configured publisher',publisher:'example.com'}],unavailable:false});
 const host=document.createElement('div'),root=createRoot(host);
 try{
  await act(async()=>setWebsiteLanguage('en'));
  await act(async()=>root.render(<FeedEditor feed={personalNewsBriefing} onClose={()=>{}} onSave={async()=>{}}/>));
  const input=host.querySelector<HTMLInputElement>('#feed-source-search')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'example publisher');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>host.querySelector<HTMLButtonElement>('.source-search-submit')!.click());
  expect(host.querySelector('.source-web-results')).toBeNull();
  expect(host.querySelector('#feed-source-search-status')?.textContent).toContain('All matching sources are already added');
  expect(host.querySelector<HTMLElement>('#feed-source-search-status')?.hidden).toBe(false);
 }finally{await act(async()=>root.unmount());vi.unstubAllGlobals();}
});
it('removes a paid-only source after verification without offering a paid retry',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.useFakeTimers();
 vi.mocked(searchSourceCandidates).mockResolvedValueOnce({results:[{source:'https://lovin.co/',title:'Georges Khabbaz interview',publisher:'lovin.co'}],unavailable:false});
 vi.mocked(assessSourceInput).mockResolvedValueOnce({input:'https://lovin.co/',status:'unverified',reason:'Direct access blocked.',checkedAt:new Date().toISOString(),freeAccessUnavailable:true});
 const host=document.createElement('div'),root=createRoot(host);
 try{
  await act(async()=>setWebsiteLanguage('en'));
  await act(async()=>root.render(<FeedEditor feed={{...personalNewsBriefing,title:'Georges Khabbaz',interestProfile:'Entertainment'}} onClose={()=>{}} onSave={async()=>{}}/>));
  const input=host.querySelector<HTMLInputElement>('#feed-source-search')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'Georges Khabbaz');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>host.querySelector<HTMLButtonElement>('.source-search-submit')!.click());
  await act(async()=>vi.advanceTimersByTimeAsync(300));
  expect(host.querySelector('.source-paid-retry')).toBeNull();
  await act(async()=>host.querySelector<HTMLButtonElement>('.source-web-results button')!.click());
  expect(vi.mocked(assessSourceInput).mock.lastCall?.[3]?.approvedRetrievalBudgetUsd).toBeUndefined();
  expect(host.querySelector('.source-paid-retry')).toBeNull();
  expect(host.querySelector('.source-web-results')).toBeNull();
  expect(host.querySelector('.selected-sources')?.textContent).not.toContain('lovin.co');
 }finally{await act(async()=>root.unmount());vi.useRealTimers();vi.unstubAllGlobals();}
});
it('reuses a recent search without another request or typing delay',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.useFakeTimers();
 vi.mocked(searchSourceCandidates).mockResolvedValueOnce({results:[{source:'https://lovin.co/',title:'Georges Khabbaz interview',publisher:'lovin.co'}],unavailable:false});
 const host=document.createElement('div'),root=createRoot(host);
 try{
  await act(async()=>root.render(<FeedEditor feed={{...personalNewsBriefing,title:'Georges Khabbaz',interestProfile:'Entertainment'}} onClose={()=>{}} onSave={async()=>{}}/>));
  const input=host.querySelector<HTMLInputElement>('#feed-source-search')!;
  const type=(value:string)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));};
  const before=vi.mocked(searchSourceCandidates).mock.calls.length;
  await act(async()=>type('Georges Khabbaz'));
  await act(async()=>vi.advanceTimersByTimeAsync(179));expect(searchSourceCandidates).toHaveBeenCalledTimes(before);
  await act(async()=>host.querySelector<HTMLButtonElement>('.source-search-submit')!.click());expect(searchSourceCandidates).toHaveBeenCalledTimes(before+1);
  await act(async()=>type(''));await act(async()=>type('Georges Khabbaz'));
  await act(async()=>host.querySelector<HTMLButtonElement>('.source-search-submit')!.click());
  expect(host.querySelector('.source-web-results')?.textContent).toContain('Georges Khabbaz interview');
  expect(searchSourceCandidates).toHaveBeenCalledTimes(before+1);
 }finally{await act(async()=>root.unmount());vi.useRealTimers();vi.unstubAllGlobals();}
});
it('ignores an old article search after the query changes to a source URL',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.useFakeTimers();
 let finish!:(value:Awaited<ReturnType<typeof searchSourceCandidates>>)=>void;
 vi.mocked(searchSourceCandidates).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const host=document.createElement('div'),root=createRoot(host);
 try{
  await act(async()=>root.render(<FeedEditor feed={{...personalNewsBriefing,title:'World',interestProfile:'World news'}} onClose={()=>{}} onSave={async()=>{}}/>));
  const input=host.querySelector<HTMLInputElement>('#feed-source-search')!;
  const type=(value:string)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));};
  await act(async()=>type('old article title'));await act(async()=>host.querySelector<HTMLButtonElement>('.source-search-submit')!.click());
  await act(async()=>type('https://new.example/'));
  await act(async()=>finish({results:[{source:'https://old.example/',title:'Old article',publisher:'old.example'}],unavailable:false}));
  expect(host.querySelector('.source-web-results')).toBeNull();expect(host.querySelector('.add-source-button')).not.toBeNull();
 }finally{await act(async()=>root.unmount());vi.useRealTimers();vi.unstubAllGlobals();}
});
it('preserves an existing long name and asks for a shorter name before saving',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const host=document.createElement('div'),root=createRoot(host),onSave=vi.fn(async()=>{});
 try {
  await act(async()=>setWebsiteLanguage('en'));
  await act(async()=>root.render(<FeedEditor feed={{...personalNewsBriefing,title:'W'.repeat(25)}} onClose={()=>{}} onSave={onSave}/>));
  const input=host.querySelector<HTMLInputElement>('input[aria-label="Feed name"]')!;
  expect(input.maxLength).toBe(24);
  expect(input.value).toBe('W'.repeat(25));
  expect(host.querySelector('#feed-title-limit')?.textContent).toBe('25/24 characters');
  await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(onSave).not.toHaveBeenCalled();
  expect(host.textContent).toContain('Use 24 characters or fewer for the feed name.');
 } finally {await act(async()=>root.unmount());vi.unstubAllGlobals();}
});
it.each([false,true])('uses half-hour daily choices only for clock-policy feeds (clock: %s)',async clock=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const host=document.createElement('div'),root=createRoot(host);
 await act(async()=>root.render(<FeedEditor feed={{...personalNewsBriefing,updateIntervalMinutes:1440,briefingTimeOfDay:clock?'08:30':'08:15',...(clock?{briefingScheduleClockStartAt:'2026-10-29T03:08:00Z'}:{})}} onClose={()=>{}} onSave={async()=>{}}/>));
 const input=host.querySelector<HTMLInputElement>('input[type="time"]')!;
 expect(input.step).toBe(clock?'1800':'60');expect(input.value).toBe(clock?'08:30':'08:15');
 await act(async()=>root.unmount());vi.unstubAllGlobals();
});
it('can save already checked choices while slower suggestions are still arriving',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const source='rss: https://ready.example/feed.xml',result={sources:[source],checks:[{input:source,status:'accepted' as const,reason:'Relevant',checkedAt:new Date().toISOString()}]};
 let finish!:(value:typeof result)=>void;
 vi.mocked(recommendSourceCandidates).mockImplementationOnce(async(_title,_description,progress)=>{progress?.(result);return new Promise(resolve=>finish=resolve);});
 const host=document.createElement('div'),root=createRoot(host),onSave=vi.fn(async()=>{});
 await act(async()=>root.render(<FeedEditor feed={{...personalNewsBriefing,title:'Tech',interestProfile:'AI news'}} onClose={()=>{}} onSave={onSave}/>));
 await act(async()=>host.querySelector<HTMLButtonElement>('.source-recommend-button')!.click());
 await act(async()=>host.querySelector<HTMLButtonElement>('.source-search-results button')!.click());
 expect(host.querySelector<HTMLButtonElement>('.primary-button')!.disabled).toBe(false);
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(onSave).toHaveBeenCalledWith(expect.objectContaining({sourceInputs:expect.arrayContaining([source])}));
 await act(async()=>finish(result));await act(async()=>root.unmount());vi.unstubAllGlobals();
});
it('lets users select a freshly verified recommendation without repeating the relevance call',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const source='rss: https://fresh.example/feed.xml';
 vi.mocked(recommendSourceCandidates).mockResolvedValueOnce({sources:[source],checks:[{input:source,status:'accepted',reason:'Article evidence matches',checkedAt:new Date().toISOString()}]});
 const host=document.createElement('div'),root=createRoot(host);
 await act(async()=>root.render(<FeedEditor feed={{...personalNewsBriefing,title:'Tech',interestProfile:'AI news'}} onClose={()=>{}} onSave={async()=>{}}/>));
 await act(async()=>host.querySelector<HTMLButtonElement>('.source-recommend-button')!.click());
 const before=vi.mocked(assessSourceInput).mock.calls.length;
 await act(async()=>host.querySelector<HTMLButtonElement>('.source-search-results button')!.click());
 expect(vi.mocked(assessSourceInput).mock.calls.length).toBe(before);
 expect(host.querySelector('.selected-sources')?.textContent).toContain('fresh.example');
 await act(async()=>root.unmount());vi.unstubAllGlobals();
});

it('shows publisher identity and fetched article evidence for topic RSS suggestions',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const source='rss: https://publisher.example/?s=coconut&feed=rss2';
 vi.mocked(recommendSourceCandidates).mockResolvedValueOnce({sources:[source],checks:[{input:source,status:'accepted',reason:'Direct topic evidence',evidenceQuote:'Australian coconut water producer expands exports.',checkedAt:new Date().toISOString()}]});
 const host=document.createElement('div'),root=createRoot(host);
 await act(async()=>root.render(<FeedEditor feed={{...personalNewsBriefing,title:'Coconut',interestProfile:'Coconut in Australia'}} onClose={()=>{}} onSave={async()=>{}}/>));
 await act(async()=>host.querySelector<HTMLButtonElement>('.source-recommend-button')!.click());
 expect(host.querySelector('.source-search-results .source-identity strong')?.textContent).toBe('publisher.example');
 expect(host.querySelector('.source-search-results .source-platform-label')?.textContent).toBe('RSS');
 expect(host.querySelector('.source-recommendation-evidence')?.textContent).toContain('Australian coconut water');
 expect(host.querySelector('.selected-sources')?.textContent).not.toContain('publisher.example');
 await act(async()=>root.unmount());vi.unstubAllGlobals();
});

it('displays recommendation rate limits as errors',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 vi.mocked(recommendSourceCandidates).mockRejectedValueOnce(new Error('You can request AI source recommendations three times every five hours.'));
 const host=document.createElement('div'),root=createRoot(host);
 await act(async()=>root.render(<FeedEditor feed={{...personalNewsBriefing,title:'Food',interestProfile:'Pizza'}} onClose={()=>{}} onSave={async()=>{}}/>));
 await act(async()=>host.querySelector<HTMLButtonElement>('.source-recommend-button')!.click());
 expect(host.querySelector('.error[role="alert"]')?.textContent).toContain('three times every five hours');
 await act(async()=>root.unmount());vi.unstubAllGlobals();
});

it('offers the final preferences, conditional daily time and inferred timezone without editorial controls', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const onSave = vi.fn(async(_input:unknown)=>{});
  await act(async()=>root.render(<FeedEditor feed={{...personalNewsBriefing,title:'Lebanon',interestProfile:'Infrastructure',updateIntervalMinutes:1440,briefingTimeOfDay:'08:00',publicFeedEnabled:false,briefingTimezone:'Asia/Beirut'}} onClose={()=>{}} onSave={onSave}/>));
  const dialog = document.querySelector('.feed-editor')!;
  expect(dialog.textContent).not.toMatch(/Writing style|Weekly|Monthly|timezone/i);
  expect((dialog.querySelector('input[name="feed-visibility"]:checked') as HTMLInputElement).checked).toBe(true);
  const rhythm = dialog.querySelector('.feed-rhythm-menu')!;
  expect([...rhythm.querySelectorAll('[role="option"]')].map(option=>option.getAttribute('data-value'))).toEqual(['30','60','120','360','720','1440']);
  expect(dialog.querySelector('input[type="time"]')).not.toBeNull();
  await act(async()=>{rhythm.querySelector<HTMLButtonElement>('[data-value="120"]')!.click();});
  expect(dialog.querySelector('input[type="time"]')).toBeNull();
  await act(async()=>{dialog.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({updateIntervalMinutes:120,publicFeedEnabled:false,briefingTimezone:'Asia/Beirut',sourceInputs:['https://example.com/feed.xml']}));
  expect(onSave.mock.calls[0][0]).not.toHaveProperty('styleInstruction');
  await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();
});

it('keeps configured query inputs when an existing feed is saved again', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(getSources).mockResolvedValueOnce([
    {enabled:true,input:'news: Lebanon electricity',sourceUrl:'https://news.google.com/rss/search?q=Lebanon+electricity'},
    {enabled:true,input:'x: climate technology',sourceUrl:undefined}
  ] as Awaited<ReturnType<typeof getSources>>);
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host),onSave=vi.fn(async(_input:unknown)=>{});
  await act(async()=>root.render(<FeedEditor feed={{...personalNewsBriefing,title:'Lebanon',interestProfile:'Infrastructure',updateIntervalMinutes:120,briefingTimezone:'Asia/Beirut'}} onClose={()=>{}} onSave={onSave}/>));
  await act(async()=>{host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({sourceInputs:['news: Lebanon electricity','x: climate technology']}));
  await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();
});

it('shows unavailable suggestions without offering them as selectable sources', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(recommendSourceCandidates).mockResolvedValueOnce({ sources: [], checks: [{ input: 'https://x.com/BBCWorld', status: 'unavailable', reason: 'Collection provider is not configured.', checkedAt: new Date().toISOString() }] });
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  await act(async()=>root.render(<FeedEditor feed={{...personalNewsBriefing,title:'World',interestProfile:'World news'}} onClose={()=>{}} onSave={async()=>{}}/>));
  await act(async()=>{(host.querySelector('.source-recommend-button') as HTMLButtonElement).click();});
  expect(host.querySelector('.source-search-results')).toBeNull();
  expect(host.querySelector('.source-assessment-results')).toBeNull();
  expect(host.textContent).not.toContain('Collection provider is not configured.');
  expect(host.querySelectorAll('.selected-source-row')).toHaveLength(1);
  await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();
});

it('does not add a suggestion when its independent assessment is inconclusive', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(recommendSourceCandidates).mockResolvedValueOnce({ sources: ['https://publisher.example/rss.xml'] });
  vi.mocked(assessSourceInput).mockResolvedValueOnce({ input: 'https://publisher.example/rss.xml', status: 'unverified', reason: 'Not enough evidence.', checkedAt: new Date().toISOString() });
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  await act(async()=>root.render(<FeedEditor feed={{...personalNewsBriefing,title:'World',interestProfile:'World news'}} onClose={()=>{}} onSave={async()=>{}}/>));
  await act(async()=>{(host.querySelector('.source-recommend-button') as HTMLButtonElement).click();});
  await act(async()=>{(host.querySelector('.source-search-results button') as HTMLButtonElement).click();});
  expect(host.querySelectorAll('.selected-source-row')).toHaveLength(1);
  expect(host.textContent).toContain('Not enough evidence.');
  await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();
});

it('copies the feed link without creating a copy or changing its identity', async () => {
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const host=document.createElement('div'),root=createRoot(host),onSave=vi.fn(async(_input:unknown)=>{}),onCopy=vi.fn(async()=>{});
 const feed={...personalNewsBriefing,title:'Technology',interestProfile:'AI news',briefingTimezone:'UTC'};
 await act(async()=>root.render(<FeedEditor feed={feed} onClose={()=>{}} onSave={onSave} onCopy={onCopy}/>));
 const panel=host.querySelector('.feed-actions-panel')!;
 expect(panel.compareDocumentPosition(host.querySelector('.experience-dialog-actions')!)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(panel.textContent).not.toMatch(/Duplicate|create a copy/);
 const copy=[...panel.querySelectorAll('button')].find(button=>button.textContent==='Copy link')!;
 await act(async()=>copy.click());
 expect(onCopy).toHaveBeenCalledOnce();
 expect(copy.textContent).toBe('Copied');
 expect(host.textContent).not.toContain('URL copied');
 expect(onSave).not.toHaveBeenCalled();
 expect(host.querySelector('.primary-button')?.textContent).toBe('Save changes');
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(onSave).toHaveBeenCalledWith(expect.objectContaining({id:feed.id,title:'Technology'}));
 await act(async()=>root.unmount());vi.unstubAllGlobals();
});
