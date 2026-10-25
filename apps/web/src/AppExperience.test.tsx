import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { personalNewsBriefing } from '@distilled/core';
import { AppExperience } from './AppExperience';

vi.mock('./api', () => ({
  getExploreFeeds: async () => [{ id: 'public', title: 'Science', ownerUsername: 'owner', slug: 'science', stars: 0 }],
  getFeed: async () => ({ editions: [], viewerHasStarred: false }),
  setFeedStar: vi.fn()
}));
vi.mock('./Dialog', () => ({ Dialog: ({children,label}: {children: React.ReactNode;label:string}) => <div role="dialog" aria-label={label}>{children}</div> }));
vi.mock('./FeedArt', () => ({ FeedArt: () => <img src="/prepared-sketch.png" alt=""/> }));
vi.mock('./pwa', () => ({ installApp: vi.fn(), notificationsEnabled: async () => false, setNotificationsEnabled: vi.fn() }));

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
