import {it,expect} from 'vitest';
import {existsSync} from 'node:fs';
import {persistentEvaluationDatabase} from '../apps/worker/src/v1-intake/evaluation-test-utils';
import {comparisonRoot,load,save} from './v2-comparison-transport';
import {hash} from './news-end-to-end';
it.skipIf(!existsSync(comparisonRoot+'/H-article-first-strongwriter2-report.json'))('reads the actually committed private edition and its verification receipt without claiming editorial quality',async()=>{
 const report=load(comparisonRoot+'/H-article-first-strongwriter2-report.json'),ctx=await persistentEvaluationDatabase(load(comparisonRoot+'/H-article-first-strongwriter2-persistence.json').path);
 try{
  const rows=(await ctx.db.prepare('SELECT kind,id,json FROM v1_feed_documents ORDER BY kind,id').all<any>()).results,editions=rows.filter(r=>r.kind==='editions');expect(editions).toHaveLength(1);const edition=JSON.parse(editions[0].json);expect(edition).toEqual(report.value);expect(edition.stories).toHaveLength(6);expect(edition.evidenceRevisionIds).toHaveLength(3);expect(edition.generation.usageConfirmed).toBe(true);
  const job=JSON.parse(rows.find(r=>r.kind==='synthesis_jobs')!.json);expect(job.state).toBe('DONE');expect(job.callsUsed).toBe(2);expect(job.cost).toBeCloseTo(.09445,8);
  const manifest=JSON.parse(rows.find(r=>r.kind==='verification_manifests')!.json);expect(manifest.manifest.model).toBe('openai/gpt-4.1');const result=JSON.parse(rows.find(r=>r.kind==='semantic_results'&&r.id===manifest.paid.operationId)!.json);expect(result.status).toBe('SUCCEEDED');expect(result.usage.reported).toBe(true);
  const visibility=await ctx.db.prepare("SELECT public_feed_enabled FROM briefings WHERE id='feed-1'").first<any>();expect(visibility.public_feed_enabled).toBe(0);
  save(comparisonRoot+'/article-first-persistence-readback.json',{editionId:edition.id,editionHash:hash(edition),persistedAt:edition.createdAt,stories:6,sources:3,private:true,verificationReceipt:manifest.paid.operationId,generationCostUsd:job.cost,operatorAssistedRecovery:true,editorialQuality:'FAILED_INDEPENDENT_SOURCE_REVIEW',externalPublication:false,providerCalls:0});
 }finally{await ctx.dispose()}
},30000);
