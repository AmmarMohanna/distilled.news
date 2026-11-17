import {it,expect} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {sourceCorpus,hash} from './news-end-to-end';
import {extractClaimMentions,isNewsMention,assertClaimSpan} from '../apps/worker/src/v1-intelligence/claims';
import {constructionTransport,MINIMAL_CONSTRUCTION_VERSION} from '../apps/worker/src/v1-intelligence/construction-transport';
import {admitModelOperation,modelCapability} from '../apps/worker/src/v1-intelligence/model-capacity';

it('freezes real long articles and successful V2 source without changing evidence or buying inference',async()=>{
 const root=process.env.DISTILLED_REAL_NEWS_SOURCE_DIR??'../../.review-tmp/backend-briefing-review/.local-reports/single-feed-preflight';
 const names=['ai-again-pipeline-details.json','fresh-evidence-after-recovery.json'];
 if(names.some(n=>!existsSync(join(root,n)))){console.info('REAL_NEWS_PRIVATE_CORPUS_UNAVAILABLE: set DISTILLED_REAL_NEWS_SOURCE_DIR');return}
 const pipeline=JSON.parse(readFileSync(join(root,names[0]),'utf8')),fresh=JSON.parse(readFileSync(join(root,names[1]),'utf8'));
 const sources=pipeline.waits.map((w:any)=>JSON.parse(w.json).input?.state?.source).filter((s:any)=>s?.text);
 const revision=JSON.parse(fresh.result[0].results[0].json);sources.push({id:revision.id,title:revision.title,text:revision.body});
 const corpus=sourceCorpus(sources);expect(corpus).toHaveLength(3);expect(corpus.some(c=>c.title?.includes('Laplace'))).toBe(true);expect(corpus.some(c=>c.title?.includes('Replit'))).toBe(true);
 const privateRoot='.local-reports/news-end-to-end';mkdirSync(privateRoot,{recursive:true});
 const cases=[];
 for(const source of corpus){
  const ownership=pipeline.waits.map((w:any)=>JSON.parse(w.json).input?.state?.claimOwnership).find((o:any)=>o?.sourceRevisionId===source.id),provenance=ownership??revision;
  expect(provenance.canonicalUrl).toMatch(/^https:\/\/techcrunch\.com\//);
  const raw=pipeline.articles.find((a:any)=>a.id===source.id),savedRevision={...source,feedId:'isolated-real-news-evaluation',acceptedAt:raw?.acceptedAt??revision.acceptedAt,publishedAt:raw?.publishedAt??revision.publishedAt,contentHash:hash({title:source.title,body:source.body})};
  const extracted=await extractClaimMentions(savedRevision as any),mentions=extracted.mentions.filter(isNewsMention);for(const m of extracted.mentions)assertClaimSpan(m,savedRevision as any);
  const wire=constructionTransport(mentions,{revision:savedRevision,role:'REPORTED_DEVELOPMENT',candidates:[]} as any,{constructionOwnershipVersion:MINIMAL_CONSTRUCTION_VERSION,source:{id:source.id,title:source.title,text:source.body},claimMentions:mentions.map(m=>({id:m.id,text:m.sourceText,span:m.span}))});
  const admission=admitModelOperation('openai/gpt-4.1',wire.state,wire.schema,modelCapability('openai/gpt-4.1'),4096);
  cases.push({id:source.id,title:source.title,sourceHash:source.sourceHash,publishedAt:savedRevision.publishedAt,acquiredAt:savedRevision.acceptedAt,canonicalUrl:provenance.canonicalUrl,originalSourceIdentity:{evidenceId:provenance.evidenceId,sourceObservationId:provenance.sourceObservationId,acquiredContentId:provenance.acquiredContentId},bodyChars:source.body.length,words:source.body.trim().split(/\s+/).length,claimMentions:extracted.mentions.length,newsClaimMentions:mentions.length,exactSpanIntegrity:true,initialConstruction:admission,reviewStatus:'PENDING',labelProvenance:'REAL_SAVED_ARTICLE; AI_ASSISTED_RUBRIC_NOT_HUMAN_GOLD'});
 }
 const files=names.map(name=>({name,sha256:createHash('sha256').update(readFileSync(join(root,name))).digest('hex')}));
 const manifest={version:'real-news-e2e-v1',corpusHash:hash(corpus),cases,sourceArtifacts:files,routeModels:{cloudflare:{strong:'cloudflare:openai/gpt-4.1',writer:'cloudflare:openai/gpt-4.1',verification:'cloudflare:openai/gpt-4.1'},openrouter:{strong:'openai/gpt-4.1',writer:'openai/gpt-4.1',verification:'openai/gpt-4.1'}},execution:{concurrency:1,reconciliation:'DEVELOPMENTS',validationContract:'EVIDENCE_GROUNDED_V2',maxOutputTokensByTask:{construction:4096,reconciliation:4096,editorial:12288,writer:4096,verification:8192,repair:4096},cloudflareOutputCaps:'EVALUATION_CANDIDATES_NOT_SERVICE_MAXIMUM_OR_PRODUCTION_QUALIFICATION'},acquisition:'IMMUTABLE_SAVED_SOURCE; NOT_LIVE_NETWORK',paidCalls:0,qualificationChanged:false};
 writeFileSync(join(privateRoot,'corpus.json'),JSON.stringify(corpus,null,2));writeFileSync(join(privateRoot,'manifest.json'),JSON.stringify(manifest,null,2));
 writeFileSync('benchmarks/news-end-to-end-preflight.json',JSON.stringify({...manifest,cases:manifest.cases.map(({originalSourceIdentity,...c})=>({...c,originalSourceIdentityHash:hash(originalSourceIdentity)}))},null,2)+'\n');
 console.info(JSON.stringify(cases.map(({title,bodyChars,claimMentions,initialConstruction})=>({title,bodyChars,claimMentions,initialReservationUsd:initialConstruction.reservationCostUsd}))));
});
