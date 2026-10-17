import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { AppExperience } from './AppExperience';

vi.mock('./api', () => ({
  getExploreFeeds: async () => [{ id: 'public', title: 'Science', ownerUsername: 'owner', slug: 'science', stars: 0 }],
  getFeed: async () => ({ editions: [], viewerHasStarred: false }),
  setFeedStar: vi.fn()
}));
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
