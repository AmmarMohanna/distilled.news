import {readViolation} from './journeys.mjs';
import http from 'k6/http';
import {check,sleep} from 'k6';
import exec from 'k6/execution';
import {Counter} from 'k6/metrics';
const m=JSON.parse(open(__ENV.CAMPAIGN_MANIFEST));
const registry=JSON.parse(open(__ENV.CAMPAIGN_REGISTRY));
if(m.schemaVersion!=='distilled-real-campaign.v1'||registry.runId!==m.runId||registry.origin!==m.origin||!/^https:\/\/distilled-news-staging-campaign-[a-z0-9-]+\.distillednews-platform\.workers\.dev$/.test(m.origin))throw Error('ISOLATED_CAMPAIGN_BINDING');
const safety=new Counter('campaign_safety_violations');
export const options={discardResponseBodies:false,maxRedirects:0,scenarios:{users:{executor:'ramping-vus',startVUs:1,stages:m.stages.map(s=>({duration:s.seconds+'s',target:s.vus})),gracefulRampDown:'0s',gracefulStop:'0s'}},thresholds:{http_req_failed:[{threshold:`rate<${m.stop.httpErrorRate}`,abortOnFail:true,delayAbortEval:'10s'}],http_req_duration:[{threshold:`p(95)<${m.stop.p95Ms}`,abortOnFail:true,delayAbortEval:'10s'}],checks:[{threshold:'rate>0.99',abortOnFail:true,delayAbortEval:'10s'}],campaign_safety_violations:[{threshold:'count==0',abortOnFail:true}]},tags:{environment:'staging',profile:m.profile},systemTags:['status','method','name','scenario','expected_response'],summaryTrendStats:['avg','min','med','p(50)','p(95)','p(99)','max']};
export default function(){
 if(exec.scenario.iterationInTest>=m.trafficRequests){sleep(1);return;}
 const user=registry.users[(exec.vu.idInTest-1)%registry.users.length];
 if(!user.cookie||!user.id||!user.feeds.length)exec.test.abort('INCOMPLETE_REAL_USER_REGISTRY');
 const feed=user.feeds[exec.scenario.iterationInTest%user.feeds.length],other=registry.users.find(u=>u.id!==user.id);
 const choices=[['session','/api/auth/session'],['owned-feeds','/api/me/briefings'],['account','/api/me/account'],['explore','/api/explore/feeds'],['feed','/api/feed/'+user.username+'/'+feed.config.slug],['foreign-private','/api/feed/'+other.username+'/'+(other.feeds.find(f=>!f.config.publicFeedEnabled)?.config.slug??'not-found')]];
 const [name,path]=choices[exec.scenario.iterationInTest%choices.length];
 const r=http.get(m.origin+path,{redirects:0,timeout:'15s',headers:{cookie:user.cookie,'X-Distilled-Campaign':m.runId},tags:{name},responseCallback:http.expectedStatuses(...(name==='foreign-private'?[404]:[200]))});
 check(r,{'request completed':res=>name==='foreign-private'?res.status===404:res.status===200});
 let json;try{json=r.json()}catch{json=null;}
 const bad=readViolation(name,r.status,json,user,feed);
 safety.add(bad?1:0);if(bad)exec.test.abort('ISOLATION_VIOLATION');sleep(1);
}
