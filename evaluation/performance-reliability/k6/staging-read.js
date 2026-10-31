import http from 'k6/http';
import {check} from 'k6';
import exec from 'k6/execution';
import {sha256} from 'k6/crypto';
import {stagingConfiguration,campaignReports} from './staging-config.js';
const config=stagingConfiguration(__ENV);
export const options=config.options;
export default function(){
  const base='/api/feed/'+config.user+'/'+config.feed;
  const paths=config.profile==='authenticated-read'?['/api/auth/session','/api/me/briefings','/api/me/account',base]:['/','/api/explore/feeds',base,base+'/editions/'+config.edition,base];
  const i=exec.scenario.iterationInTest,index=i%paths.length,hash=sha256(config.runId+':'+i,'hex'),traceId=hash.slice(0,32);
  const response=http.get(config.origin+paths[index],{redirects:0,timeout:'5s',tags:{name:config.profile+'-'+index},headers:{Accept:index===0&&config.profile==='public-read'?'text/html':'application/json','X-Distilled-Campaign':config.runId,traceparent:'00-'+traceId+'-'+hash.slice(32,48)+'-01',...(config.profile==='authenticated-read'?{Cookie:__ENV.STAGING_SESSION_COOKIE}:{})}});
  let shape=response.status===200;
  if(shape&&!(index===0&&config.profile==='public-read')){try{const body=response.json();shape=body!==null&&typeof body==='object';if(paths[index]==='/api/auth/session')shape=body.account?.id===__ENV.ISOLATED_ACCOUNT_ID;}catch{shape=false;}}
  check(response,{'HTTP 200':r=>r.status===200,'expected authenticated/reader shape':()=>shape,'bounded body':r=>(r.body??'').length<2000000});
  console.log(JSON.stringify({schema:'distilled.campaign-correlation.v1',runId:config.runId,iteration:i,requestedTraceId:traceId,cfRay:response.headers['Cf-Ray']??null,status:response.status}));
}
export function handleSummary(data){return campaignReports(config,data);}
