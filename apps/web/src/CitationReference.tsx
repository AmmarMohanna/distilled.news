import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { BriefingEdition } from '@distilled/core';
import { briefingReferences, readerEvidenceUrl } from './briefing-references';
import { sourceEvidenceLabels } from './source-evidence-labels';
import { SourceLogo } from './SourceLogo';

export function CitationReference({ number, edition, loadDetail, label, sectionReference = false }: {
  number: number;
  edition: BriefingEdition;
  loadDetail: () => Promise<BriefingEdition | null>;
  label: string;
  sectionReference?: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLAnchorElement>(null);
  const preview = useRef<HTMLSpanElement>(null);
  const [loaded, setLoaded] = useState<BriefingEdition>();
  const [pending, setPending] = useState(false);
  const request = useRef<Promise<BriefingEdition | null> | undefined>(undefined);
  const opening = useRef(false);
  const [dismissed, setDismissed] = useState(false);
  function sourceFor(value: BriefingEdition) {
    const references = briefingReferences(value);
    const reference = sectionReference ? references.find(reference => reference.sectionIndex === number - 1) : references[number - 1];
    return reference ? value.sections[reference.sectionIndex]?.evidence[reference.evidenceIndex] : undefined;
  }
  const entry = sourceFor(loaded ?? edition), url = entry && readerEvidenceUrl(entry);
  const publisher = entry && sourceEvidenceLabels(entry).publisher;
  function fitPreview() {
    if (!trigger.current || !preview.current) return;
    const rect = trigger.current.getBoundingClientRect(), width = preview.current.offsetWidth;
    const left = rect.right - width;
    const clamped = Math.max(12, Math.min(left, window.innerWidth - width - 12));
    preview.current.style.transform = `translateX(${clamped - left}px)`;
    const above = rect.top >= preview.current.offsetHeight + 14;
    preview.current.dataset.placement = above ? 'above' : 'below';
    preview.current.style.insetBlockStart = above ? 'auto' : 'calc(100% + 6px)';
    preview.current.style.insetBlockEnd = above ? 'calc(100% + 6px)' : 'auto';
  }
  useLayoutEffect(fitPreview, [publisher, dismissed]);
  async function prepare() {
    if (entry) return loaded ?? edition;
    if (request.current) return request.current;
    setPending(true);
    request.current = loadDetail().catch(() => null);
    try { const detail = await request.current; if (detail) setLoaded(detail); return detail; }
    finally { setPending(false); request.current = undefined; }
  }
  return <span className="citation-reference"
    onKeyDown={event => { if (event.key === 'Escape') setDismissed(true); }}>
    <a ref={trigger} className="briefing-reference" href={url}
      onMouseEnter={() => { setDismissed(false); fitPreview(); void prepare(); }}
      onFocus={() => { fitPreview(); void prepare(); }} target={url ? '_blank' : undefined} rel="noopener noreferrer"
      aria-label={publisher ? `${label}: ${publisher}` : label} aria-describedby={publisher && !dismissed ? id : undefined}
      aria-busy={pending} role="link" tabIndex={0} onKeyDown={event => { if (!url && event.key === 'Enter') { event.preventDefault(); event.currentTarget.click(); } }} onClick={async event => {
        setDismissed(true);
        if (url) return;
        event.preventDefault();
        if (entry || opening.current) return;
        opening.current = true;
        // A touch can arrive before evidence has loaded. Reserve the tab during the gesture.
        const tab = window.open("about:blank", "_blank");
        if (tab) tab.opener = null;
        const detail = await prepare();
        const source = detail && sourceFor(detail);
        const href = source && readerEvidenceUrl(source);
        opening.current = false;
        if (!href) { tab?.close(); return; }
        if (tab && !tab.closed) tab.location.replace(href);
        else if (!tab) window.location.assign(href);
      }}><bdi dir="ltr">[{number}]</bdi>
    {entry && publisher && !dismissed && <span ref={preview} id={id} className="citation-publisher" role="tooltip" dir="ltr">
      <SourceLogo source={url ?? entry.sourceUrl ?? publisher}/><strong>{publisher}</strong>
    </span>}</a>
  </span>;
}
