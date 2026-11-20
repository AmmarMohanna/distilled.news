import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { VerificationCodeInput } from './VerificationCodeInput';

async function render(check: (host: HTMLDivElement, inputs: HTMLInputElement[]) => Promise<void>, language: 'en' | 'ar' | 'fr' = 'en') {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  function Harness() {
    const [value, setValue] = useState('');
    return <form><VerificationCodeInput value={value} onChange={setValue} label="Verification code" language={language}/><output>{value}</output></form>;
  }
  try { await act(async () => root.render(<Harness/>)); await check(host, [...host.querySelectorAll('input')]); }
  finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
}
async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function key(input: HTMLInputElement, key: string) {
  await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
}
async function paste(input: HTMLInputElement, value: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => value } });
  await act(async () => input.dispatchEvent(event));
}

it('renders four groups of four required boxes and advances focus after typing', async () => {
  await render(async (host, inputs) => {
    expect(host.querySelectorAll('.verification-code-group')).toHaveLength(4);
    expect(inputs).toHaveLength(16);
    expect(document.activeElement).toBe(inputs[0]);
    expect(host.querySelector('form')!.checkValidity()).toBe(false);
    await type(inputs[0], 'a');
    expect(inputs[0].value).toBe('A'); expect(document.activeElement).toBe(inputs[1]);
    await type(inputs[1], '2');
    expect(document.activeElement).toBe(inputs[2]);
  });
});
it('pastes a complete formatted code from any box and supports autofill', async () => {
  await render(async (host, inputs) => {
    await paste(inputs[7], 'abcd-efgh-jklm-npqr');
    expect(inputs.map(input => input.value).join('')).toBe('ABCDEFGHJKLMNPQR');
    expect(host.querySelector('form')!.checkValidity()).toBe(true);
    expect(document.activeElement).toBe(inputs[15]);
    await type(inputs[0], '2345-6789-abcd-efgh');
    expect(inputs.map(input => input.value).join('')).toBe('23456789ABCDEFGH');
  });
});
it('keeps character positions intact while correcting, deleting, and moving with arrows', async () => {
  await render(async (host, inputs) => {
    await paste(inputs[0], 'ABCD-EFGH-JKLM-NPQR');
    await key(inputs[5], 'Delete');
    expect(inputs[5].value).toBe(''); expect(inputs[6].value).toBe('G');
    expect(host.querySelector('form')!.checkValidity()).toBe(false);
    await key(inputs[5], 'Backspace');
    expect(inputs[4].value).toBe(''); expect(document.activeElement).toBe(inputs[4]);
    await type(inputs[4], 'z');
    expect(inputs[4].value).toBe('Z'); expect(inputs[6].value).toBe('G');
    await key(inputs[5], 'ArrowLeft'); expect(document.activeElement).toBe(inputs[4]);
    await key(inputs[4], 'ArrowRight'); expect(document.activeElement).toBe(inputs[5]);
  });
});
it('keeps Arabic codes left-to-right with localized character labels', async () => {
  await render(async (host, inputs) => {
    expect(host.querySelector('[role="group"]')?.getAttribute('dir')).toBe('ltr');
    expect(inputs[0].getAttribute('aria-label')).toBe('الحرف 1 من 16');
    await paste(inputs[0], 'ABCD-EFGH-JKLM-NPQR');
    expect(inputs.map(input => input.value).join('')).toBe('ABCDEFGHJKLMNPQR');
  }, 'ar');
});
