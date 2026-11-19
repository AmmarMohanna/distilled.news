import { useState } from 'react';
import type { BriefingEdition } from '@distilled/core';

export function BriefingReadMore({ body, sectionIndex, language, loadDetail, renderBody, onOpenSources }: {
  body: string;
  sectionIndex?: number;
  language: 'en' | 'ar' | 'fr';
  loadDetail: () => Promise<BriefingEdition | null>;
  renderBody: (body: string) => React.ReactNode;
  onOpenSources?: () => void;
}) {
  const [loaded, setLoaded] = useState<BriefingEdition>();
  const [open, setOpen] = useState(false);
  const section = loaded?.sections[sectionIndex ?? 0];
  const text = section?.summary.replace(/\r\n/g, '\n');
  const boundary = text?.indexOf('\n') ?? -1;
  const detail = sectionIndex === undefined && (loaded?.sections.length ?? 0) > 1
    ? loaded!.sections.map(section => section.summary).join('\n\n')
    : text && !section?.title.trim() && boundary > 0 ? text.slice(boundary + 1).trim() : text ?? body;
  const sourceLabel = language === 'ar' ? 'تفاصيل المصادر' : language === 'fr' ? 'Détails des sources' : 'Source details';
  if (!body.trim()) return onOpenSources ? <button type="button" className="briefing-extra-sources" onClick={onOpenSources}>{sourceLabel}</button> : null;
  const labels = language === 'ar' ? ['اقرأ المزيد', 'عرض أقل'] : language === 'fr' ? ['Lire la suite', 'Réduire'] : ['Read more', 'Read less'];
  const entries = sectionIndex === undefined ? loaded?.sections.flatMap(section => section.evidence) ?? [] : section?.evidence ?? [];
  const extraSources = entries.length > 1 || entries.some(entry => entry.media.length || entry.links.length > 1);
  return <details className="briefing-read-more" onToggle={event => {
    const expanded = event.currentTarget.open; setOpen(expanded);
    if (expanded && !loaded) void loadDetail().then(detail => { if (detail) setLoaded(detail); });
  }}>
    <summary>{labels[open ? 1 : 0]}<span aria-hidden="true">{open ? ' −' : ' …'}</span></summary>
    <div className="briefing-expanded-text">{renderBody(detail)}
      {extraSources && onOpenSources && <button type="button" className="briefing-extra-sources" onClick={onOpenSources}>{sourceLabel}</button>}
    </div>
  </details>;
}
