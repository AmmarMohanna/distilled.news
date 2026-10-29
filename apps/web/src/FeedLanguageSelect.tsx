import {useEffect, useId, useRef, useState, type ReactNode} from 'react';
import {ChevronDown, Globe} from 'lucide-react';
import {useLanguage} from './LanguageControl';

type Language = 'en' | 'fr' | 'ar';
const languages = ['en', 'fr', 'ar'] as const;
const names = {en: 'English', fr: 'French', ar: 'Arabic'};

function Flag({language}: {language: Language}) {
  return <svg className="feed-language-flag" viewBox="0 0 30 20" aria-hidden="true">
    {language === 'en' ? <><path fill="#163b8e" d="M0 0h30v20H0z"/><path stroke="#fff" strokeWidth="5" d="m0 0 30 20M30 0 0 20"/><path stroke="#df1533" strokeWidth="2" d="m0 0 30 20M30 0 0 20"/><path stroke="#fff" strokeWidth="7" d="M15 0v20M0 10h30"/><path stroke="#df1533" strokeWidth="4" d="M15 0v20M0 10h30"/></> : language === 'fr' ? <><path fill="#fff" d="M0 0h30v20H0z"/><path fill="#1038a3" d="M0 0h10v20H0z"/><path fill="#ed243d" d="M20 0h10v20H20z"/></> : <><path fill="#fff" d="M0 0h30v20H0z"/><path fill="#ed243d" d="M0 0h30v5H0zM0 15h30v5H0z"/><path fill="#009852" d="m15 5-4 4h2l-5 3h4l-3 2h5v2h2v-2h5l-3-2h4l-5-3h2z"/></>}
  </svg>;
}

export function FeedLanguageSelect({value, onChange, labelId}: {value: Language; onChange: (language: Language) => void; labelId: string}) {
  const {t} = useLanguage();
  return <FeedSettingsSelect value={value} onChange={onChange} labelId={labelId} kind="language" triggerIcon={<span className="feed-language-badge"><Globe size={20} aria-hidden/></span>} options={languages.map(language => ({value: language, label: t(names[language]), icon: <Flag language={language}/>}))}/>;
}

export function FeedSettingsSelect<T extends string>({value, onChange, labelId, kind, options, triggerIcon}: {value: T; onChange: (value: T) => void; labelId: string; kind: 'language' | 'rhythm' | 'role'; options: {value: T; label: string; icon?: ReactNode}[]; triggerIcon?: ReactNode}) {
  const selected = options.find(option => option.value === value)!;
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const position = () => {
    const panel = menu.current, button = trigger.current;
    if (!panel?.matches(':popover-open') || !button) return;
    const anchor = button.getBoundingClientRect(), viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? innerWidth, height = viewport?.height ?? innerHeight;
    panel.style.width = anchor.width + 'px';
    panel.style.maxWidth = Math.max(0, width - 24) + 'px';
    const below = Math.max(0, top + height - anchor.bottom - 18);
    const above = Math.max(0, anchor.top - top - 18);
    const showBelow = panel.scrollHeight + 2 <= below || below >= above;
    panel.style.maxHeight = (showBelow ? below : above) + 'px';
    panel.style.left = Math.max(left + 12, Math.min(anchor.left, left + width - anchor.width - 12)) + 'px';
    panel.style.top = (showBelow ? anchor.bottom + 6 : anchor.top - panel.getBoundingClientRect().height - 6) + 'px';
  };
  useEffect(() => {
    const panel = menu.current!;
    const toggled = () => {setOpen(panel.matches(':popover-open')); position();};
    panel.addEventListener('toggle', toggled);
    window.addEventListener('resize', position);
    document.addEventListener('scroll', position, true);
    return () => {panel.removeEventListener('toggle', toggled); window.removeEventListener('resize', position); document.removeEventListener('scroll', position, true);};
  }, []);
  const close = () => {menu.current?.hidePopover?.(); trigger.current?.focus();};
  const show = () => {
    menu.current?.showPopover(); position();
    menu.current?.querySelector<HTMLButtonElement>(`[data-value="${value}"]`)?.focus();
  };
  return <div className="feed-settings-select">
    <button ref={trigger} type="button" className={`feed-settings-trigger feed-${kind}-trigger`} aria-haspopup="listbox" aria-expanded={open} aria-controls={id} aria-labelledby={`${labelId} ${id}-value`} onClick={() => open ? close() : show()} onKeyDown={event => {if(event.key === 'ArrowDown' || event.key === 'ArrowUp'){event.preventDefault(); show();}}}>
      {triggerIcon ?? selected.icon}<span id={`${id}-value`}>{selected.label}</span><ChevronDown size={16} aria-hidden/>
    </button>
    <div ref={menu} id={id} popover="auto" role="listbox" aria-labelledby={labelId} className={`feed-settings-menu feed-${kind}-menu`} onBlur={event => {if(event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) menu.current?.hidePopover?.();}} onKeyDown={event => {
      if(event.key === 'Escape'){event.preventDefault(); close();}
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
        event.preventDefault();
        const buttons = [...menu.current!.querySelectorAll<HTMLButtonElement>('[role="option"]')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
      }
    }}>
      {options.map(option => <button type="button" role="option" tabIndex={-1} data-value={option.value} aria-selected={value === option.value} key={option.value} onClick={() => {onChange(option.value); close();}}>{option.icon}<span>{option.label}</span></button>)}
    </div>
  </div>;
}
