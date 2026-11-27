import {readFileSync} from 'node:fs';
import {Miniflare} from 'miniflare';
import {afterAll,beforeAll,beforeEach,expect,it,vi} from 'vitest';
import {BriefingModelError,DEFAULT_PRICES,type ModelPort} from '@distilled/briefing';
import type {BriefingEdition} from '@distilled/core';
import {V3SpendGuard} from './v3-spend';
import {generateCatchUpSummary,parseCatchUpSummary,prepareCatchUpSummary,CatchUpSummaryResourceWait,summaryTokenUpperBound,catchUpSummaryRequest} from './catch-up-summary';
import {migrationStatements} from './test-migrations';
import {presentProductEditions,type PublishedProductEditionRecord} from './product-feeds';
import type {BriefingConfig} from '@distilled/core';

let mf:Miniflare,db:D1Database;
const now=Date.parse('2026-10-26T12:00:00Z');
const since=new Date(now-86_400_000).toISOString();
const edition=(id:string,hours:number,text='Officials announced a new electricity schedule.'):BriefingEdition=>{
  const at=new Date(now-hours*3600000).toISOString();
  return {id,briefingId:'feed',title:'News',cadence:'hourly',status:'published',publishedAt:at,
    windowStart:at,windowEnd:at,createdAt:at,updatedAt:at,summary:text,sections:[{title:'',summary:text,evidence:[]}]};
};
const input=()=>prepareCatchUpSummary([edition('one',1)],'en',since,now);
const result=(text:string,storyIds=['one:section:0'])=>JSON.stringify({sentences:[{text,storyIds}]});
const response={text:result('Officials announced a new electricity schedule.'),inputTokens:100,outputTokens:20,costUsd:.0001};
const port=()=>({complete:vi.fn(async()=>response)});
const run=(p:ModelPort,accountId='reader',data=input())=>generateCatchUpSummary({db,accountId,feedId:'feed',input:data,port:p,guard:new V3SpendGuard(db,{dailyUsd:1,runUsd:.1}),prices:DEFAULT_PRICES,now});
beforeAll(async()=>{
  mf=new Miniflare({modules:true,script:"export default {fetch(){return new Response('ok')}}",d1Databases:['DB']});
  db=await mf.getD1Database('DB') as unknown as D1Database;
  await db.exec('CREATE TABLE unread_summary_cache (kind TEXT,id TEXT,feed_id TEXT,json TEXT,PRIMARY KEY(kind,id))');
  const sql=readFileSync(new URL('../migrations/0067_v3_model_spend.sql',import.meta.url),'utf8');
  await db.batch(migrationStatements(sql).map(s=>db.prepare(s)));
});
afterAll(async()=>mf.dispose());
beforeEach(async()=>{await db.exec('DELETE FROM unread_summary_cache');await db.exec('DELETE FROM v3_model_spend');});

