import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { FeedReaderStatus } from './FeedReaderStatus';
import type { FeedPayload } from './types';

async function render(state: FeedPayload['publicationState'], isAdmin: boolean, check: (host: HTMLDivElement) => void) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'), root = createRoot(host);
  const payload = { publicationState: state, editions: [], sourceAvailability: [{ sourceId: 'source', title: 'Publisher', state: 'UNAVAILABLE', providers: [], reason: 'BUDGET_EXHAUSTED' }] } as unknown as FeedPayload;
  try {
    await act(async () => root.render(<FeedReaderStatus payload={payload} isAdmin={isAdmin} language="en" t={text => text}/>));
    check(host);
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
}

it.each(['failed', 'partial', 'correction_pending', 'setup_required', 'service_blocked'] as const)('hides %s and source diagnostics from non-admins, including feed owners', async state => {
  await render(state, false, host => expect(host.children).toHaveLength(0));
});
it('keeps the no-new-developments message visible to ordinary readers', async () => {
  await render('quiet', false, host => expect(host.textContent).toBe('No new developments in the latest scheduled briefing.'));
});
it('retains delay and source-health diagnostics for admins', async () => {
  await render('failed', true, host => {
    expect(host.textContent).toContain('Briefing delayed');
    expect(host.textContent).toContain('Source collection needs attention');
  });
});
