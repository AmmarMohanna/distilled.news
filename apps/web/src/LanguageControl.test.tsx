import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { LanguageControl, setWebsiteLanguage, translateInterface, useLanguage } from './LanguageControl';
import { interfaceTranslations } from './interface-translations';

afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });

it('updates mounted labels, placeholders, accessibility labels and direction without altering input', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'), root = createRoot(host);
  function Form() {
    const { t } = useLanguage();
    const [value, setValue] = React.useState('Home');
    return <><LanguageControl/><h1>{t('Reset Password')}</h1><label>{t('New Password')}<input value={value} placeholder={t('Enter your new password')} onChange={event => setValue(event.target.value)}/></label><button aria-label={t('Show password')}>{t('Save')}</button><bdi>{value}</bdi></>;
  }
  try {
    await act(async () => root.render(<Form/>));
    for (const language of ['fr', 'ar', 'en'] as const) {
      await act(async () => setWebsiteLanguage(language));
      expect(host.querySelector('h1')?.textContent).toBe(translateInterface('Reset Password', language));
      expect(host.querySelector('input')?.placeholder).toBe(translateInterface('Enter your new password', language));
      expect(host.querySelector('input')?.value).toBe('Home');
      expect(host.querySelector('bdi')?.textContent).toBe('Home');
      expect(document.documentElement.lang).toBe(language);
      expect(document.documentElement.dir).toBe(language === 'ar' ? 'rtl' : 'ltr');
    }
  } finally { await act(async () => root.unmount()); }
});

it('has readable French and Arabic replacements for recovered interface copy', () => {
  for (const [key, values] of Object.entries(interfaceTranslations)) {
    expect(values[0], key).not.toMatch(/\?{2}|\uFFFD/);
    expect(values[1], key).toMatch(/[\u0600-\u06ff]/);
    expect(translateInterface(key, 'fr'), key).toBe(values[0]);
    expect(translateInterface(key, 'ar'), key).toBe(values[1]);
  }
  expect(translateInterface('Invalid or expired token', 'ar')).toContain('انتهت صلاحيته');
  expect(translateInterface('View {name}', 'fr', {name: 'Home'})).toBe('Voir Home');
  expect(translateInterface('View {name}', 'ar', {name: 'Home'})).toBe('عرض Home');
});
