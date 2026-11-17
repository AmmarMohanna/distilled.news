import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { personalNewsBriefing } from '@distilled/core';
import { AppExperience } from './AppExperience';
import { getExploreFeeds, getFeed } from './api';

afterEach(() => window.history.replaceState(null, '', '/'));

vi.mock('./api', () => ({
  getExploreFeeds: vi.fn(async () => ({feeds: [{ id: 'public', title: 'Science', ownerUsername: 'owner', slug: 'science', stars: 0, viewerHasStarred: false }], nextOffset: null})),
  getFeed: vi.fn(async () => ({ editions: [], viewerHasStarred: false })),
  setFeedStar: vi.fn()
}));
vi.mock('./Dialog', () => ({ Dialog: ({children,label}: {children: React.ReactNode;label:string}) => <div role="dialog" aria-label={label}>{children}</div> }));
vi.mock('./FeedArt', () => ({ FeedArt: () => <img src="/prepared-sketch.png" alt=""/> }));
vi.mock('./pwa', () => ({ installApp: vi.fn(), notificationsEnabled: async () => false, setNotificationsEnabled: vi.fn() }));

it('shows a successful empty Explore state only after loading, independently of failures',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));
 let resolve!:(value:Awaited<ReturnType<typeof getExploreFeeds>>)=>void;
 vi.mocked(getExploreFeeds).mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
 const host=document.createElement('div'),root=createRoot(host);
 try{
  await act(async()=>root.render(<AppExperience account={null} briefings={[]} initialTab="explore" onAccount={()=>{}} onHelp={()=>{}}/>));
  expect(host.textContent).not.toContain('No community feeds are available yet.');
  await act(async()=>resolve({feeds:[],nextOffset:null}));
  expect(host.querySelector('.explore-view [role="status"]')?.textContent).toBe('No community feeds are available yet.');
 }finally{await act(async()=>root.unmount());vi.unstubAllGlobals();}
});

it('keeps an Explore loading failure off Home and retries from Explore', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('scrollTo', vi.fn());
  vi.mocked(getExploreFeeds).mockRejectedValueOnce(new Error('Could not load community feeds'));
  const host = document.createElement('div');
  const root = createRoot(host);
  const account = { username: 'reader' } as Parameters<typeof AppExperience>[0]['account'];
  try {
    await act(async () => root.render(<AppExperience account={account}
      briefings={[personalNewsBriefing]} onAccount={() => {}} onHelp={() => {}}/>));
    const explore = host.querySelector<HTMLElement>('.explore-view')!;
    expect(explore.style.display).toBe('none');
    expect(host.querySelector('main > [role="alert"]')).toBeNull();
    expect(host.querySelector('.personal-feed-grid a')).not.toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('nav button[aria-label="Explore"]')!.click());
    expect(explore.querySelector('[role="alert"]')?.textContent).toContain('Could not load community feeds');
    await act(async () => explore.querySelector<HTMLButtonElement>('.feed-state-retry')!.click());
    expect(explore.querySelector('[role="alert"]')).toBeNull();
    expect(explore.textContent).toContain('Science');
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('prepares Explore artwork on Home and preserves image elements through tab switches', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('scrollTo', vi.fn());
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<AppExperience
      account={{ username: 'reader' } as Parameters<typeof AppExperience>[0]['account']}
      briefings={[]} onAccount={() => {}} onHelp={() => {}}/>));
    const explore = host.querySelector<HTMLElement>('.explore-view')!;
    const image = explore.querySelector('img');
    expect(image).not.toBeNull();
    expect(explore.style.display).toBe('none');
    await act(async () => host.querySelector<HTMLButtonElement>('nav button[aria-label="Explore"]')!.click());
    expect(explore.style.display).toBe('');
    expect(explore.querySelector('img')).toBe(image);
    await act(async () => host.querySelector<HTMLButtonElement>('nav button[aria-label="Home"]')!.click());
    expect(explore.style.display).toBe('none');
    expect(explore.querySelector('img')).toBe(image);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});


