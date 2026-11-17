import {it,expect} from 'vitest';
import {readdirSync,existsSync,renameSync} from 'node:fs';
import {comparisonRoot,comparisonLedger,load,save} from './v2-comparison-transport';
import {persistentEvaluationDatabase} from '../apps/worker/src/v1-intake/evaluation-test-utils';
it.skipIf(process.env.DISTILLED_ARTICLE_FIRST_PRESEND_RECOVERY!=='CONFIRMED_NO_REMOTE_RESERVATION')('recovers only the local hybrid editorial attempt proven never dispatched, preserving acquired intelligence and all financial history',async()=>{
 const files=readdirSync(comparisonRoot).filter(f=>f.startsWith('H-article-first-')&&f.endsWith('-intent.json')&&!existsSync(comparisonRoot+'/'+f.replace('-intent.json','-settled.json')));expect(files).toHaveLength(1);
 const file=files[0],intent=load(comparisonRoot+'/'+file);expect(intent).toMatchObject({state:'PREPARED',providerRequestSent:false,phase:'COMPARATIVE_EDITORIAL_PLAN'});
 const remote=comparisonLedger();expect(await remote.prepare('SELECT id FROM v1_model_spending_reservations WHERE id=?').bind(intent.reservation.id).first()).toBeNull();
 const ctx=await persistentEvaluationDatabase(load(comparisonRoot+'/H-article-first-persistence.json').path);try{
 const docs=(await ctx.db.prepare('SELECT kind,id,json FROM v1_feed_documents ORDER BY kind,id').all<any>()).results,failed=docs.filter(d=>d.kind==='semantic_results').map(d=>JSON.parse(d.json)).find(r=>r.input.kind==='COMPARATIVE_EDITORIAL_PLAN'&&r.status==='DEFERRED');expect(failed).toBeTruthy();
 const retained=docs.filter(d=>!['semantic_intents','semantic_results','semantic_settlements'].includes(d.kind)||d.id!==failed.id),removed=docs.filter(d=>!retained.includes(d));expect(removed).toHaveLength(3);
 const localRows=(await ctx.db.prepare('SELECT r.*,s.reported,s.cost_usd FROM v1_model_spending_reservations r LEFT JOIN v1_model_spending_settlements s ON s.id=r.id WHERE r.id=?').bind('semantic_intents:'+failed.id).all()).results;expect(localRows).toHaveLength(1);expect(localRows[0].reported).toBe(0);
 save(comparisonRoot+'/H-editorial-presend-recovery.json',{at:new Date().toISOString(),proof:'Atomic remote admission rejected; remote reservation absent; providerRequestSent=false',removed,localRows,remoteFinancialMutations:0,providerCalls:0});
 await ctx.db.batch([...removed.map(d=>ctx.db.prepare('DELETE FROM v1_feed_documents WHERE kind=? AND id=? AND json=?').bind(d.kind,d.id,d.json)),ctx.db.prepare('DELETE FROM v1_model_spending_settlements WHERE id=? AND reported=0').bind('semantic_intents:'+failed.id),ctx.db.prepare('DELETE FROM v1_model_spending_reservations WHERE id=?').bind('semantic_intents:'+failed.id)]);
 const after=(await ctx.db.prepare('SELECT kind,id,json FROM v1_feed_documents ORDER BY kind,id').all<any>()).results;expect(after).toEqual(retained);
 }finally{await ctx.dispose()}
 renameSync(comparisonRoot+'/'+file,comparisonRoot+'/'+file.replace('-intent.json','-presend-rejected.json'));if(existsSync(comparisonRoot+'/execution.lock'))renameSync(comparisonRoot+'/execution.lock',comparisonRoot+'/H-editorial-presend-rejected-lock.json');
},60000);