it('uses published time, excludes old, withdrawn and future briefings and keeps chronological context',()=>{
  const withdrawn={...edition('withdrawn',1),status:'empty' as const};
  expect(prepareCatchUpSummary([edition('old',25),edition('future',-1),withdrawn,edition('new',0),edition('earlier',2)],'en',since,now).briefings.map(b=>b.id)).toEqual(['earlier','new']);
});
it('bounds multilingual input without cutting a briefing or its qualifiers',()=>{
  const text='قال المسؤول إن الخطة قد تبدأ إذا تمت الموافقة. '.repeat(500);
  expect(()=>prepareCatchUpSummary([edition('huge',1,text),edition('small',2)],'ar',since,now)).toThrow('too long');
  const data=prepareCatchUpSummary([edition('small',1,'A short supported fact.'),edition('huge',2,text),edition('older',3)],'ar',since,now);
  expect(data.briefings.map(b=>b.id)).toEqual(['small']);
  const req=catchUpSummaryRequest(data);expect(summaryTokenUpperBound(req)).toBeGreaterThan(req.user.length);
});
it.each([1,7000])('keeps published prose and correction links while excluding source excerpts of any size (%i)',repeat=>{
  const old=edition('old',2,'The port authority expected a reopening at noon.');
  const corrected=edition('corrected',1,'The port authority now estimates a reopening at 18:00 if inspections finish.');
  const published=[{...corrected.sections[0],storyId:'corrected:port',relation:'correction' as const,updatesId:'old:section:0',
    evidence:[{messageId:'r1',sourceId:'r1',sourceTitle:'Port authority',sourceType:'channel' as const,postedAt:corrected.publishedAt,
      text:'Source document. '.repeat(repeat),links:[],media:[]}]},
    {...corrected.sections[0],storyId:'corrected:other',summary:'Runway closures are scheduled in December.'}];
  const data=prepareCatchUpSummary([{...corrected,sections:published},old],'en',since,now);
  expect(data.briefings.map(b=>b.id)).toEqual(['old','corrected']);
  expect(data.briefings[1].stories.map(s=>s.summary)).toEqual(published.map(s=>s.summary));
  expect(data.briefings[1].stories[0]).toMatchObject({id:'corrected:port',relation:'correction',updatesId:'old:section:0',sources:[{source:'Port authority'}]});
  expect(data.briefings[1].stories[0].sources).toEqual([{source:'Port authority'}]);
  expect(catchUpSummaryRequest(data).user).not.toContain('Source document.');
  expect(()=>parseCatchUpSummary(result('Reopening at noon.',['old:section:0']),data)).toThrow();
});
it('does not invoke a model for an empty history window',async()=>{
  const p=port();expect(await run(p,'reader',{language:'en',briefings:[]})).toEqual({status:'empty'});expect(p.complete).not.toHaveBeenCalled();
});
it('reuses paid results and changes identity when the evidence, language or reader changes',async()=>{
  const p=port();expect(await run(p)).toEqual({status:'ready',summary:'Officials announced a new electricity schedule.'});
  await run(p);expect(p.complete).toHaveBeenCalledOnce();
  await run(p,'another-reader');await run(p,'reader',{...input(),language:'ar'});
  await run(p,'reader',prepareCatchUpSummary([edition('one',1,'The utility corrected the schedule.')],'en',since,now));
  expect(p.complete).toHaveBeenCalledTimes(4);
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

it('requires a complete response within the word limit',()=>{
  const summary=Array(80).fill('news').join(' ');
  expect(parseCatchUpSummary(result(summary),input())).toBe(summary);
  expect(()=>parseCatchUpSummary(result(summary+' news'),input())).toThrow('too long to show');
  expect(()=>parseCatchUpSummary(result(summary),input(),'length')).toThrow('incomplete');
  expect(()=>parseCatchUpSummary(JSON.stringify({summary,other:'unexpected'}),input())).toThrow('incomplete');
});

it.each([
  ['en','The utility said power could return at 8 p.m.','The utility revised its estimate to after 10 p.m., subject to testing.','The water authority said water service might resume at 8 p.m.'],
  ['ar','قالت شركة الكهرباء إن التيار قد يعود عند الثامنة مساءً.','صححت شركة الكهرباء تقديرها إلى ما بعد العاشرة مساءً، رهن نجاح الاختبارات.','قالت هيئة المياه إن الخدمة قد تعود عند الثامنة مساءً.'],
  ['fr','La compagnie a estimé que le courant pourrait revenir à 20 h.','La compagnie a repoussé son estimation après 22 h, sous réserve des essais.','Le service des eaux a annoncé une reprise possible à 20 h.']
] as const)('keeps product story identities and validates correction references in %s',(language,original,corrected,separate)=>{
  const record=(id:string,hours:number,text:string,updatesId?:string):PublishedProductEditionRecord=>{
    const at=new Date(now-hours*3600000).toISOString();
    return {id,feedId:'feed',title:'News',language,windowStart:at,windowEnd:at,createdAt:at,publishedAt:at,citations:[],
      stories:[{candidateId:`${id}:0`,claims:[{id:`${id}:claim`,text,support:[]}],
        relation:updatesId?'correction':'new',updatesId}]};
  };
  const originalId='edition-1:edition-1:0', correctionId='edition-2:edition-2:0', separateId='edition-3:edition-3:0';
  const report=record('edition-1',3,original);
  const correction=record('edition-2',1,corrected,originalId);
  const water=record('edition-3',2,separate);
  const repeated=record('edition-4',2.5,original);
  const data=prepareCatchUpSummary(presentProductEditions({id:'feed',briefingCadence:'hourly'} as BriefingConfig,
    [correction,report,water,repeated]),language,since,now);
  expect(data.briefings.flatMap(briefing=>briefing.stories.map(story=>story.id))).toEqual([originalId,'edition-4:edition-4:0',separateId,correctionId]);
  expect(data.briefings[3].stories[0]).toMatchObject({relation:'correction',updatesId:originalId,summary:corrected});
  const response=JSON.stringify({sentences:[{text:corrected,storyIds:[correctionId]},{text:separate,storyIds:[separateId]}]});
  expect(parseCatchUpSummary(response,data)).toBe(`${corrected} ${separate}`);
  expect(()=>parseCatchUpSummary(result(original,[originalId]),data)).toThrow('incomplete');
  expect(()=>parseCatchUpSummary(result(original,['edition-4:edition-4:0']),data)).toThrow('incomplete');
  expect(()=>parseCatchUpSummary(result(original,['edition-1']),data)).toThrow('incomplete');
  expect(catchUpSummaryRequest(data).system).toContain('Never present an allegation, estimate, proposal, denial or forecast as a confirmed fact.');
});

it('reports provider capacity as pending without retaining a failed cache claim or spending',async()=>{
  const busy={complete:vi.fn(async()=>{throw new CatchUpSummaryResourceWait();})};
  expect(await generateCatchUpSummary({db,accountId:'reader',feedId:'feed',input:input(),port:busy,now})).toEqual({status:'pending'});
  expect(await db.prepare('SELECT id FROM unread_summary_cache').first()).toBeNull();
  expect(await db.prepare('SELECT id FROM v3_model_spend').first()).toBeNull();
  const available=port();expect(await run(available)).toMatchObject({status:'ready'});expect(available.complete).toHaveBeenCalledOnce();
});

it('explains retained overlong output on repeated reads without sending another paid request',async()=>{
 const p={complete:vi.fn(async()=>({...response,text:result(Array(178).fill('news').join(' '))}))};
 for(let i=0;i<2;i++)await expect(run(p)).rejects.toMatchObject({code:'SUMMARY_TOO_LONG'});
 expect(p.complete).toHaveBeenCalledOnce();
 expect(await db.prepare('SELECT state FROM v3_model_spend').first()).toMatchObject({state:'settled'});
});
it('distinguishes unconfirmed outcomes from malformed known output',()=>{
 for(const text of ['null','not JSON','{}'])expect(()=>parseCatchUpSummary(text,input())).toThrow('summary was incomplete');
});
