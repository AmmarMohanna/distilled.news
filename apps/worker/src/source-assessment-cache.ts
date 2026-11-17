import {sha256} from '@distilled/contracts';
import type {Env} from './types';
import type {SourceAssessment} from './source-assessment';

const PREFIX='source-assessment-cache/v1/';
const TTL_MS=10*60_000;
type Context={title:string;description:string};
async function key(env:Env,owner:string,context:Context,input:string){
 return PREFIX+await sha256(JSON.stringify({policy:'own-publisher-evidence-v4',owner,context,input,model:env.SOURCE_ASSESSMENT_MODEL??env.DISTILLED_JEV_MODEL,
  enabled:env.SOURCE_CONNECTORS_ENABLED,native:env.SOURCE_NATIVE_EXECUTION_ENABLED,paid:env.SOURCE_PAID_VERIFICATION_ENABLED,
  apify:!!env.APIFY_API_TOKEN,twitter:!!env.TWITTERAPI_IO_API_KEY,execution:!!env.SOURCE_EXECUTION_TOKEN&&!!env.SOURCE_EXECUTION_SERVICE,
  google:env.SOURCE_RECOMMENDATIONS_GOOGLE_NEWS,providers:env.SOURCE_PROVIDER_BUDGETS_JSON}))+'.json';
}

/** Reuse the same verified evidence when a user saves the recommendations they
 * just selected. Exact owner, interests, input and routing must match. This is
 * a short-lived assessment receipt, never collection authority or a paid retry. */
export async function cachedSourceAssessment(env:Env,owner:string|undefined,context:Context,input:string,now=Date.now(),minimumValidityMs=0):Promise<SourceAssessment|undefined>{
 if(!owner||!env.RAW_ARCHIVE)return undefined;
 try{
  const object=await env.RAW_ARCHIVE.get(await key(env,owner,context,input));
  if(!object)return undefined;
  const value=await object.json<{expiresAt:number;assessment:SourceAssessment}>();
  const assessment=value.assessment;
  if(!Number.isFinite(value.expiresAt)||value.expiresAt<=now+minimumValidityMs||value.expiresAt>now+TTL_MS||assessment.input!==input||assessment.status!=='accepted'||!assessment.evidenceQuote||!assessment.evidenceUrl)return undefined;
  return assessment;
 }catch{return undefined;}
}
export async function rememberSourceAssessment(env:Env,owner:string|undefined,context:Context,assessment:SourceAssessment){
 if(!owner||!env.RAW_ARCHIVE||assessment.status!=='accepted'||!assessment.evidenceQuote||!assessment.evidenceUrl)return;
 const checkedAt=Date.parse(assessment.checkedAt);if(!Number.isFinite(checkedAt))return;
 try{await env.RAW_ARCHIVE.put(await key(env,owner,context,assessment.input),JSON.stringify({expiresAt:checkedAt+TTL_MS,assessment}),
  {httpMetadata:{contentType:'application/json'},customMetadata:{expiresAt:String(checkedAt+TTL_MS)}});}catch{/* Cache failure must not change the assessment. */}
}
/** Separate namespace; no retained articles, published evidence or financial
 * records are eligible. A bounded sweep can run with normal maintenance. */
export async function expireSourceAssessments(bucket:R2Bucket,now=Date.now(),cursor?:string){
 const page=await bucket.list({prefix:PREFIX,limit:100,...(cursor?{cursor}:{})});
 const expired=page.objects.filter(object=>object.uploaded.getTime()+TTL_MS<=now).map(object=>object.key);
 if(expired.length)await bucket.delete(expired);
 return {expired:expired.length,cursor:page.truncated?page.cursor:undefined};
}
