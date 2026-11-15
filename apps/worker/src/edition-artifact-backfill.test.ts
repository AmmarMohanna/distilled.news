import {afterAll,beforeAll,expect,it} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {createApp} from './app';
import {D1Repository} from './repository';
import type {Env} from './types';
import {backfillEditionArtifacts,editionArtifactBackfillEnabled} from './edition-artifact-backfill';
import {feedReadVersion} from './feed-read-cache';
import {seedQaShape,editionIdFor,feedId,feedSlug,OWNER,type QaShape} from './perf/qa-shape';

const SHAPE:QaShape={feeds:2,heavyJobs:10,jobsPerFeed:5,editionsHeavy:7,editionsPerFeed:2,citationsPerEdition:2,requestsPerFeed:2,pollsPerSource:1};
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>;
const objects=new Map<string,Uint8Array>();
const bucket={
 put:async(key:string,value:Uint8Array)=>{if(objects.has(key))return null;objects.set(key,value);return {key};},
 get:async(key:string)=>{const data=objects.get(key);return data?{size:data.length,arrayBuffer:async()=>data.slice().buffer}:null;},
 delete:async(key:string)=>{objects.delete(key);}
} as unknown as R2Bucket;
const env=(extra:Partial<Env>={})=>({DB:ctx.db,RAW_ARCHIVE:bucket,ADMIN_SESSION_SECRET:'backfill-secret',PRODUCT_FEEDS_ENABLED:'true',BRIEFING_ENGINE:'v3',
 EDITION_ARTIFACTS_ENABLED:'true',EDITION_ARTIFACT_BACKFILL_ENABLED:'true',...extra}) as unknown as Env;
beforeAll(async()=>{ctx=await createIntakeDatabase({product:true});await seedQaShape(ctx.db,SHAPE);});
afterAll(async()=>{await ctx?.dispose();});

it('is off unless both artifact flags are on',()=>{
 expect(editionArtifactBackfillEnabled(env())).toBe(true);
 expect(editionArtifactBackfillEnabled(env({EDITION_ARTIFACTS_ENABLED:'false'}))).toBe(false);
 expect(editionArtifactBackfillEnabled(env({EDITION_ARTIFACT_BACKFILL_ENABLED:undefined}))).toBe(false);
});

it('attaches verified copies newest first, a bounded batch per run, and resumes',async()=>{
 const legacy=await (await createApp({repository:new D1Repository(ctx.db)}).request(`/api/feed/${OWNER}/${feedSlug(0)}`,{},env({EDITION_ARTIFACTS_ENABLED:'false'}))).json();
 const before=await feedReadVersion(ctx.db,feedId(0));
 const first=await backfillEditionArtifacts(env(),{maxAttached:3});
 expect(first.attached).toBe(3);
 const attached=(await ctx.db.prepare('SELECT edition_id FROM v1_edition_delivery ORDER BY created_at DESC').all<{edition_id:string}>()).results.map(r=>r.edition_id);
 expect(attached).toEqual([editionIdFor(0,6),editionIdFor(0,5),editionIdFor(0,4)]);
 expect(await feedReadVersion(ctx.db,feedId(0))).toBeGreaterThan(before);
 let total=3;for(let i=0;i<5;i++)total+=(await backfillEditionArtifacts(env(),{maxAttached:3})).attached;
 expect(total).toBe(SHAPE.editionsHeavy+SHAPE.editionsPerFeed);
 expect((await backfillEditionArtifacts(env())).candidates).toBe(0);
 // Readers get the same feed from R2 as they did from D1.
 const fromArchive=await (await createApp({repository:new D1Repository(ctx.db)}).request(`/api/feed/${OWNER}/${feedSlug(0)}`,{},env())).json();
 expect(fromArchive).toEqual(legacy);
 const detail=await createApp({repository:new D1Repository(ctx.db)}).request(`/api/feed/${OWNER}/${feedSlug(0)}/editions/${editionIdFor(0,6)}`,{},env());
 expect(((await detail.json()) as {edition:{id:string}}).edition.id).toBe(editionIdFor(0,6));
});

it('never attaches a copy to an edition withdrawn before the attach',async()=>{
 const id=editionIdFor(1,1);
 await ctx.db.prepare("DELETE FROM v1_edition_delivery WHERE edition_id=?").bind(id).run();
 await ctx.db.prepare("DELETE FROM v1_verified_archives WHERE record_id=?").bind(id).run();
 await ctx.db.prepare("UPDATE v1_feed_documents SET json=json_set(json,'$.status','WITHDRAWN') WHERE kind='publication_status' AND id=?").bind(id).run();
 expect((await backfillEditionArtifacts(env())).attached).toBe(0);
 expect(await ctx.db.prepare('SELECT 1 FROM v1_edition_delivery WHERE edition_id=?').bind(id).first()).toBeNull();
});
