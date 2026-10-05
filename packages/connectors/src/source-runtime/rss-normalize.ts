import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { SourceRevision } from '@distilled/contracts';

export interface RssItem {
  key: string;
  upstreamId?: string;
  url?: string;
  publisherId?: string;
  title?: string;
  body: string;
  publishedAt?: string;
  language?: string;
  sourceRevision?: SourceRevision;
  identityValid: boolean;
  conflictingDuplicate?: boolean;
}
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', parseTagValue: false,
  trimValues: false, processEntities: true, htmlEntities: true,
  stopNodes:['*.content','*.summary','*.description','*.content:encoded','*.title'] });
const array = (v: unknown): any[] => v === undefined ? [] : Array.isArray(v) ? v : [v];
const entityParser=new XMLParser({parseTagValue:false,trimValues:false,processEntities:true,htmlEntities:true});
const decodeEntities=(value:string):string=>text(entityParser.parse(`<value>${value.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</value>`).value);
const text = (v: any): string => typeof v === 'string' ? v : typeof v === 'number' ? String(v) :
  Array.isArray(v) ? v.map(text).join(' ') : v && typeof v === 'object' ? Object.entries(v).filter(([k])=>!k.startsWith('@')).map(([,value])=>text(value)).join(' ') : '';
function plain(v: any): string {
  return decodeEntities(text(v).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ').replace(/\s+/gu, ' ').trim();
}
function httpUrl(value: string, base: string): string | undefined {
  if (!value.trim()) return undefined;
  try { const u = new URL(value.trim(), base); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : undefined; }
  catch { return undefined; }
}
function date(value: any): string | undefined {
  const raw = text(value).trim();
  if (!raw) return undefined;
  const n = Date.parse(raw); return Number.isFinite(n) ? new Date(n).toISOString() : undefined;
}

/** No DTD resolution. Invalid entries remain visible rather than disappearing at parse time. */
export function normalizeRssSnapshot(xml: string, sourceUrl: string): RssItem[] {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('INVALID_FEED');
  const doc = parser.parse(xml);
  const atom = !!doc.feed;
  const root = doc.feed ?? doc.rss?.channel ?? doc['rdf:RDF'];
  if (!root) throw new Error('INVALID_FEED');
  const language = plain(root.language || root['@xml:lang']) || undefined;
  const base = httpUrl(text(root['@xml:base']), sourceUrl) ?? sourceUrl;
  const rows = array(atom ? root.entry : root.item);
  const seen = new Map<string,RssItem>();
  const result: RssItem[] = [];
  rows.forEach((row, index) => {
    const r = row && typeof row === 'object' ? row : {};
    const link = atom ? array(r.link).find(l => !l['@rel'] || l['@rel'] === 'alternate') : r.link;
    const url = httpUrl(atom ? text(link?.['@href']) : text(link), base);
    const upstreamId = text(atom ? r.id : r.guid).trim() || undefined;
    // Missing identity receives a snapshot-local key solely so intake can reject/quarantine it.
    const key = upstreamId ? `id:${upstreamId}` : url ? `url:${url}` : `invalid-row:${index}`;
    const updated = atom ? date(r.updated) : undefined;
    const publisherUrl=httpUrl(text(r.source?.['@url']),base);
    const normalized:RssItem = { key, upstreamId, url, publisherId: publisherUrl ? new URL(publisherUrl).hostname : url ? new URL(url).hostname : undefined,
      title: plain(r.title) || undefined,
      body: plain(r['content:encoded'] ?? r.content ?? r.description ?? r.summary),
      publishedAt: date(atom ? r.published : r.pubDate ?? r['dc:date']),
      language: plain(r['@xml:lang']) || language,
      // Atom updated is retained as opaque metadata; it is not assumed a reliable comparator.
      sourceRevision: updated ? { scheme: 'atom_updated', value: updated, comparability: 'OPAQUE' as const, authority: 'ORIGIN' as const } : undefined,
      identityValid: !!(upstreamId || url) };
    const previous=seen.get(key);
    if (previous) {
      if (!previous.conflictingDuplicate && JSON.stringify(previous)!==JSON.stringify(normalized)) {
        // Conflicting rows under one identity/sequence cannot be chosen by feed position.
        // Preserve the raw snapshot, emit an unproposable observation for intake resolution.
        previous.conflictingDuplicate=true; previous.title=undefined; previous.body=''; previous.sourceRevision=undefined;
      }
      return;
    }
    seen.set(key,normalized); result.push(normalized);
  });
  return result;
}
