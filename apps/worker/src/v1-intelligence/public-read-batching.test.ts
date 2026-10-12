import {afterAll,beforeAll,expect,it} from 'vitest';
import {createIntakeDatabase} from '../v1-intake/test-utils';
import {publicV1Edition,publicV1Evidence} from './public-read';
import {publishedProductEditions} from '../product-feeds';
import type {BriefingConfig} from '@distilled/core';
import type {Env} from '../types';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>;
const feed={id:'reader-feed',title:'Current title',briefingCadence:'daily'} as BriefingConfig;
let queries=0;
const measured=()=>new Proxy(ctx.db,{get(target,key){if(key==='prepare')return (sql:string)=>{queries++;return target.prepare(sql)};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value}});
async function document(kind:string,id:string,feedId:string,value:unknown){await ctx.db.prepare('INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES(?,?,?,?)').bind(kind,id,feedId,JSON.stringify(value)).run()}
function edition(id:string,revisionIds:string[],feedRevision=1){return {id,feedId:feed.id,feedRevision,language:'en',windowStart:'2026-10-11T00:00:00Z',windowEnd:'2026-10-11T02:00:00Z',createdAt:'2026-10-11T02:01:00Z',evidenceRevisionIds:revisionIds,stories:[{candidateId:'story-'+id,claims:revisionIds.map((revisionId,i)=>({id:'claim-'+id+'-'+i,text:'Supported fact '+i+'.',support:[{evidenceRevisionId:revisionId,quote:'Supported fact '+i+'.'}]}))}]}}
async function publish(id:string,revisionIds:string[],feedRevision=1,status='PUBLISHED'){const value=edition(id,revisionIds,feedRevision);await document('editions',id,feed.id,value);await document('publication_status',id,feed.id,{id,status,publishedAt:value.createdAt});return value}
beforeAll(async()=>{
 ctx=await createIntakeDatabase();
 for(const id of [feed.id,'other-feed'])await ctx.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind(id,JSON.stringify({id,title:'Current title',revision:2})).run();
 await ctx.db.prepare('INSERT INTO v1_feed_versions(id,feed_id,revision,json) VALUES(?,?,?,?)').bind('reader-feed:1',feed.id,1,JSON.stringify({title:'Historical title'})).run();
 for(const [id,feedId] of [['reader-source',feed.id],['other-source','other-feed']])await ctx.db.prepare('INSERT INTO v1_intake_scopes(id,feed_id,source_id,json) VALUES(?,?,?,?)').bind(id,feedId,id,JSON.stringify({feedId,sourceId:id})).run();
 const writes:D1PreparedStatement[]=[];
 for(let i=0;i<19;i++)for(let j=0;j<2;j++){
  const id=`revision-${i}-${j}`,observationId=`observation-${i}-${j}`;
  const revision={id,feedId:feed.id,evidenceId:id,revision:1,sourceObservationId:observationId,title:`Source ${i}-${j}`,body:'Supported fact '+j+'.',canonicalUrl:`https://source${j}.example/article-${i}`,publishedAt:'2026-10-10T12:00:00Z'};
  const observation={observation:{feedId:feed.id,publisherId:'publisher-'+j,sourceId:'reader-source'}};
  writes.push(ctx.db.prepare('INSERT INTO v1_revisions(id,feed_source_id,json) VALUES(?,?,?)').bind(id,'reader-source',JSON.stringify(revision)),ctx.db.prepare('INSERT INTO v1_inputs(id,feed_source_id,json) VALUES(?,?,?)').bind(observationId,'reader-source',JSON.stringify(observation)));
 }
 await ctx.db.batch(writes);
 for(let i=0;i<19;i++){const id=`edition-${String(i).padStart(2,'0')}`,value=edition(id,[`revision-${i}-0`,`revision-${i}-1`]);value.createdAt=new Date(Date.UTC(2026,9,11,2,i)).toISOString();await document('editions',id,feed.id,value);await document('publication_status',id,feed.id,{id,status:'PUBLISHED',publishedAt:value.createdAt})}
},60000);
afterAll(async()=>{await ctx?.dispose()});
it('retrieves nineteen editions with bounded queries and exact original citations',async()=>{
 queries=0;const start=performance.now();const result=await publishedProductEditions({DB:measured()} as Env,feed);
 console.log(JSON.stringify({benchmark:'19 editions / 38 citations',queries,elapsedMs:Math.round(performance.now()-start)}));
 expect(result).toHaveLength(19);expect(result.map(e=>e.id)).toEqual(Array.from({length:19},(_,i)=>`edition-${String(18-i).padStart(2,'0')}`));
 expect(result[0].title).toBe('Historical title');expect(result[0].sections[0].evidence.map(e=>e.sourceUrl)).toEqual(['https://source0.example/article-18','https://source1.example/article-18']);
 expect(queries).toBeLessThanOrEqual(12);
},60000);
it('single-edition and evidence reads use historical configuration and exact retained evidence',async()=>{
 const result=await publicV1Edition(ctx.db,'edition-18');expect(result?.title).toBe('Historical title');expect(result?.citations.map(c=>c.publisherId)).toEqual(['publisher-0','publisher-1']);
 expect(await publicV1Evidence(ctx.db,'edition-18','revision-18-0')).toMatchObject({id:'revision-18-0',text:'Supported fact 0.',url:'https://source0.example/article-18'});
 expect(await publicV1Evidence(ctx.db,'edition-18','revision-17-0')).toBeUndefined();
});
it('withdrawn, uncommitted and another feed editions are not visible',async()=>{
 await publish('withdrawn',['revision-18-0'],1,'WITHDRAWN');await document('editions','uncommitted',feed.id,edition('uncommitted',['revision-18-0']));
 expect(await publicV1Edition(ctx.db,'withdrawn')).toBeUndefined();expect(await publicV1Edition(ctx.db,'uncommitted')).toBeUndefined();
 expect((await publishedProductEditions({DB:ctx.db} as Env,feed)).map(e=>e.id)).not.toContain('withdrawn');
 expect(await publishedProductEditions({DB:ctx.db} as Env,{...feed,id:'other-feed'},'edition-18')).toEqual([]);
});
it('bounded batches cover one hundred editions without losing facts or citation order',async()=>{
 const id='growth-feed';await ctx.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind(id,JSON.stringify({id,title:'Growth title',revision:1})).run();
 await ctx.db.prepare('INSERT INTO v1_intake_scopes(id,feed_id,source_id,json) VALUES(?,?,?,?)').bind('growth-source',id,'growth-source',JSON.stringify({feedId:id})).run();
 const writes:D1PreparedStatement[]=[];
 for(let i=0;i<100;i++){
  const evidenceIds=[];
  for(let j=0;j<2;j++){
   const evidenceId=`growth-revision-${i}-${j}`,observationId=`growth-observation-${i}-${j}`;evidenceIds.push(evidenceId);
   writes.push(ctx.db.prepare('INSERT INTO v1_revisions(id,feed_source_id,json) VALUES(?,?,?)').bind(evidenceId,'growth-source',JSON.stringify({id:evidenceId,feedId:id,evidenceId,revision:1,sourceObservationId:observationId,canonicalUrl:`https://growth.example/${i}/${j}`})),ctx.db.prepare('INSERT INTO v1_inputs(id,feed_source_id,json) VALUES(?,?,?)').bind(observationId,'growth-source',JSON.stringify({observation:{feedId:id,sourceId:'growth-source'}})));
  }
  const editionId=`growth-edition-${String(i).padStart(3,'0')}`,value={...edition(editionId,evidenceIds),feedId:id,createdAt:new Date(Date.UTC(2026,9,11,2,i)).toISOString()};
  writes.push(ctx.db.prepare('INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES(?,?,?,?)').bind('editions',editionId,id,JSON.stringify(value)),ctx.db.prepare('INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES(?,?,?,?)').bind('publication_status',editionId,id,JSON.stringify({id:editionId,status:'PUBLISHED',publishedAt:value.createdAt})));
 }
 for(let i=0;i<writes.length;i+=50)await ctx.db.batch(writes.slice(i,i+50));
 queries=0;const result=await publishedProductEditions({DB:measured()} as Env,{...feed,id});
 expect(result).toHaveLength(100);expect(result[0].id).toBe('growth-edition-099');expect(result[99].id).toBe('growth-edition-000');
 expect(result.flatMap(row=>row.sections[0].evidence)).toHaveLength(200);expect(queries).toBe(6);
},60000);
it('a withdrawal during evidence retrieval is rechecked before returning prose',async()=>{
 await publish('withdrawal-race',['revision-18-0']);let withdrawn=false;
 const db=new Proxy(ctx.db,{get(target,key){if(key==='batch')return async(statements:D1PreparedStatement[])=>{
  if(!withdrawn){withdrawn=true;await ctx.db.prepare("UPDATE v1_feed_documents SET json=? WHERE kind='publication_status' AND id='withdrawal-race'").bind(JSON.stringify({id:'withdrawal-race',status:'WITHDRAWN'})).run()}
  return target.batch(statements);
 };const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value}});
 expect(await publicV1Edition(db,'withdrawal-race')).toBeUndefined();
 expect(await ctx.db.prepare("SELECT id FROM v1_feed_documents WHERE kind='editions' AND id='withdrawal-race'").first()).not.toBeNull();
});
it('missing observation and out-of-edition claim references fail closed',async()=>{
 await ctx.db.prepare('INSERT INTO v1_revisions(id,feed_source_id,json) VALUES(?,?,?)').bind('missing-observation','reader-source',JSON.stringify({id:'missing-observation',feedId:feed.id,sourceObservationId:'not-retained'})).run();
 await publish('missing-observation-edition',['missing-observation']);await expect(publicV1Edition(ctx.db,'missing-observation-edition')).rejects.toMatchObject({code:'SCOPE_DENIED'});
 const bad=edition('invalid-claim-reference',['revision-18-0']);bad.stories[0].claims[0].support[0].evidenceRevisionId='revision-17-0';await document('editions',bad.id,feed.id,bad);await document('publication_status',bad.id,feed.id,{id:bad.id,status:'PUBLISHED'});
 await expect(publicV1Edition(ctx.db,bad.id)).rejects.toMatchObject({code:'SCOPE_DENIED'});
});
it('a published edition without historical configuration still fails closed',async()=>{
 await publish('missing-configuration',['revision-18-0'],99);await expect(publicV1Edition(ctx.db,'missing-configuration')).rejects.toMatchObject({code:'SCOPE_DENIED'});
});
it('missing evidence still fails closed',async()=>{
 await publish('missing-evidence',['does-not-exist']);await expect(publicV1Edition(ctx.db,'missing-evidence')).rejects.toMatchObject({code:'SCOPE_DENIED'});
});
it('evidence from another feed cannot supply citations',async()=>{
 await ctx.db.prepare('INSERT INTO v1_revisions(id,feed_source_id,json) VALUES(?,?,?)').bind('foreign-revision','other-source',JSON.stringify({id:'foreign-revision',feedId:'other-feed',sourceObservationId:'foreign-observation'})).run();
 await publish('foreign-evidence',['foreign-revision']);await expect(publicV1Edition(ctx.db,'foreign-evidence')).rejects.toMatchObject({code:'SCOPE_DENIED'});
});
it('observation feed identity cannot cross the edition boundary',async()=>{
 await ctx.db.prepare('INSERT INTO v1_inputs(id,feed_source_id,json) VALUES(?,?,?)').bind('foreign-observation','other-source',JSON.stringify({observation:{feedId:'other-feed',sourceId:'other-source'}})).run();
 await ctx.db.prepare('INSERT INTO v1_revisions(id,feed_source_id,json) VALUES(?,?,?)').bind('bad-observation','reader-source',JSON.stringify({id:'bad-observation',feedId:feed.id,sourceObservationId:'foreign-observation'})).run();
 await publish('foreign-observation-edition',['bad-observation']);await expect(publicV1Edition(ctx.db,'foreign-observation-edition')).rejects.toMatchObject({code:'SCOPE_DENIED'});
});
it('publication status from another feed cannot authorize an edition',async()=>{
 await document('editions','foreign-status',feed.id,edition('foreign-status',[]));await document('publication_status','foreign-status','other-feed',{id:'foreign-status',status:'PUBLISHED'});
 await expect(publicV1Edition(ctx.db,'foreign-status')).rejects.toMatchObject({code:'SCOPE_DENIED'});
});
