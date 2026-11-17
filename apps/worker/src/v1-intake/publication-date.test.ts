import {it,expect} from 'vitest';
import {resolvePublicationDate} from './publication-date';
it('keeps precise RSS publication when extraction only retained the same date',()=>{
 expect(resolvePublicationDate('2026-10-15','2026-10-15T16:52:44Z')).toMatchObject({publishedAt:'2026-10-15T16:52:44.000Z',timestampSource:'connector_precision_same_article_date',articlePublishedAt:'2026-10-15T00:00:00.000Z'});
});
it('does not replace a distinct original publication date with an update hint',()=>{
 expect(resolvePublicationDate('2026-09-24T10:00:00Z','2026-10-15T16:52:44Z').publishedAt).toBe('2026-09-24T10:00:00.000Z');
 expect(resolvePublicationDate('2026-10-15T12:00:00Z','2026-10-15T16:52:44Z').publishedAt).toBe('2026-10-15T12:00:00.000Z');
 expect(resolvePublicationDate(undefined).publishedAt).toBeUndefined();
});
