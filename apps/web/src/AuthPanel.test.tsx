import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthPanel } from './main';
import { login, register, verifyEmail, resendVerification } from './api';
import { ApiError } from './api-errors';

vi.hoisted(() => { Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) }); });

vi.mock('react-dom/client', async importOriginal => {
  const actual = await importOriginal<typeof import('react-dom/client')>();
  return { ...actual, createRoot: (host: Element | null) => host ? actual.createRoot(host) : { render() {} } };
});
vi.mock('./api', async importOriginal => ({
  ...await importOriginal<typeof import('./api')>(), login: vi.fn(), register: vi.fn(), verifyEmail: vi.fn(), resendVerification: vi.fn(),
}));
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

async function mount(signup = false, url?: string) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.setItem('dn_language', 'en');
  window.history.replaceState(null, '', url ?? (signup ? '/?signup' : '/'));
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

it('shows no verification actions at sign in or when sign-up rejects a duplicate email', async () => {
  const ui = await mount();
  try {
    await ui.submit();
    vi.mocked(login).mockRejectedValue(new ApiError('AUTH_EMAIL_VERIFICATION_REQUIRED'));
    await ui.submit();
    expect(ui.actions()).toEqual([]);
    await ui.click('Create an account');
    expect(ui.actions()).toEqual([]);
    vi.mocked(register).mockRejectedValue(new ApiError('AUTH_EMAIL_REGISTERED'));
    const input = ui.host.querySelector<HTMLInputElement>('input[type="email"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'reader@example.invalid');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await ui.submit();
    expect(ui.host.querySelector('[role="alert"]')?.textContent).toBe('Email is already registered. Sign in or reset your password.');
    expect(ui.host.querySelectorAll('[role="alert"] a')).toHaveLength(2);
    expect(ui.actions()).toEqual([]);
    expect(resendVerification).not.toHaveBeenCalled();
    await ui.click('Sign in');
    expect(ui.actions()).toEqual([]);
    await ui.click('Create an account');
    expect(ui.actions()).toEqual([]);
  } finally { await ui.close(); }
});
it('explains unfinished signup and offers password recovery when the original password does not match', async () => {
  const ui = await mount(true);
  try {
    vi.mocked(register).mockRejectedValueOnce(new ApiError('AUTH_EMAIL_VERIFICATION_PENDING'));
    await ui.submit();
    const alert = ui.host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Email verification is pending.');
    expect(alert?.querySelector('a')?.getAttribute('href')).toBe('/login?reset-password');
    expect(ui.actions()).toEqual([]);
    expect(resendVerification).not.toHaveBeenCalled();
  } finally { await ui.close(); }
});

it('accepts a six-digit code and shows the welcome card before sign in', async () => {
  const ui = await mount(true);
  try {
    const fill = async (input: HTMLInputElement, value: string) => act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await fill(ui.host.querySelector<HTMLInputElement>('input[type="email"]')!, 'reader@example.invalid');
    vi.mocked(register).mockResolvedValueOnce('code');
    await ui.submit();
    expect(ui.host.querySelector('.auth-code-step')).not.toBeNull();
    expect(ui.host.querySelector('.auth-email-address')?.textContent).toBe('reader@example.invalid');
    expect(ui.actions()).toEqual(['Request a new code']);
    await fill(ui.host.querySelector<HTMLInputElement>('[autocomplete="one-time-code"]')!, '٠١٢ ٣٤٥');
    await ui.submit();
    expect(verifyEmail).toHaveBeenCalledExactlyOnceWith({email:'reader@example.invalid',code:'012345'});
    expect(ui.host.querySelector('h2')?.textContent).toBe('Welcome to Distilled.News');
    expect(ui.onAuthenticated).not.toHaveBeenCalled();
    await ui.click('Sign in');
    expect(ui.host.textContent).toContain('Welcome back');
    expect(ui.host.querySelector<HTMLInputElement>('input[type="password"]')?.value).toBe('');
    expect(ui.host.querySelector<HTMLInputElement>('input[type="email"]')?.value).toBe('reader@example.invalid');
    expect(ui.actions()).toEqual([]);
  } finally { await ui.close(); }
});

it('resumes code verification after an unverified user supplies the correct sign-in credentials', async () => {
  const ui = await mount();
  try {
    await ui.submit();
    const email = ui.host.querySelector<HTMLInputElement>('input[type="email"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(email, 'pending@example.invalid');
      email.dispatchEvent(new Event('input', { bubbles: true }));
    });
    vi.mocked(login).mockRejectedValueOnce(new ApiError('AUTH_EMAIL_CODE_REQUIRED'));
    await ui.submit();
    expect(ui.host.querySelector('h2')?.textContent).toBe('Enter your verification code');
    expect(ui.host.querySelector('.auth-email-address')?.textContent).toBe('pending@example.invalid');
    expect(ui.actions()).toEqual(['Request a new code']);
    expect(resendVerification).not.toHaveBeenCalled();
    expect(ui.onAuthenticated).not.toHaveBeenCalled();
  } finally { await ui.close(); }
});

