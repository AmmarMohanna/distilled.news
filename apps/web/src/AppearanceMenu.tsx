import {useEffect, useRef} from 'react';
import {ChevronRight, Globe, Moon, Sun} from 'lucide-react';
import {setWebsiteLanguage, useLanguage} from './LanguageControl';
import {useTheme} from './ThemeToggle';
import {useVisibleFeedMenu} from './useVisibleFeedMenu';

export function AppearanceMenu() {
  const ref = useRef<HTMLDetailsElement>(null);
  const {language, t} = useLanguage();
  const {theme, setTheme} = useTheme();
  useVisibleFeedMenu(ref);
  useEffect(() => {
    const closeOutside = (event: Event) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target) && ref.current) ref.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector('summary')?.focus();
      }
    };
    const resize = () => {if (window.innerWidth >= 900 && ref.current) ref.current.open = false;};
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('focusin', closeOutside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return <details className="appearance-menu" ref={ref}>
    <summary aria-label={t('Language and theme')} title={t('Language and theme')}>
      <svg className="appearance-symbol" data-theme={theme} width="34" height="34" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <Globe x="1" y="1" width="19" height="19"/>
        <path d="M6 34 34 6"/>
        {theme === 'dark' ? <Moon x="20" y="20" width="19" height="19"/> : <Sun x="20" y="20" width="19" height="19"/>}
      </svg>
    </summary>
    <div className="feed-options-popover appearance-menu-panel" role="group" aria-label={t('Language and theme')}>
      <button type="button" onClick={() => setWebsiteLanguage(({en:'fr',fr:'ar',ar:'en'} as const)[language])}>
        <Globe size={21} aria-hidden/><strong>{t('Language')}</strong><span dir="ltr">{language.toUpperCase()}</span><ChevronRight size={18} aria-hidden/>
      </button>
      <button type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
        {theme === 'dark' ? <Sun size={21} aria-hidden/> : <Moon size={21} aria-hidden/>}<strong>{t('Theme')}</strong><span>{t(theme === 'dark' ? 'Dark' : 'Light')}</span><ChevronRight size={18} aria-hidden/>
      </button>
    </div>
  </details>;
}
