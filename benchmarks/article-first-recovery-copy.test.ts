import {it,expect} from 'vitest';import {resolve} from 'node:path';
import {persistentEvaluationDatabase} from '../apps/worker/src/v1-intake/evaluation-test-utils';
import {comparisonRoot,load,save} from './v2-comparison-transport';import {hash} from './news-end-to-end';
it.skipIf(process.env.DISTILLED_RECOVERY_COPY!=='ISOLATED_LOCAL_COPY_ONLY')('starts a different model configuration from retained intelligence without altering the original attempt or financial receipts',async()=>{
 const original=await persistentEvaluationDatabase(load(comparisonRoot+'/H-article-first-persistence.json').path),copy=await persistentEvaluationDatabase(resolve(comparisonRoot,'d1-'+(process.env.DISTILLED_RECOVERY_COPY_NAME??'H-mini-strongwriter')));
 try{
  const query='SELECT kind,id,json FROM v1_feed_documents ORDER BY kind,id',before=(await original.db.prepare(query).all<any>()).results,cloned=(await copy.db.prepare(query).all<any>()).results;expect(cloned).toEqual(before);
  expect(before.some(d=>d.kind==='editions')).toBe(false);const failed=cloned.filter(d=>d.kind==='synthesis_jobs');expect(failed).toHaveLength(1);expect(JSON.parse(failed[0].json).state).toBe('FAILED');
  const invalidDrafts=process.env.DISTILLED_RECOVERY_REPLACE_FAILED_WRITER==='KNOWN_SETTLED_ONLY'?cloned.filter(d=>d.kind==='drafts'):[];for(const d of invalidDrafts){const draft=JSON.parse(d.json);expect(draft.draft.stories).toHaveLength(1);expect(draft.model).toContain('haiku');}
  const finances=(await copy.db.prepare('SELECT * FROM v1_model_spending_reservations ORDER BY id').all()).results;
  save(comparisonRoot+'/'+(process.env.DISTILLED_RECOVERY_COPY_NAME??'H-mini-strongwriter')+'-recovery-copy.json',{at:new Date().toISOString(),originalPath:original.persistedPath,copyPath:copy.persistedPath,originalDocumentsHash:hash(before),removedActiveJob:failed,archivedRejectedWriterDrafts:invalidDrafts,allOriginalReceiptsRetained:true,providerCalls:0,windowChanged:false});
  await copy.db.prepare('DELETE FROM v1_feed_documents WHERE kind=? AND id=? AND json=?').bind(failed[0].kind,failed[0].id,failed[0].json).run();
  for(const d of invalidDrafts)await copy.db.prepare('DELETE FROM v1_feed_documents WHERE kind=? AND id=? AND json=?').bind(d.kind,d.id,d.json).run();
  expect((await original.db.prepare(query).all<any>()).results).toEqual(before);expect((await copy.db.prepare(query).all<any>()).results).toEqual(cloned.filter(d=>d!==failed[0]&&!invalidDrafts.includes(d)));expect((await copy.db.prepare('SELECT * FROM v1_model_spending_reservations ORDER BY id').all()).results).toEqual(finances);
 }finally{await copy.dispose();await original.dispose()}
},60000);
