import {it,expect} from 'vitest';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {extractClaimMentions,isNewsMention,assertClaimSpan} from '../apps/worker/src/v1-intelligence/claims';
import {indexSourcePassages} from '../apps/worker/src/v1-intelligence/source-passages';
import {constructionTransport,PACKET_CONSTRUCTION_VERSION} from '../apps/worker/src/v1-intelligence/construction-transport';
const corpusPath='.local-reports/news-end-to-end/corpus.json';
it.skipIf(!existsSync(corpusPath))('retains every character of the real Laplace, Replit and Anthropic evidence without semantic prefilters',async()=>{
 const corpus=JSON.parse(readFileSync(corpusPath,'utf8')),rows=[];
 for(const c of corpus){const revision:any={...c,id:c.id,feedId:'offline',contentHash:c.sourceHash,title:c.title,body:c.body,acceptedAt:'2026-10-21T11:55:54.796Z'},before=performance.now(),old=await extractClaimMentions(revision),oldMs=performance.now()-before,start=performance.now(),next=await indexSourcePassages(revision),indexMs=performance.now()-start;
  for(const m of next.mentions)assertClaimSpan(m,revision);
  for(const field of ['title','body'] as const){const text=revision[field]??'',mask=new Set<number>();for(const m of next.mentions.filter(m=>m.span.field===field))for(let i=m.span.start;i<m.span.end;i++)mask.add(i);for(let i=0;i<text.length;i++)if(text[i].trim())expect(mask.has(i)).toBe(true)}
  const wire=constructionTransport(next.mentions,{revision,candidates:[],role:'REPORTED_DEVELOPMENT'} as any,{source:{title:revision.title,text:revision.body},constructionOwnershipVersion:PACKET_CONSTRUCTION_VERSION}),schema=JSON.stringify(wire.schema),enums=[...schema.matchAll(/"enum":\[([^\]]*)\]/g)].reduce((n,m)=>n+(m[1].match(/,/g)?.length??0)+1,0);
  expect(enums).toBeLessThan(1000);expect(JSON.stringify(wire.state)).not.toContain('reportingRoleHint');
  rows.push({source:c.id,oldSentenceUnits:old.mentions.length,oldPreFiltered:old.mentions.filter(m=>!isNewsMention(m)).length,newPassageUnits:next.mentions.length,completeNonWhitespaceCoverage:true,oldMs,indexMs,enumOccurrences:enums,modelCalls:0,providerCostUsd:0});
 }
 writeFileSync('.local-reports/article-first-evidence.json',JSON.stringify({scope:'OFFLINE_SOURCE_INTEGRITY_NOT_MODEL_QUALITY',rows},null,2));
});
