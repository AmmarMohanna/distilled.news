import type { ModelPort } from './model';

/** Lossless wire optimization. Parsed output and every schema constraint stay unchanged. */
export function shareSchemaDefinitions(schema: Record<string, any>): Record<string, any> {
  if (schema.$defs) return schema;
  const counts = new Map<string, number>();
  let scopedReference = false;
  // Only these positions contain schemas. enum/const/default/examples are data.
  const mapKeywords = new Set(['properties', 'patternProperties', 'dependentSchemas']);
  const arrayKeywords = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);
  const singleKeywords = new Set(['items', 'additionalItems', 'additionalProperties', 'unevaluatedItems', 'unevaluatedProperties', 'contains', 'propertyNames', 'not', 'if', 'then', 'else']);
  const children = (v: Record<string, any>, visit: (x: any) => any) => Object.fromEntries(
    Object.entries(v).map(([k, x]) => [k,
      mapKeywords.has(k) && x && typeof x === 'object' && !Array.isArray(x)
        ? Object.fromEntries(Object.entries(x).map(([name, child]) => [name, visit(child)]))
        : arrayKeywords.has(k) && Array.isArray(x) ? x.map(visit)
        : singleKeywords.has(k) ? Array.isArray(x) ? x.map(visit) : visit(x)
        : x]));
  const count = (v: any, root = false): void => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return;
    if (['$ref', '$id', '$anchor', '$dynamicRef', '$dynamicAnchor', '$defs', 'definitions'].some(k => k in v)) scopedReference = true;
    if (!root) {
      const key = JSON.stringify(v);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    children(v, x => { count(x); return x; });
  };
  count(schema, true);
  // Moving an existing scoped reference could change its resolution base.
  if (scopedReference) return schema;
  const names = new Map<string, string>();
  for (const [key, n] of counts) {
    const name = `d${names.size}`, ref = JSON.stringify({ $ref: `#/$defs/${name}` });
    if (n > 1 && n * key.length > key.length + name.length + 4 + n * ref.length)
      names.set(key, name);
  }
  if (!names.size) return schema;
  const defs: Record<string, unknown> = {};
  const encode = (v: any, root = false): any => {
    if (!v || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(x => encode(x));
    const name = !root ? names.get(JSON.stringify(v)) : undefined;
    if (name) {
      if (!(name in defs)) defs[name] = encode(v, true);
      return { $ref: `#/$defs/${name}` };
    }
    return children(v, x => encode(x));
  };
  const result = { ...encode(schema, true), $defs: defs };
  const before = JSON.stringify(schema), after = JSON.stringify(result);
  return after.length < before.length && new TextEncoder().encode(after).length < new TextEncoder().encode(before).length
    ? result : schema;
}

export function withSharedSchemas(port: ModelPort): ModelPort {
  return { complete(request) {
    if (!request.responseSchema) return port.complete(request);
    const responseSchema = shareSchemaDefinitions(request.responseSchema);
    return port.complete(responseSchema === request.responseSchema ? request : { ...request, responseSchema });
  } };
}