it('ignores registration responses that arrive after leaving and returning', async () => {
  const ui = await mount(true);
  try {
    let finish!: (method:'code') => void;
    vi.mocked(register).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await ui.submit();
    await ui.click('Sign in');
    await ui.click('Create an account');
    await act(async () => finish('code'));
    expect(ui.actions()).toEqual([]);
    expect(ui.host.querySelector('.auth-code-step')).toBeNull();
  } finally { await ui.close(); }
});
it.each([
  ['Sign in', 'Welcome back'], ['reset your password', 'Reset Password'],
])('opens %s from the duplicate-email error and preserves the email', async (action, heading) => {
  const ui = await mount(true);
  try {
    const email = ui.host.querySelector<HTMLInputElement>('input[type="email"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(email, 'verified@example.invalid');
      email.dispatchEvent(new Event('input', { bubbles: true }));
    });
    vi.mocked(register).mockRejectedValueOnce(new ApiError('AUTH_EMAIL_REGISTERED'));
    await ui.submit();
    expect(ui.host.querySelector('[role="alert"]')?.textContent).toBe('Email is already registered. Sign in or reset your password.');
    expect(ui.actions()).toEqual([]);
    const link = [...ui.host.querySelectorAll<HTMLAnchorElement>('[role="alert"] a')].find(link => link.textContent === action)!;
    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe(action === 'Sign in' ? '/login' : '/login?reset-password');
    await act(async () => link.click());
    expect(ui.host.querySelector('h2')?.textContent).toBe(heading);
    expect(ui.host.querySelector<HTMLInputElement>('input[type="email"]')?.value).toBe('verified@example.invalid');
    expect(ui.host.querySelector('[role="alert"]')).toBeNull();
    expect(ui.actions()).toEqual([]);
    expect(ui.onAuthenticated).not.toHaveBeenCalled();
  } finally { await ui.close(); }
});
it('removes resend after verification completes in another tab', async () => {
  const ui = await mount(true);
  try {
    const email = ui.host.querySelector<HTMLInputElement>('input[type="email"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(email, 'verified@example.invalid');
      email.dispatchEvent(new Event('input', { bubbles: true }));
    });
    vi.mocked(register).mockResolvedValueOnce('code');
    await ui.submit();
    expect(ui.actions()).toEqual(['Request a new code']);
    vi.mocked(resendVerification).mockRejectedValueOnce(new ApiError('AUTH_EMAIL_ALREADY_VERIFIED'));
    await ui.click('Request a new code');
    expect(ui.actions()).toEqual([]);
    expect(ui.host.querySelectorAll('[role="alert"] a')).toHaveLength(2);
  } finally { await ui.close(); }
});
it('supports opening the reset-password request form through the hyperlink URL', async () => {
  const ui = await mount(false, '/login?reset-password');
  try {
    expect(ui.host.querySelector('h2')?.textContent).toBe('Reset Password');
    expect(ui.host.querySelector('input[type="password"]')).toBeNull();
    expect(ui.host.querySelector('button[type="submit"]')?.textContent).toBe('Send Reset Link');
  } finally { await ui.close(); }
});
it('shows clickable recovery links and no verification actions immediately after verified registration is rejected', async () => {
  const ui = await mount(true);
  try {
    vi.mocked(register).mockRejectedValueOnce(new ApiError('AUTH_EMAIL_ALREADY_VERIFIED'));
    await ui.submit();
    expect(ui.host.querySelector('[role="alert"]')?.textContent).toBe('Email is already verified. Please sign in or reset your password.');
    expect(ui.host.querySelectorAll('[role="alert"] a')).toHaveLength(2);
    expect(ui.actions()).toEqual([]);
    expect(resendVerification).not.toHaveBeenCalled();
  } finally { await ui.close(); }
});
it('resends a verification code to the submitted address after successful sign-up', async () => {
  const ui = await mount(true);
  try {
    const email = ui.host.querySelector<HTMLInputElement>('input[type="email"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(email, 'NewReader@example.invalid');
      email.dispatchEvent(new Event('input', { bubbles: true }));
    });
    vi.mocked(register).mockResolvedValueOnce('code');
    await ui.submit();
    vi.mocked(resendVerification).mockResolvedValueOnce(undefined);
    await ui.click('Request a new code');
    expect(resendVerification).toHaveBeenCalledExactlyOnceWith('newreader@example.invalid', '');
    expect(ui.host.querySelector('.auth-message')?.textContent).toContain('Check your inbox and spam folder.');
    expect(ui.actions()).toEqual(['Request a new code']);
  } finally { await ui.close(); }
});
