/** Fixed read-only documents for the existing protected evaluation deployment. */
export function acquisitionEvaluationDocument(kind:string,origin:string):Response{
  const path="/v1/live-smoke/acquisition-fixture";
  if(kind==="denied")return new Response("Access denied",{status:403});
  if(kind==="rss"){
    const entries=[['end','2026-09-25T12:00:00Z'],['middle','2026-09-25T00:00:00Z'],['start','2026-09-24T12:00:00Z'],['start','2026-09-24T12:00:00Z'],['old','2026-09-23T00:00:00Z']];
    const items=entries.map(([id,date])=>`<item><title>Evaluation ${id}</title><link>${origin}${path}/item-${id}</link><guid>${origin}${path}/item-${id}</guid><pubDate>${date}</pubDate><description>Complete deterministic fixture reporting for ${id}: dated content tests strict temporal boundaries, canonical deduplication and source provenance.</description></item>`).join("");
    return new Response(`<rss version="2.0"><channel><title>Acquisition evaluation</title>${items}</channel></rss>`,{headers:{"content-type":"application/rss+xml","cache-control":"no-store"}});
  }
  if(kind==="article")return new Response(`<html><head><link rel="canonical" href="${origin}${path}/article"><meta property="article:published_time" content="2026-09-25T00:00:00Z"></head><body><article><h1>Finite deterministic article</h1><p>${'Dated independently observed reporting for the acquisition handoff. '.repeat(6)}</p></article></body></html>`,{headers:{"content-type":"text/html","cache-control":"no-store"}});
  return new Response("not found",{status:404});
}
