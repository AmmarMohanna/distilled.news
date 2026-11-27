import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LoaderCircle, Sparkles, X } from 'lucide-react';
import { catchUp } from './api';
import { toUiError, type UiMessage } from './api-errors';
import { useLanguage } from './LanguageControl';

export function CatchUpSummary({ username, slug, summaryTarget }: {
  username: string;
  slug: string;
  summaryTarget?: HTMLElement | null;
}) {
  const { t } = useLanguage();
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const request = useRef<AbortController | null>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<UiMessage>('');

  useEffect(() => () => request.current?.abort(), []);

  async function open() {
    setVisible(true);
    if (request.current) return;
    setSummary(null);
    setMessage('');
    setError('');
    setBusy(true);
    const controller = new AbortController();
    request.current = controller;
    try {
      const result = await catchUp(username, slug, controller.signal);
      if (controller.signal.aborted) return;
      if (result.status === 'ready') setSummary(result.summary);
      else setMessage(result.status === 'empty' ? 'No recent briefings to summarize.' : 'Still preparing. Try again shortly.');
    } catch (cause) {
      if (!controller.signal.aborted) setError(toUiError(cause));
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  function dismiss() {
    setVisible(false);
    trigger.current?.focus();
  }

  const panel = visible ? (
    <section id={id} className="catch-up-summary-section" aria-label={t('Catch-up summary')}>
      <div className="catch-up-summary-card">
        <button type="button" className="catch-up-summary-close" aria-label={t('Close summary')} onClick={dismiss}>
          <X size={18} aria-hidden />
        </button>
        {busy ? <p role="status">{t('Summarizing…')}</p>
          : error ? <p role="alert">{t(error)}</p>
          : <p role="status" dir="auto">{summary ?? t(message)}</p>}
      </div>
    </section>
  ) : null;

  return <div className="catch-up-summary">
    <button ref={trigger} type="button" className="catch-up-summary-button" aria-expanded={visible}
      aria-controls={visible ? id : undefined}
      onClick={() => visible ? dismiss() : void open()}>
      {busy ? <LoaderCircle size={17} className="summary-spinner" aria-hidden /> : <Sparkles size={17} aria-hidden />}
      {t(busy ? 'Summarizing…' : 'Catch me up')}
    </button>
    {summaryTarget ? createPortal(panel, summaryTarget) : summaryTarget === undefined ? panel : null}
  </div>;
}
