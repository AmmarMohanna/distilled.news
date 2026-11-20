type Row = Record<string, any>;
const row = (v: unknown): Row => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error('COMPACT_PROOF_OBJECT');
  return v as Row;
};
const exact = (v: unknown, keys: string[]): Row => {
  const r = row(v);
  if (Object.keys(r).length !== keys.length || keys.some(k => !(k in r))) throw Error('COMPACT_PROOF_FIELDS');
  return r;
};
const objectSchema = (properties: Row) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

/** Short keys and passage IDs only. No assessment or explanation is removed. */
export function compactProofSchema(original: Row): Row {
  const result = structuredClone(original);
  for (const item of Object.values(result.properties.results.properties) as Row[]) {
    for (const [id, check] of Object.entries(item.properties.citationChecks.properties) as [string, Row][])
      item.properties.citationChecks.properties[id] = objectSchema({ s: check.properties.support, q: check.properties.quote, x: check.properties.explanation });
    for (const [id, facet] of Object.entries(item.properties.facets.properties) as [string, Row][]) {
      const f = facet.properties;
      if (f.sourcePersonName || f.sourceRoleSurface) throw Error('COMPACT_PROOF_REQUIRES_INDEPENDENT_BINDINGS');
      item.properties.facets.properties[id] = objectSchema({ s: f.support, p: { ...f.evidence, items: f.evidence.items.properties.quote }, x: f.explanation });
    }
  }
  return result;
}

export function expandCompactProofs(raw: unknown, passages: Array<{ id: string; source: string }>, isolateMalformedItems = false): unknown {
  const root = exact(raw, ['results']), byId = new Map(passages.map(p => [p.id, p]));
  if (isolateMalformedItems) return { results: Object.fromEntries(Object.entries(row(root.results)).flatMap(([id, value]) => {
    try { const decoded = expandCompactProofs({ results: { [id]: value } }, passages) as Row; return [[id, decoded.results[id]]]; }
    catch { return []; } // Missing items still fail the existing completeness validator.
  })) };
  return { results: Object.fromEntries(Object.entries(row(root.results)).map(([id, value]) => {
    const r = exact(value, ['inventory', 'verdict', 'issues', 'priorIds', 'citationChecks', 'facets']);
    const citationChecks = Object.fromEntries(Object.entries(row(r.citationChecks)).map(([ref, value]) => {
      const c = exact(value, ['s', 'q', 'x']);
      if (typeof c.q !== 'string' || byId.get(c.q)?.source !== ref) throw Error('COMPACT_PROOF_CITATION');
      return [ref, { support: c.s, quote: c.q, explanation: c.x }];
    }));
    const facets = Object.fromEntries(Object.entries(row(r.facets)).map(([key, value]) => {
      const f = exact(value, ['s', 'p', 'x']);
      if (!Array.isArray(f.p)) throw Error('COMPACT_PROOF_EVIDENCE');
      const evidence = f.p.map((id: unknown) => {
        const p = typeof id === 'string' ? byId.get(id) : undefined;
        if (!p) throw Error('COMPACT_PROOF_PASSAGE');
        return { source: p.source, quote: p.id };
      });
      return [key, { support: f.s, evidence, explanation: f.x }];
    }));
    return [id, { ...r, citationChecks, facets }];
  })) };
}

/** Preserve received adverse judgments before attempting proof decoding. */
export function compactAdverseItems(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return [];
  const results = (raw as Row).results;
  if (!results || typeof results !== 'object' || Array.isArray(results)) return [];
  return Object.entries(results).filter(([, v]) => {
    if (!v || typeof v !== 'object') return false;
    const r = v as Row;
    const values = (x: unknown): Row[] => x && typeof x === 'object' ? Object.values(x).filter(v => v && typeof v === 'object') as Row[] : [];
    return ['fix', 'drop'].includes(r.verdict) || ['incomplete', 'uncertain'].includes(r.inventory) ||
      Array.isArray(r.issues) && r.issues.length > 0 ||
      values(r.facets).some(f => ['contradicted', 'unsupported', 'uncertain'].includes(f.s)) ||
      values(r.citationChecks).some(c => ['unsupported', 'uncertain'].includes(c.s));
  }).map(([id]) => id);
}

export const COMPACT_PROOF_WIRE = '\nRESPONSE ENCODING ONLY: use the supplied compact response schema. In citationChecks, s=support, q=evidencePassages ID, x=full explanation. In EVERY facet, s=support, p=array of evidencePassages IDs, x=full explanation. Each passage ID uniquely binds its source; do not return a separate source field. Preserve ALL facet decisions, FULL_READER obligations, citation checks, adverse findings, uncertainty and explanatory reasoning. Inventory, verdict, issues and priorIds keep their original meanings. This encoding overrides earlier response-shape examples only, never the verification requirements.';
