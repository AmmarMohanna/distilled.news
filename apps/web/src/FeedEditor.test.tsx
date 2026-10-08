import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { FeedEditor } from './FeedEditor';
import { getSources } from './api';
import { personalNewsBriefing } from '@distilled/core';

vi.mock('./Dialog', () => ({Dialog:({children,className}:{children:React.ReactNode;className:string})=><div className={className}>{children}</div>}));

vi.mock('./api', () => ({getSources:vi.fn(async()=>[{enabled:true,sourceUrl:'https://example.com/feed.xml'}]),recommendSources:vi.fn(async()=>['https://example.com/feed.xml'])}));

it('offers the final preferences, conditional daily time and inferred timezone without editorial controls', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const onSave = vi.fn(async(_input:unknown)=>{});
  await act(async()=>root.render(<FeedEditor feed={{...personalNewsBriefing,title:'Lebanon',interestProfile:'Infrastructure',updateIntervalMinutes:1440,briefingTimeOfDay:'08:00',publicFeedEnabled:false,briefingTimezone:'Asia/Beirut'}} onClose={()=>{}} onSave={onSave}/>));
  const dialog = document.querySelector('.feed-editor')!;
  expect(dialog.textContent).not.toMatch(/Writing style|Weekly|Monthly|timezone/i);
  const selects = [...dialog.querySelectorAll('select')];
  const rhythm = selects.find(select=>select.querySelector('option[value="1440"]'))!;
  expect([...rhythm.options].map(option=>option.value)).toEqual(['30','60','120','360','720','1440']);
  expect(dialog.querySelector('input[type="time"]')).not.toBeNull();
  await act(async()=>{rhythm.value='120';rhythm.dispatchEvent(new Event('change',{bubbles:true}));});
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
