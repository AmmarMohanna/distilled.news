import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { BriefingEdition } from '@distilled/core';
import { CitationReference } from './CitationReference';
import { BriefingReadMore } from './BriefingReadMore';

const edition = { id: 'edition', summary: 'Headline\nRetained detail. [1]', sections: [{ title: '', summary: 'Headline\nRetained detail.', evidence: [{ sourceId: 'bbc', sourceTitle: 'BBC', sourceUrl: 'https://www.bbc.co.uk/rss', links: ['https://www.bbc.co.uk/news/article'], media: [], text: 'Full source evidence must not become the briefing.' }] }] } as unknown as BriefingEdition;
async function render(node: React.ReactNode, check: (host: HTMLDivElement) => void | Promise<void>) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'), root = createRoot(host);
  try { await act(async () => root.render(node)); await check(host); }
  finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
}
it('shows the citation destination and previews the publisher logo and domain', async () => {
  const loadDetail = vi.fn(async () => edition);
  await render(<CitationReference number={1} edition={edition} loadDetail={loadDetail} label="Source 1"/>, async host => {
    const link = host.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('https://www.bbc.co.uk/news/article');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(host.querySelector('[role="tooltip"]')?.textContent).toBe('bbc.co.uk');
    expect(host.querySelector('img')?.src).toContain('domain=bbc.co.uk');
    await act(async () => link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(host.querySelector('[role="tooltip"]')).toBeNull();
    expect(loadDetail).not.toHaveBeenCalled();
  });
});
it('loads retained article details on focus without opening a modal', async () => {
  const loadDetail = vi.fn(async () => edition);
  await render(<CitationReference number={1} edition={{ ...edition, sections: [] }} loadDetail={loadDetail} label="Source 1"/>, async host => {
    expect(host.querySelector('a')?.hasAttribute('href')).toBe(false);
    await act(async () => host.querySelector('a')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true })));
    expect(loadDetail).toHaveBeenCalledOnce();
    expect(host.querySelector('a')?.getAttribute('href')).toBe('https://www.bbc.co.uk/news/article');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
});
it('does not turn unsafe retained URLs into article links', async () => {
  const invalid = { ...edition, sections: [{ ...edition.sections[0], evidence: [{ ...edition.sections[0].evidence[0], sourceUrl: 'javascript:alert(1)', links: ['javascript:alert(1)'] }] }] };
  await render(<CitationReference number={1} edition={invalid} loadDetail={async () => invalid} label="Source 1"/>, host => expect(host.querySelector('a')?.hasAttribute('href')).toBe(false));
});
it('keeps compact story numbers bound to their story after detailed evidence is loaded', async () => {
  const detailed = { ...edition, sections: [
    { ...edition.sections[0], evidence: [edition.sections[0].evidence[0], { ...edition.sections[0].evidence[0], links: ['https://other.example/story-one'] }] },
    { ...edition.sections[0], evidence: [{ ...edition.sections[0].evidence[0], links: ['https://second.example/story-two'] }] },
  ] };
  await render(<CitationReference number={2} sectionReference edition={detailed} loadDetail={async () => detailed} label="Source 2"/>, host => {
    expect(host.querySelector('a')?.getAttribute('href')).toBe('https://second.example/story-two');
  });
});
it.each([['en', 'Read more'], ['fr', 'Lire la suite'], ['ar', 'اقرأ المزيد']] as const)('expands the briefing detail inline on demand (%s)', async (language, label) => {
  const loadDetail = vi.fn(async () => edition);
  await render(<BriefingReadMore body="Retained detail." sectionIndex={0} language={language} loadDetail={loadDetail} renderBody={text => <p>{text}</p>}/>, async host => {
    const details = host.querySelector('details')!;
    expect(details.open).toBe(false);
    expect(host.querySelector('summary')?.textContent).toContain(label);
    expect(loadDetail).not.toHaveBeenCalled();
    await act(async () => { details.open = true; details.dispatchEvent(new Event('toggle')); });
    expect(loadDetail).toHaveBeenCalledOnce();
    expect(host.querySelector('.briefing-expanded-text')?.textContent).toBe('Retained detail.');
    expect(host.textContent).not.toContain('Full source evidence');
    await act(async () => { details.open = false; details.dispatchEvent(new Event('toggle')); });
    expect(details.open).toBe(false);
  });
});
it('omits empty read-more controls for headline-only stories', async () => {
  await render(<BriefingReadMore body="" language="en" loadDetail={async () => edition} renderBody={text => <p>{text}</p>}/>, host => {
    expect(host.textContent).toBe('');
    expect(host.querySelector('button, details')).toBeNull();
  });
});
it('leaves the known article link to the browser without a source dialog', async () => {
  await render(<CitationReference number={1} edition={edition} loadDetail={async () => edition} label="Source 1"/>, async host => {
    const link = host.querySelector('a')!;
    link.addEventListener('click', event => event.preventDefault());
    await act(async () => link.click());
    expect(host.querySelector('[role="tooltip"]')).toBeNull();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(link.href).toBe('https://www.bbc.co.uk/news/article');
  });
});
it('opens the article when a citation is clicked before its details are loaded', async () => {
  const replace = vi.fn();
  const tab = { opener: window, closed: false, location: { replace }, close: vi.fn() };
  await render(<CitationReference number={1} edition={{ ...edition, sections: [] }} loadDetail={async () => edition} label="Source 1"/>, async host => {
    vi.stubGlobal('open', vi.fn(() => tab));
    await act(async () => host.querySelector('a')!.click());
    expect(tab.opener).toBeNull();
    expect(replace).toHaveBeenCalledWith('https://www.bbc.co.uk/news/article');
  });
});
