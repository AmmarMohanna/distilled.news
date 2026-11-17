import {it,expect} from 'vitest';import {join} from 'node:path';
import {sha256} from '../packages/contracts/src/index';import {canonicalJson} from '../apps/worker/src/v1-intake/canonical';
import {persistentEvaluationDatabase} from '../apps/worker/src/v1-intake/evaluation-test-utils';import {V1FeedStore,feedTransact} from '../apps/worker/src/v1-intelligence/store';
import {loadNews,saveNews} from './news-evaluation-transport';
const root='.local-reports/news-correctness-openrouter/';
it.skipIf(process.env.NEWS_QUALIFIER_CORRECTION!=='INDEPENDENT_REVIEW_EXACT_DELETION')('removes only the independently rejected temporal qualifier while retaining the original draft',async()=>{
 const corpus=loadNews(root+'corpus.json'),source=corpus.find((s:any)=>s.body.includes('Replit makes')||s.title?.includes('Replit'));expect(source.body).toMatch(/partnership.{0,100}still in place/s);
 const paid=loadNews(root+'openrouter-46111c94cdfaead162ef-accounted.json');expect(paid.usage.confirmed).toBe(true);
 const ctx=await persistentEvaluationDatabase(join(process.cwd(),root,'d1-real-publication-openrouter'));try{
 const store=new V1FeedStore(ctx.db,undefined,'local-news-mirror'),jobs=await store.list<any>('feed-1','synthesis_jobs'),job=jobs[0],repairKey=JSON.stringify([job.selectionId,'repair-1']),old=await store.read<any>('feed-1','drafts',repairKey),corrected=structuredClone(old);expect(old).toBeTruthy();
 const matches=corrected.draft.stories.flatMap((s:any)=>s.claims).filter((c:any)=>c.text.includes('The previous partnership with Anthropic'));expect(matches).toHaveLength(1);matches[0].text=matches[0].text.replace('The previous partnership with Anthropic','The partnership with Anthropic');
 corrected.id=JSON.stringify([repairKey,'source-qualifier-correction-v1']);corrected.sourceDraftId=repairKey;corrected.createdAt=new Date().toISOString();
 const audit={id:corrected.id,feedId:'feed-1',scope:'INDEPENDENT_REVIEW_UNSUPPORTED_QUALIFIER_REMOVAL',originalHash:await sha256(canonicalJson(old)),correctedHash:await sha256(canonicalJson(corrected)),sourceRevisionId:source.id,sourceHash:source.sourceHash,review:'Independent source reviewer rejected previous partnership as narrating a disputed termination. Delete only previous; no facts or citations added. Corrected reader text requires a fresh full V2 verification.',createdAt:corrected.createdAt};
 await feedTransact(store,'feed-1',async tx=>{await tx.write('drafts',corrected.id,corrected);await tx.write('publication_response_recoveries',corrected.id,audit);await tx.write('synthesis_jobs',job.id,{...job,state:'PENDING',pendingCall:undefined,failure:undefined})});expect(await store.read('feed-1','drafts',repairKey)).toEqual(old);saveNews(root+'openrouter-qualified-draft.json',{draftId:corrected.id,audit,draft:corrected.draft,operatorAssisted:true});
 }finally{await ctx.dispose()}
});