it('keeps paused feeds in the archive and resumes them only after a successful save', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('scrollTo', vi.fn());
  const host=document.createElement('div'), root=createRoot(host);
  const active={...personalNewsBriefing,id:'active',title:'Active feed',paused:false};
  const paused={...personalNewsBriefing,id:'paused',title:'Paused feed',paused:true};
  let fail=true;
  const save=vi.fn(async()=>{if(fail)throw new Error('Could not save');});
  function Harness(){const [feeds,setFeeds]=React.useState([active,paused]);return <AppExperience account={{id:'reader',username:'reader'} as Parameters<typeof AppExperience>[0]['account']} briefings={feeds} onAccount={()=>{}} onHelp={()=>{}} onResumeFeed={async feed=>{await save();setFeeds(current=>current.map(f=>f.id===feed.id?{...f,paused:false}:f));}}/>;}
  try{
    await act(async()=>root.render(<Harness/>));
    expect(host.querySelector('.personal-feed-grid')?.textContent).toContain('Active feed');
    expect(host.querySelector('.personal-feed-grid')?.textContent).not.toContain('Paused feed');
    await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Archived feeds"]')!.click());
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Paused feed');
    await act(async()=>host.querySelector<HTMLButtonElement>('.archive-resume-button')!.click());
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Could not save');
    expect(host.querySelector('.archived-feed-list')?.textContent).toContain('Paused feed');
    fail=false;
    await act(async()=>host.querySelector<HTMLButtonElement>('.archive-resume-button')!.click());
    expect(host.querySelector('.archive-status')?.textContent).toBe('Feed resumed.');
    expect(host.querySelector('.personal-feed-grid')?.textContent).toContain('Paused feed');
    expect(host.querySelector('.archived-feed-list')).toBeNull();
    expect(save).toHaveBeenCalledTimes(2);
  }finally{await act(async()=>root.unmount());vi.unstubAllGlobals();}
});
it('distinguishes loading, a confirmed empty list and an initial failure',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));vi.stubGlobal('scrollTo',vi.fn());
 const host=document.createElement('div'),root=createRoot(host),account={id:'reader',username:'reader'} as Parameters<typeof AppExperience>[0]['account'];
 try{
  await act(async()=>root.render(<AppExperience account={account} briefings={[]} briefingsState="loading" onAccount={()=>{}} onHelp={()=>{}}/>));
  expect(host.querySelector('.your-feeds')?.getAttribute('aria-busy')).toBe('true');expect(host.textContent).toContain('Loading feeds');expect(host.textContent).not.toContain('created any feeds yet');expect(host.textContent).not.toContain('Create your first feed');
  await act(async()=>root.render(<AppExperience account={account} briefings={[]} briefingsState="error" error="Temporarily unavailable" onAccount={()=>{}} onHelp={()=>{}}/>));
  expect(host.querySelector('[role="alert"]')?.textContent).toBe('Temporarily unavailable');expect(host.textContent).not.toContain('created any feeds yet');expect(host.textContent).not.toContain('Loading feeds');
  await act(async()=>root.render(<AppExperience account={account} briefings={[]} briefingsState="ready" onAccount={()=>{}} onHelp={()=>{}}/>));
  expect(host.textContent).toContain('created any feeds yet');expect(host.textContent).not.toContain('Loading feeds');
 }finally{await act(async()=>root.unmount());vi.unstubAllGlobals();}
});
it('retains cards during refresh and waits for archive data before claiming it is empty',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));vi.stubGlobal('scrollTo',vi.fn());
 const host=document.createElement('div'),root=createRoot(host),account={id:'reader',username:'reader'} as Parameters<typeof AppExperience>[0]['account'],feed={...personalNewsBriefing,id:'existing',title:'Existing feed',paused:false};
 try{
  await act(async()=>root.render(<AppExperience account={account} briefings={[feed]} briefingsState="ready" onAccount={()=>{}} onHelp={()=>{}}/>));const card=host.querySelector('.personal-feed-grid .topic-card');
  await act(async()=>root.render(<AppExperience account={account} briefings={[feed]} briefingsState="loading" onAccount={()=>{}} onHelp={()=>{}}/>));expect(host.querySelector('.personal-feed-grid .topic-card')).toBe(card);expect(host.textContent).not.toContain('Loading feeds');
  await act(async()=>root.render(<AppExperience account={account} briefings={[]} briefingsState="loading" onAccount={()=>{}} onHelp={()=>{}}/>));await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Archived feeds"]')!.click());expect(host.querySelector('.archive-empty')).toBeNull();expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Loading feeds');
  await act(async()=>root.render(<AppExperience account={account} briefings={[]} briefingsState="ready" onAccount={()=>{}} onHelp={()=>{}}/>));expect(host.querySelector('.archive-empty')?.textContent).toContain('No archived feeds');
 }finally{await act(async()=>root.unmount());vi.unstubAllGlobals();}
});


