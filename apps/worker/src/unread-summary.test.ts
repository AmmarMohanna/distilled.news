import {readFileSync} from 'node:fs';
import {Miniflare} from 'miniflare';
import {afterAll,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {BriefingModelError,DEFAULT_PRICES,type ModelPort} from '@distilled/briefing';
import type {BriefingEdition} from '@distilled/core';
import {V3SpendGuard} from './v3-spend';
import {generateUnreadSummary,parseUnreadSummary,prepareUnreadSummary,summaryTokenUpperBound,unreadSummaryRequest} from './unread-summary';
import {migrationStatements} from './test-migrations';

let mf:Miniflare,db:D1Database;
const now=Date.parse('2026-10-26T12:00:00Z');
const edition=(id:string,hours:number,text='Officials announced a new electricity schedule.')=>({id,publishedAt:new Date(now-hours*3600000).toISOString(),sections:[{title:'',summary:text}]} as BriefingEdition);
const input=()=>prepareUnreadSummary([edition('one',1)],[],'en',now);
const response={text:'{"summary":"Officials announced a new electricity schedule."}',inputTokens:100,outputTokens:20,costUsd:.0001};
const port=()=>({complete:vi.fn(async()=>response)});
const run=(p:ModelPort,accountId='reader',data=input())=>generateUnreadSummary({db,accountId,feedId:'feed',input:data,port:p,guard:new V3SpendGuard(db,{dailyUsd:1,runUsd:.1}),prices:DEFAULT_PRICES,now});
beforeAll(async()=>{
  mf=new Miniflare({modules:true,script:"export default {fetch(){return new Response('ok')}}",d1Databases:['DB']});
  db=await mf.getD1Database('DB') as unknown as D1Database;
  await db.exec('CREATE TABLE unread_summary_cache (kind TEXT,id TEXT,feed_id TEXT,json TEXT,PRIMARY KEY(kind,id))');
  const sql=readFileSync(new URL('../migrations/0067_v3_model_spend.sql',import.meta.url),'utf8');
  await db.batch(migrationStatements(sql).map(s=>db.prepare(s)));
});
afterAll(async()=>mf.dispose());
beforeEach(async()=>{await db.exec('DELETE FROM unread_summary_cache');await db.exec('DELETE FROM v3_model_spend');});

it('uses published time, excludes read/old/future briefings and keeps chronological context',()=>{
  expect(prepareUnreadSummary([edition('old',24),edition('future',-1),edition('read',1),edition('new',0),edition('earlier',2)],['read'],'en',now).briefings.map(b=>b.id)).toEqual(['earlier','new']);
});
it('bounds multilingual input without cutting a briefing or its qualifiers',()=>{
  const text='قال المسؤول إن الخطة قد تبدأ إذا تمت الموافقة. '.repeat(500);
  expect(()=>prepareUnreadSummary([edition('huge',1,text),edition('small',2)],[],'ar',now)).toThrow('too long');
  const data=prepareUnreadSummary([edition('small',1,'A short supported fact.'),edition('huge',2,text),edition('older',3)],[],'ar',now);
  expect(data.briefings.map(b=>b.id)).toEqual(['small']);
  const req=unreadSummaryRequest(data);expect(summaryTokenUpperBound(req)).toBeGreaterThan(req.user.length);
});
it('does not invoke a model for an empty unread window',async()=>{
  const p=port();expect(await run(p,'reader',{language:'en',briefings:[]})).toEqual({status:'empty'});expect(p.complete).not.toHaveBeenCalled();
});
it('reuses paid results; unread content, language and reader identity remain in the cache scope',async()=>{
  const p=port();expect(await run(p)).toEqual({status:'ready',summary:'Officials announced a new electricity schedule.'});
  await run(p);expect(p.complete).toHaveBeenCalledOnce();
  await run(p,'another-reader');await run(p,'reader',{...input(),language:'ar'});
  expect(p.complete).toHaveBeenCalledTimes(3);
});
it('claims concurrent duplicate requests atomically before calling the provider',async()=>{
  let release!:()=>void;const wait=new Promise<void>(resolve=>release=resolve),p={complete:vi.fn(async()=>{await wait;return response;})};
  const first=run(p);await vi.waitFor(()=>expect(p.complete).toHaveBeenCalledOnce());
  expect(await run(p)).toEqual({status:'pending'});release();await first;expect(p.complete).toHaveBeenCalledOnce();
});
it('settles invalid paid output and never blindly repeats it',async()=>{
  const p={complete:vi.fn(async()=>({...response,text:'not JSON'}))};
  await expect(run(p)).rejects.toThrow();await expect(run(p)).rejects.toThrow();expect(p.complete).toHaveBeenCalledOnce();
  expect(await db.prepare('SELECT state FROM v3_model_spend').first()).toMatchObject({state:'settled'});
});
it('preserves an uncertain hold and blocks duplicate paid attempts',async()=>{
  const p={complete:vi.fn(async()=>{throw new BriefingModelError('network reset',false,true);})};
  await expect(run(p)).rejects.toThrow();await expect(run(p)).rejects.toThrow();expect(p.complete).toHaveBeenCalledOnce();
  expect(await db.prepare('SELECT state,outcome FROM v3_model_spend').first()).toEqual({state:'held',outcome:'uncertain'});
});
it('can try again after a conclusively refused operation without reusing an uncertain one',async()=>{
  const p={complete:vi.fn().mockRejectedValueOnce(new BriefingModelError('429',false,false)).mockResolvedValue(response)};
  await expect(run(p)).rejects.toThrow();expect(await run(p)).toMatchObject({status:'ready'});expect(p.complete).toHaveBeenCalledTimes(2);
});
it('recovers a durably recorded response without another model call',async()=>{
  const p=port();await run(p);
  const row=await db.prepare('SELECT id,json FROM unread_summary_cache').first<{id:string;json:string}>();
  const value=JSON.parse(row!.json);value.status='pending';delete value.summary;
  await db.prepare('UPDATE unread_summary_cache SET json=? WHERE id=?').bind(JSON.stringify(value),row!.id).run();
  expect(await run(p)).toMatchObject({status:'ready'});expect(p.complete).toHaveBeenCalledOnce();
});

it('accepts summaries through 120 words without raising the 40-80 word writing target',()=>{
  for(const count of [106,120]){const summary=Array(count).fill('news').join(' ');expect(parseUnreadSummary(JSON.stringify({summary}))).toBe(summary);}
  expect(()=>parseUnreadSummary(JSON.stringify({summary:Array(121).fill('news').join(' ')}))).toThrow('not concise enough');
});
