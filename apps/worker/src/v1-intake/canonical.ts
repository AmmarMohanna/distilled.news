import type { ConnectorHandoffRequest } from '@distilled/contracts';
export function canonicalJson(value:unknown):string {
  function ordered(v:unknown):unknown {
    if(Array.isArray(v)) return v.map(ordered);
    if(v && typeof v==='object') return Object.fromEntries(Object.entries(v).filter(([,value])=>value!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,value])=>[key,ordered(value)]));
    return v;
  }
  return JSON.stringify(ordered(value));
}
export function canonicalRequest(request:ConnectorHandoffRequest):string {
  return canonicalJson({...request,observations:[...request.observations].sort((a,b)=>a.id<b.id?-1:1),proposals:[...request.proposals].sort((a,b)=>a.observationId<b.observationId?-1:1)});
}
