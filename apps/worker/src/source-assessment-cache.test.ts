import {expect,it,vi} from 'vitest';
import {cachedSourceAssessment,rememberSourceAssessment,expireSourceAssessments} from './source-assessment-cache';
import {assessSources} from './source-assessment';
import type {Env} from './types';

function fixture(){
 const objects=new Map<string,{body:string;metadata:Record<string,string>}>();
 const bucket={put:vi.fn(async(key:string,body:string,options:{customMetadata:Record<string,string>})=>{objects.set(key,{body,metadata:options.customMetadata});}),
  get:vi.fn(async(key:string)=>{const item=objects.get(key);return item?{json:async()=>JSON.parse(item.body)}:null;}),
  list:vi.fn(async()=>({objects:[...objects].map(([key,item])=>({key,uploaded:new Date(JSON.parse(item.body).assessment.checkedAt)}))})),
  delete:vi.fn(async(keys:string[])=>{keys.forEach(key=>objects.delete(key));})};
 return {objects,bucket,env:{RAW_ARCHIVE:bucket,SOURCE_CONNECTORS_ENABLED:'true',SOURCE_ASSESSMENT_MODEL:'openai/gpt-4.1-mini'} as unknown as Env};
}
const context={title:'Solar energy',description:'Solar photovoltaic technology and solar energy policy'};
const assessment={input:'rss: https://publisher.example/feed/',status:'accepted' as const,reason:'Fetched solar industry article matches.',checkedAt:new Date().toISOString(),evidenceQuote:'Solar photovoltaic industry expands with new projects.',evidenceUrl:'https://publisher.example/feed/'};
it('saves the same verified evidence without a second contradictory model or paid collector call',async()=>{
 const {env}=fixture();await rememberSourceAssessment(env,'owner',context,assessment);
 const fetcher=vi.fn<typeof fetch>(()=>{throw Error('Should reuse the checked evidence');});
 expect(await assessSources(env,context,[assessment.input],fetcher,{ownerAccountId:'owner'})).toEqual([assessment]);
 expect(fetcher).not.toHaveBeenCalled();
});
it('never shares receipts between owners, interests, sources or model configurations',async()=>{
 const {env}=fixture();await rememberSourceAssessment(env,'owner',context,assessment);
 for(const [owner,interest,input,configuration] of [
  ['other',context,assessment.input,env],['owner',{...context,description:'Wind energy'},assessment.input,env],
  ['owner',context,'rss: https://other.example/feed/',env],['owner',context,assessment.input,{...env,SOURCE_ASSESSMENT_MODEL:'other'}],
  ['owner',context,assessment.input,{...env,SOURCE_CONNECTORS_ENABLED:'false'}],
  ['owner',context,assessment.input,{...env,TWITTERAPI_IO_API_KEY:'test-twitter-key'}]
 ] as const)expect(await cachedSourceAssessment(configuration,owner,interest,input)).toBeUndefined();
});
it('expires receipts and deletes only its own expired cache objects',async()=>{
 const {env,bucket,objects}=fixture();await rememberSourceAssessment(env,'owner',context,assessment);
 const expired=Date.parse(assessment.checkedAt)+10*60_000;
 expect(await cachedSourceAssessment(env,'owner',context,assessment.input,expired)).toBeUndefined();
 expect(await expireSourceAssessments(env.RAW_ARCHIVE,expired)).toEqual({expired:1,cursor:undefined});
 expect(bucket.list).toHaveBeenCalledWith({prefix:'source-assessment-cache/v1/',limit:100});
 expect(objects.size).toBe(0);
});
it('does not offer a nearly expired receipt as a new recommendation',async()=>{
 const {env}=fixture();await rememberSourceAssessment(env,'owner',context,assessment);
 const later=Date.parse(assessment.checkedAt)+6*60_000;
 expect(await cachedSourceAssessment(env,'owner',context,assessment.input,later,5*60_000)).toBeUndefined();
 expect(await cachedSourceAssessment(env,'owner',context,assessment.input,later)).toEqual(assessment);
});
it('does not turn rejected, unverified or evidence-free results into receipts',async()=>{
 const {env,bucket}=fixture();
 for(const status of ['rejected','unverified','unavailable'] as const)await rememberSourceAssessment(env,'owner',context,{...assessment,status});
 await rememberSourceAssessment(env,'owner',context,{...assessment,evidenceQuote:undefined});
 expect(bucket.put).not.toHaveBeenCalled();
});
it('fails closed when a stored receipt has missing or invalid expiration',async()=>{
 const {env,objects}=fixture();await rememberSourceAssessment(env,'owner',context,assessment);
 for(const expiresAt of [undefined,null,'tomorrow']){
  const object=[...objects.values()][0];object.body=JSON.stringify({assessment,expiresAt});
  expect(await cachedSourceAssessment(env,'owner',context,assessment.input)).toBeUndefined();
 }
});
it('advances a bounded cleanup cursor even when a page contains fresh receipts',async()=>{
 const {env,bucket}=fixture();
 vi.mocked(bucket.list).mockResolvedValueOnce({objects:[],truncated:true,cursor:'next-page'} as never);
 expect(await expireSourceAssessments(env.RAW_ARCHIVE,Date.now(),'previous-page')).toEqual({expired:0,cursor:'next-page'});
 expect(bucket.list).toHaveBeenCalledWith({prefix:'source-assessment-cache/v1/',limit:100,cursor:'previous-page'});
 expect(bucket.delete).not.toHaveBeenCalled();
});
