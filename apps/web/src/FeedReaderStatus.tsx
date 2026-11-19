import React from 'react';
import { FeedPublicationNotice } from './FeedNotice';
import { SourceHealth } from './SourceHealth';
import type { FeedPayload } from './types';

export function FeedReaderStatus({ payload, isAdmin, language, t }: {
  payload: FeedPayload | null;
  isAdmin: boolean;
  language: 'en' | 'ar' | 'fr';
  t: (text: string) => string;
}) {
  return <>
    {payload?.publicationState === 'quiet' && <p className="muted feed-status-message">{t('No new developments in the latest scheduled briefing.')}</p>}
    {isAdmin && <>
      <FeedPublicationNotice publicationState={payload?.publicationState} hasPublishedEditions={Boolean(payload?.editions.length)} language={language}/>
      <SourceHealth sources={payload?.sourceAvailability} unavailable={payload?.sourceHealthUnavailable} language={language} t={t} showDetails={false}/>
      {payload?.publicationState === 'setup_required' && <p className="muted feed-status-message" role="status">{t('Briefing generation is awaiting an AI connection.')}</p>}
    </>}
  </>;
}
