// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { catchUp } from './api';
import { CatchUpSummary } from './CatchUpSummary';

vi.mock('./api', () => ({ catchUp: vi.fn() }));

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(catchUp).mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const render = (key = 'one') => act(async () => root.render(<CatchUpSummary key={key} username="owner" slug="news" />));
const press = (selector: string) => act(async () => host.querySelector<HTMLButtonElement>(selector)!.click());
const trigger = '.catch-up-summary-button', close = '.catch-up-summary-close';

it('runs on demand, refreshes on reopen and returns focus on dismiss', async () => {
  vi.mocked(catchUp).mockResolvedValueOnce({ status: 'ready', summary: 'The proposal still needs approval.' })
    .mockResolvedValueOnce({ status: 'empty' });
  await render();
  expect(catchUp).not.toHaveBeenCalled();
  await press(trigger);
  expect(host.querySelector('section')?.textContent).toContain('still needs approval');
  await press(close);
  expect(document.activeElement).toBe(host.querySelector(trigger));
  expect(host.querySelector('section')).toBeNull();
  await press(trigger);
  expect(host.querySelector('section')?.textContent).toContain('No recent briefings');
  expect(catchUp).toHaveBeenCalledTimes(2);
});

it('aborts obsolete summary requests when the publication scope changes', async () => {
  let resolve!: (value: { status: 'ready'; summary: string }) => void;
  vi.mocked(catchUp).mockImplementation(() => new Promise(done => { resolve = done; }));
  await render();
  await press(trigger);
  const signal = vi.mocked(catchUp).mock.calls[0][2];
  expect(host.textContent).toContain('Summarizing');
  await render('updated');
  expect(signal.aborted).toBe(true);
  await act(async () => resolve({ status: 'ready', summary: 'Obsolete text' }));
  expect(host.querySelector('section')).toBeNull();
});

it('shows retryable feedback for errors, provider waits and quiet history', async () => {
  vi.mocked(catchUp).mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValueOnce({ status: 'pending' }).mockResolvedValueOnce({ status: 'empty' });
  await render();
  await press(trigger);
  expect(host.querySelector('[role="alert"]')?.textContent).toBe('Unavailable');
  await press(close);
  await press(trigger);
  expect(host.querySelector('[role="status"]')?.textContent).toContain('Still preparing');
  await press(close);
  await press(trigger);
  expect(host.querySelector('[role="status"]')?.textContent).toContain('No recent briefings');
  expect(catchUp).toHaveBeenCalledTimes(3);
});
