import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { personalNewsBriefing } from '@distilled/core';
import { getBriefings, getSession } from './api';
import { AppHeader } from './AppExperience';
import { useFeedViewer } from './useFeedViewer';
import type { AccountRecord, SessionStatus } from './types';

vi.mock('./api', () => ({getSession: vi.fn(), getBriefings: vi.fn()}));
vi.mock('./pwa', () => ({}));

const owner = {id: 'owner', username: 'owner'} as AccountRecord;
const feed = {...personalNewsBriefing, slug: 'news'};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return {promise, resolve};
}
function Harness({slug = 'news'}: {slug?: string}) {
  const viewer = useFeedViewer('owner', slug);
  return <AppHeader account={viewer.account} loading={viewer.loading} onAccount={() => {}}
    leading={<a href="/">Back</a>} contextual
    actions={viewer.ownedFeed ? <button>Edit feed</button> : undefined}/>;
}
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.resetAllMocks();
  host = document.createElement('div');
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });

it('reveals owner controls together after both session and ownership resolve', async () => {
  const session = deferred<SessionStatus>(), feeds = deferred<typeof feed[]>();
  vi.mocked(getSession).mockReturnValue(session.promise);
  vi.mocked(getBriefings).mockReturnValue(feeds.promise);
  await act(async () => root.render(<Harness/>));
  const actions = () => host.querySelector<HTMLElement>('.experience-header-actions')!;
  expect(actions().style.visibility).toBe('hidden');
  expect(actions().hasAttribute('inert')).toBe(true);
  expect(host.querySelector('.experience-leading a')?.textContent).toBe('Back');
  await act(async () => session.resolve({authenticated: true, setupRequired: false, account: owner}));
  expect(actions().style.visibility).toBe('hidden');
  expect(host.querySelector('.has-account')).toBeNull();
  await act(async () => feeds.resolve([feed]));
  expect(actions().style.visibility).toBe('');
  expect(actions().hasAttribute('inert')).toBe(false);
  expect(host.querySelector('.has-account')).not.toBeNull();
  expect(actions().textContent).toContain('Edit feed');
  expect(host.querySelector('a[href="/login"]')).toBeNull();
});

it('reveals guest controls after session resolution without an owner lookup', async () => {
  vi.mocked(getSession).mockResolvedValue({authenticated: false, setupRequired: false});
  await act(async () => root.render(<Harness/>));
  expect(host.querySelector('.is-guest')).not.toBeNull();
  expect(host.querySelector<HTMLElement>('.experience-header-actions')!.style.visibility).toBe('');
  expect(getBriefings).not.toHaveBeenCalled();
});

it('keeps the authenticated header when the owner lookup fails', async () => {
  vi.mocked(getSession).mockResolvedValue({authenticated: true, setupRequired: false, account: owner});
  vi.mocked(getBriefings).mockRejectedValue(new Error('Offline'));
  await act(async () => root.render(<Harness/>));
  expect(host.querySelector('.has-account')).not.toBeNull();
  expect(host.querySelector('[aria-busy="true"]')).toBeNull();
});

it('ignores a late owner lookup for the previous feed', async () => {
  const previous = deferred<typeof feed[]>();
  vi.mocked(getSession).mockResolvedValue({authenticated: true, setupRequired: false, account: owner});
  vi.mocked(getBriefings).mockReturnValueOnce(previous.promise).mockResolvedValueOnce([]);
  await act(async () => root.render(<Harness/>));
  await act(async () => root.render(<Harness slug="other"/>));
  await act(async () => previous.resolve([feed]));
  expect(host.textContent).not.toContain('Edit feed');
  expect(host.querySelector('[aria-busy="true"]')).toBeNull();
});

it('keeps a failed session unresolved instead of anonymous, then retries to the confirmed account',async()=>{
 let latest:ReturnType<typeof useFeedViewer>;
 function Session(){latest=useFeedViewer('owner','news');return <p>{latest.account?.id??'no-account'}</p>;}
 vi.mocked(getSession).mockRejectedValueOnce(new Error('temporarily busy')).mockResolvedValueOnce({authenticated:true,setupRequired:false,account:owner});
 vi.mocked(getBriefings).mockResolvedValue([feed]);
 await act(async()=>root.render(<Session/>));
 expect(latest!.readerId).toBeUndefined();expect(latest!.sessionState).toBe('error');
 await act(async()=> latest!.retrySession());
 expect(latest!.readerId).toBe('owner');expect(latest!.sessionState).toBe('authenticated');
});

it('distinguishes an ownership failure from non-ownership and retries while retaining the confirmed reader',async()=>{
 let latest:ReturnType<typeof useFeedViewer>;
 function Viewer(){latest=useFeedViewer('owner','news');return null;}
 vi.mocked(getSession).mockResolvedValue({authenticated:true,setupRequired:false,account:owner});
 vi.mocked(getBriefings).mockRejectedValueOnce(new Error('Temporary owner failure')).mockResolvedValueOnce([feed]);
 await act(async()=>root.render(<Viewer/>));expect(latest!.readerId).toBe(owner.id);expect(latest!.ownershipState).toBe('error');
 await act(async()=>latest!.retryOwnership());expect(latest!.ownershipState).toBe('owner');expect(latest!.ownedFeed?.id).toBe(feed.id);
 expect(latest!.readerId).toBe(owner.id);
});
it('uses an anonymous identity only after an explicit unauthenticated session',async()=>{
 let latest:ReturnType<typeof useFeedViewer>;
 function Session(){latest=useFeedViewer('owner','news');return null;}
 vi.mocked(getSession).mockResolvedValue({authenticated:false,setupRequired:false});
 await act(async()=>root.render(<Session/>));expect(latest!.readerId).toBeNull();expect(latest!.sessionState).toBe('anonymous');
});

it('does not classify a malformed authenticated response as anonymous',async()=>{
 let latest:ReturnType<typeof useFeedViewer>;
 function Session(){latest=useFeedViewer('owner','news');return null;}
 vi.mocked(getSession).mockResolvedValue({authenticated:true,setupRequired:false});
 await act(async()=>root.render(<Session/>));expect(latest!.readerId).toBeUndefined();expect(latest!.sessionState).toBe('error');expect(getBriefings).not.toHaveBeenCalled();
});
