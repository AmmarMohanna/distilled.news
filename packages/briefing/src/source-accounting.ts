import type {PreparedArticle} from './prepare';
import type {UnaccountedSource} from './types';

/** Reference bookkeeping only: absence is not an editorial relevance or recall verdict. */
export function auditEditorSourceAccounting(raw: unknown, articles: Array<Pick<PreparedArticle, 'ref' | 'id' | 'alsoIds'>>): UnaccountedSource[] {
  const output = raw as {items?: unknown; left_out?: unknown} | null;
  const mentioned = new Set<string>();
  for (const list of [output?.items, output?.left_out]) {
    if (!Array.isArray(list)) continue;
    for (const row of list) {
      if (!Array.isArray(row?.sources)) continue;
      for (const ref of row.sources) if (typeof ref === 'string') mentioned.add(ref.replace(/\s+/g, ' ').trim().toUpperCase());
    }
  }
  return articles.filter(article => !mentioned.has(article.ref)).map(article => ({
    ref: article.ref,
    sourceIds: [...new Set([article.id, ...article.alsoIds])]
  }));
}
