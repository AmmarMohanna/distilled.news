/** Deterministic, QA-shaped dataset for read-path profiling. The proportions
 * mirror the Sources-QA canary deployment on 2026-11-15: 20 product feeds, one
 * feed with a large retained RSS backlog, a rolling 30-minute request history
 * and five-minute poll history. No content is fetched or generated. */
import {D1Repository} from '../repository';

export interface QaShape {feeds:number;heavyJobs:number;jobsPerFeed:number;editionsHeavy:number;editionsPerFeed:number;citationsPerEdition:number;requestsPerFeed:number;pollsPerSource:number}
export const QA_SHAPE:QaShape={feeds:20,heavyJobs:1500,jobsPerFeed:60,editionsHeavy:100,editionsPerFeed:12,citationsPerEdition:4,requestsPerFeed:48,pollsPerSource:260};

const at=(minutes:number)=>new Date(Date.UTC(2026,10,14,10,30)+minutes*60_000).toISOString();
export const OWNER='qa-owner';
export const feedId=(i:number)=>`qa_feed_${String(i).padStart(2,'0')}`;
export const feedSlug=(i:number)=>`qa-feed-${String(i).padStart(2,'0')}`;

async function chunked(db:D1Database,statements:D1PreparedStatement[]){for(let i=0;i<statements.length;i+=80)await db.batch(statements.slice(i,i+80));}

