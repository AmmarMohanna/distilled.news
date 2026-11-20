import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { VerifiedEmailError } from './VerifiedEmailError';
import { renderApiError } from './api-errors';

for(const errorId of ['AUTH_EMAIL_ALREADY_VERIFIED','AUTH_EMAIL_REGISTERED'] as const)it.each(['en','fr','ar'] as const)(`keeps the full %s ${errorId} error and two real hyperlinks`, async language => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'), root = createRoot(host), onNavigate = vi.fn();
  try {
    await act(async () => root.render(<VerifiedEmailError language={language} errorId={errorId} onNavigate={onNavigate}/>));
    expect(host.textContent).toBe(renderApiError({id:errorId,details:{}},language));
    const links = [...host.querySelectorAll('a')];
    expect(links.map(link => link.getAttribute('href'))).toEqual(['/login','/login?reset-password']);
    await act(async () => links[0].click()); expect(onNavigate).toHaveBeenLastCalledWith('login');
    await act(async () => links[1].click()); expect(onNavigate).toHaveBeenLastCalledWith('forgot');
  } finally { await act(async () => root.unmount()); vi.unstubAllGlobals(); }
});
