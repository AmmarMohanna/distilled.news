import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthPanel } from './main';
import { login, register, verifyEmail } from './api';
import { ApiError } from './api-errors';

vi.hoisted(() => { Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) }); });

vi.mock('react-dom/client', async importOriginal => {
  const actual = await importOriginal<typeof import('react-dom/client')>();
  return { ...actual, createRoot: (host: Element | null) => host ? actual.createRoot(host) : { render() {} } };
});
vi.mock('./api', async importOriginal => ({
  ...await importOriginal<typeof import('./api')>(), login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(),
}));
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

async function mount(signup = false) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.setItem('dn_language', 'en');
  window.history.replaceState(null, '', signup ? '/?signup' : '/');
  const host = document.createElement('div'), root = createRoot(host);
  const onAuthenticated = vi.fn(async () => {});
  await act(async () => root.render(<AuthPanel setupRequired={false} onAuthenticated={onAuthenticated}/>));
  const click = async (label: string) => act(async () => {
    const button = [...host.querySelectorAll('button')].find(button => button.textContent === label);
    expect(button).toBeDefined(); button!.click();
  });
  const submit = async () => act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  const actions = () => [...host.querySelectorAll('.auth-verification-actions button')].map(button => button.textContent);
  return { host, click, submit, actions, onAuthenticated, close: () => act(async () => root.unmount()) };
}

it('never shows registration recovery on sign in and clears it when leaving registration', async () => {
  const ui = await mount();
  try {
    await ui.submit();
    vi.mocked(login).mockRejectedValue(new ApiError('AUTH_EMAIL_VERIFICATION_REQUIRED'));
    await ui.submit();
    expect(ui.actions()).toEqual([]);
    await ui.click('Create an account');
    expect(ui.actions()).toEqual([]);
    vi.mocked(register).mockRejectedValue(new ApiError('AUTH_EMAIL_REGISTERED'));
    // The recovery email must be nonempty, as it is with browser form validation.
    const input = ui.host.querySelector<HTMLInputElement>('input[type="email"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'reader@example.invalid');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await ui.submit();
    expect(ui.actions()).toEqual(['Enter verification code', 'Resend verification email']);
    await ui.click('Sign in');
    expect(ui.actions()).toEqual([]);
    await ui.click('Create an account');
    expect(ui.actions()).toEqual([]);
  } finally { await ui.close(); }
});
it('returns successful email verification to password sign in without authenticating', async () => {
  const ui = await mount(true);
  try {
    const email = ui.host.querySelector<HTMLInputElement>('input[type="email"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(email, 'reader@example.invalid');
      email.dispatchEvent(new Event('input', { bubbles: true }));
    });
    vi.mocked(register).mockResolvedValueOnce(undefined);
    await ui.submit();
    expect(ui.host.querySelector('.auth-code-step')).not.toBeNull();
    expect(ui.host.querySelector('input[type="email"]')).toBeNull();
    expect(ui.host.querySelector('.auth-email-address')?.textContent).toBe('reader@example.invalid');
    vi.mocked(verifyEmail).mockResolvedValueOnce({ username: 'reader' } as Awaited<ReturnType<typeof verifyEmail>>);
    await ui.submit();
    expect(ui.onAuthenticated).not.toHaveBeenCalled();
    expect(ui.host.querySelector('.auth-code-step')).toBeNull();
    expect(ui.host.textContent).toContain('Welcome back');
    expect(ui.host.textContent).toContain('Email verified. Sign in to continue.');
    expect(ui.host.querySelector<HTMLInputElement>('input[type="password"]')?.value).toBe('');
    expect(ui.host.querySelector<HTMLInputElement>('input[type="email"]')?.readOnly).toBe(false);
    expect(ui.actions()).toEqual([]);
  } finally { await ui.close(); }
});

it('ignores registration responses that arrive after leaving and returning', async () => {
  const ui = await mount(true);
  try {
    let finish!: () => void;
    vi.mocked(register).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await ui.submit();
    await ui.click('Sign in');
    await ui.click('Create an account');
    await act(async () => finish());
    expect(ui.actions()).toEqual([]);
    expect(ui.host.querySelector('.auth-code-step')).toBeNull();
  } finally { await ui.close(); }
});