export async function seedQaShape(db:D1Database,shape:QaShape=QA_SHAPE){
 const repo=new D1Repository(db);
 const owner=await repo.createAccount({email:'qa-owner@example.invalid',username:OWNER,role:'user',passwordHash:'unused',emailVerifiedAt:at(0)});
 for(let f=0;f<shape.feeds;f++){
  const id=feedId(f),heavy=f===0,statements:D1PreparedStatement[]=[];
  await db.prepare(`INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,public_feed_enabled,created_at,updated_at,update_interval_minutes)
   VALUES(?,?,?,?,?,1,?,?,30)`).bind(id,owner.id,feedSlug(f),`QA feed ${f}`,'News',at(0),at(0)).run().catch(async()=>{
    await db.prepare(`INSERT INTO briefings(id,owner_account_id,slug,title,interest_profile,public_feed_enabled,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?)`)
     .bind(id,owner.id,feedSlug(f),`QA feed ${f}`,'News',at(0),at(0)).run();
   });
  const feed={id,ownerId:owner.id,title:`QA feed ${f}`,interests:['News'],geography:[],outputLanguage:'en',briefingFrequency:'HOURLY',paused:false,revision:1,createdAt:at(0),updatedAt:at(0)};
  // The v1_feed_version_insert trigger (0042) writes the matching version row.
  statements.push(db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind(id,JSON.stringify(feed)));
  const sources=heavy?2:1+(f%2);
  for(let s=0;s<sources;s++){
   const sourceId=`${id}::rss_${s}`,catalogId=`catalog_${f}_${s}`,url=`https://publisher${f}-${s}.example/rss.xml`;
   statements.push(
    db.prepare(`INSERT INTO sources(id,briefing_id,title,type,provider,kind,source_url,input,enabled,collection_owner,last_seen_at,created_at,updated_at)
     VALUES(?,?,?,'channel','rss','rss_feed',?,?,1,'connector',?,?,?)`).bind(sourceId,id,`Publisher ${f}-${s}`,url,`rss: ${url}`,at(0),at(0),at(0)),
    db.prepare('INSERT INTO v1_source_catalog(id,json) VALUES(?,?)').bind(catalogId,JSON.stringify({id:catalogId,type:'rss',displayName:`Publisher ${f}-${s}`,canonicalUrl:url})),
    db.prepare('INSERT INTO v1_intake_scopes(id,feed_id,source_id,json) VALUES(?,?,?,?)').bind(sourceId,id,catalogId,JSON.stringify({feedId:id,feedSourceId:sourceId,sourceId:catalogId,feedRevision:1,enabled:true,restrictions:{}})));
   for(let p=0;p<shape.pollsPerSource;p++){
    const request={scope:{feedId:id,feedSourceId:sourceId}};
    statements.push(db.prepare(`INSERT INTO connector_rss_poll_jobs(job_id,request,request_hash,due_at,state,scheduled_at) VALUES(?,?,?,?,?,?)`)
     .bind(`poll_${f}_${s}_${p}`,JSON.stringify(request),'hash',at(p*5),'DONE',at(p*5)));
   }
  }
  const jobs=heavy?shape.heavyJobs:shape.jobsPerFeed;
  for(let j=0;j<jobs;j++){
   const scope=`${id}::rss_${j%sources}`,observation=`${id}_obs_${j}`;
   const state=j%25===0?'FAILED':j<jobs*0.8?'DEFERRED':'DONE';
   statements.push(db.prepare('INSERT INTO v1_inputs(id,feed_source_id,item_key,json) VALUES(?,?,?,?)').bind(observation,scope,`item_${j}`,JSON.stringify({observation:{id:observation,feedId:id,feedSourceId:scope,observedAt:at(j%1200),publisherId:`publisher_${f}`,sourceId:scope}})),
    db.prepare('INSERT INTO v1_jobs(id,feed_source_id,item_key,json) VALUES(?,?,?,?)').bind(`${id}_acq_${j}`,scope,`item_${j}`,JSON.stringify({id:`${id}_acq_${j}`,kind:'ACQUIRE',state,observationId:observation,attempts:1})));
   if(state==='DONE')statements.push(db.prepare('INSERT INTO v1_jobs(id,feed_source_id,item_key,json) VALUES(?,?,?,?)').bind(`${id}_rev_${j}`,scope,`item_${j}`,JSON.stringify({id:`${id}_rev_${j}`,kind:'REASSESS',state:'DONE',observationId:observation,attempts:1})));
  }
  for(let r=0;r<shape.requestsPerFeed;r++){
   const end=at(25+r*30),pending=r===shape.requestsPerFeed-1;
   statements.push(db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('briefing_requests',?,?,?)").bind(`${id}_req_${r}`,id,JSON.stringify({
    id:`${id}_req_${r}`,feedId:id,engine:'v3',createdAt:end,state:pending?'PENDING':'DONE',...(pending?{reason:'AWAITING_SCHEDULED_DELIVERY'}:{result:r%3?'QUIET':'PUBLISHED'}),attempts:0,
    window:{start:at(r*30-5),end,kind:'30M',scheduledFor:at(30+r*30)},coverage:{state:'COMPLETE',pendingJobs:0,failedJobs:0,failures:[]}})));
  }
  const editions=heavy?shape.editionsHeavy:shape.editionsPerFeed;
  for(let e=0;e<editions;e++){
   const editionId=`${id}_ed_${String(e).padStart(3,'0')}`,refs:string[]=[];
   for(let c=0;c<shape.citationsPerEdition;c++){
    const scope=`${id}::rss_${c%sources}`,revision=`${editionId}_rev_${c}`,observation=`${editionId}_cobs_${c}`;refs.push(revision);
    statements.push(db.prepare('INSERT INTO v1_inputs(id,feed_source_id,item_key,json) VALUES(?,?,?,?)').bind(observation,scope,`cite_${e}_${c}`,JSON.stringify({observation:{feedId:id,publisherId:`publisher_${f}_${c}`,sourceId:scope,observedAt:at(e*30)}})),
     db.prepare('INSERT INTO v1_revisions(id,feed_source_id,item_key,json) VALUES(?,?,?,?)').bind(revision,scope,`cite_${e}_${c}`,JSON.stringify({id:revision,feedId:id,evidenceId:revision,revision:1,sourceObservationId:observation,title:`Article ${e}-${c}`,canonicalUrl:`https://publisher${f}.example/${e}/${c}`,publishedAt:at(e*30),body:'x'.repeat(2000)})));
   }
   const createdAt=at(30+e*30);
   const edition={id:editionId,feedId:id,feedRevision:1,language:'en',windowStart:at(e*30-5),windowEnd:at(25+e*30),createdAt,evidenceRevisionIds:refs,
    stories:[{candidateId:`story_${e}`,claims:refs.map((ref,i)=>({id:`claim_${e}_${i}`,text:`Supported development ${e}.${i} with enough prose to resemble a real paragraph of an edition.`,support:[{evidenceRevisionId:ref}]}))}]};
   statements.push(db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('editions',?,?,?)").bind(editionId,id,JSON.stringify(edition)),
    db.prepare("INSERT INTO v1_feed_documents(kind,id,feed_id,json) VALUES('publication_status',?,?,?)").bind(editionId,id,JSON.stringify({id:editionId,feedId:id,status:'PUBLISHED',publishedAt:createdAt})));
  }
  await chunked(db,statements);
 }
 return {owner};
}
