import { useRef } from 'react';

const length = 16;
function characters(value: string) { return value.toUpperCase().replace(/[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g, ''); }

export function VerificationCodeInput({ value, onChange, label, language }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  language: 'en' | 'ar' | 'fr';
}) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const slots = Array.from({ length }, (_, index) => value[index]?.trim() ?? '');
  function focus(index: number) { inputs.current[Math.max(0, Math.min(length - 1, index))]?.focus(); }
  function fill(index: number, text: string) {
    const code = characters(text);
    if (!code) return;
    const start = code.length >= length ? 0 : index;
    const next = [...slots];
    [...code].slice(0, length - start).forEach((character, offset) => { next[start + offset] = character; });
    onChange(next.map(character => character || ' ').join(''));
    focus(Math.min(length - 1, start + code.length));
  }
  function clear(index: number) {
    const next = [...slots]; next[index] = '';
    onChange(next.map(character => character || ' ').join(''));
  }
  function characterLabel(index: number) {
    return language === 'ar' ? `الحرف ${index + 1} من ${length}` : language === 'fr' ? `Caractère ${index + 1} sur ${length}` : `Character ${index + 1} of ${length}`;
  }
  return <div className="verification-code-grid" role="group" aria-label={label} dir="ltr">
    {Array.from({ length: 4 }, (_, group) => <div className="verification-code-group" key={group}>
      {Array.from({ length: 4 }, (_, offset) => {
        const index = group * 4 + offset;
        return <input key={index} ref={node => { inputs.current[index] = node; }} className="verification-code-cell"
          type="text" inputMode="text" value={slots[index]} required pattern="[2-9A-HJ-NP-Z]" maxLength={index === 0 ? 40 : 1}
          aria-label={characterLabel(index)} autoComplete={index === 0 ? 'one-time-code' : 'off'}
          autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoFocus={index === 0}
          onFocus={event => event.currentTarget.select()}
          onChange={event => event.target.value ? fill(index, event.target.value) : clear(index)}
          onPaste={event => { event.preventDefault(); fill(index, event.clipboardData.getData('text')); }}
          onKeyDown={event => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); focus(index + (event.key === 'ArrowLeft' ? -1 : 1)); }
            if (event.key === 'Backspace') {
              event.preventDefault();
              const target = slots[index] ? index : Math.max(0, index - 1);
              clear(target); focus(target);
            }
            if (event.key === 'Delete') { event.preventDefault(); clear(index); }
          }}/>;
      })}
    </div>)}
  </div>;
}
