import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { SourceLogo, sourceLogoDomain } from './SourceLogo';

it('uses publisher domains for URLs and recognizes MTV by name', () => {
  expect(sourceLogoDomain('MTV')).toBe('mtv.com.lb');
  expect(sourceLogoDomain('https://www.mtv.com.lb/news')).toBe('mtv.com.lb');
  expect(sourceLogoDomain('Lebanon politics')).toBeUndefined();
  expect(sourceLogoDomain('javascript://example.com')).toBeUndefined();
  expect(sourceLogoDomain('https://user:password@example.com')).toBeUndefined();
});

it('falls back when a logo fails and retries for a different source', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'), root = createRoot(host);
  try {
    await act(async () => root.render(<SourceLogo source="MTV"/>));
    const img = host.querySelector('img')!;
    expect(img.src).toContain('domain=mtv.com.lb');
    await act(async () => img.dispatchEvent(new Event('error')));
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('svg')).not.toBeNull();
    await act(async () => root.render(<SourceLogo source="https://bbc.com/news"/>));
    expect(host.querySelector('img')!.src).toContain('domain=bbc.com');
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});