it('loads one Explore page without feed fan-out, keeps cards on page failure and retries the same cursor', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal('scrollTo', vi.fn());
  vi.mocked(getExploreFeeds).mockClear(); vi.mocked(getFeed).mockClear();
  const first = {id:'first',title:'First science',ownerUsername:'other',slug:'first',stars:2,viewerHasStarred:true,latestUpdatedAt:new Date().toISOString()} as any;
  const second = {...first,id:'second',title:'Second science',slug:'second'};
  vi.mocked(getExploreFeeds).mockResolvedValueOnce({feeds:[first],nextOffset:100})
    .mockRejectedValueOnce(new Error('Temporary page failure'))
    .mockResolvedValueOnce({feeds:[first,second],nextOffset:null});
  const host=document.createElement('div'),root=createRoot(host);
  try {
    await act(async()=>root.render(<AppExperience account={{id:'reader',username:'reader'} as any} briefings={[]} onAccount={()=>{}} onHelp={()=>{}}/>));
    expect(getExploreFeeds).toHaveBeenCalledTimes(1);expect(getFeed).not.toHaveBeenCalled();
    await act(async()=>host.querySelector<HTMLButtonElement>('nav button[aria-label="Explore"]')!.click());
    const explore=host.querySelector('.explore-view')!;
    expect(explore.querySelector('[aria-label="Unstar First science"]')?.getAttribute('aria-pressed')).toBe('true');
    const more=Array.from(explore.querySelectorAll('button')).find(button=>button.textContent==='Load more feeds')!;
    await act(async()=>more.click());
    expect(explore.textContent).toContain('First science');expect(explore.querySelector('[role="alert"]')).not.toBeNull();
    await act(async()=>explore.querySelector<HTMLButtonElement>('[role="alert"] button')!.click());
    expect(vi.mocked(getExploreFeeds).mock.calls.map(args=>args[0])).toEqual([0,100,100]);
    expect(explore.querySelectorAll('.topic-card')).toHaveLength(2);
    expect(explore.querySelector('[role="alert"]')).toBeNull();expect(getFeed).not.toHaveBeenCalled();
  } finally {await act(async()=>root.unmount());vi.unstubAllGlobals();}
});

it('renders thirty personal cards from listing metadata without detail requests',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener(){},removeEventListener(){}}));vi.mocked(getFeed).mockClear();
 const feeds=Array.from({length:30},(_,i)=>({...personalNewsBriefing,id:'own-'+i,title:'Own '+i,ownerUsername:'reader',slug:'own-'+i,latestUpdatedAt:'2026-11-16T12:00:00Z',viewerHasStarred:i===0}));
 const host=document.createElement('div'),root=createRoot(host);
 try{await act(async()=>root.render(<AppExperience account={{username:'reader'} as any} briefings={feeds} onAccount={()=>{}} onHelp={()=>{}}/>));
  expect(host.querySelectorAll('.personal-feed-grid .topic-card')).toHaveLength(30);
  expect(host.querySelectorAll('.personal-feed-grid time')).toHaveLength(30);
  expect(host.querySelector('.personal-feed-grid button[aria-label="Unstar"]')?.getAttribute('aria-pressed')).toBe('true');
  expect(getFeed).not.toHaveBeenCalled();
 }finally{await act(async()=>root.unmount());vi.unstubAllGlobals();}
});
