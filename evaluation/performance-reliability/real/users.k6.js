import {readViolation,pageViolation,assetPaths,PAGE_NAMES} from './journeys.mjs';
import http from 'k6/http';
import {check,sleep} from 'k6';
import exec from 'k6/execution';
import {Counter,Trend} from 'k6/metrics';
import {browser} from 'k6/browser';
const m=JSON.parse(open(__ENV.CAMPAIGN_MANIFEST));
const registry=JSON.parse(open(__ENV.CAMPAIGN_REGISTRY));
if(m.schemaVersion!=='distilled-real-campaign.v1'||registry.runId!==m.runId||registry.origin!==m.origin||!/^https:\/\/distilled-news-staging-campaign-[a-z0-9-]+\.distillednews-platform\.workers\.dev$/.test(m.origin))throw Error('ISOLATED_CAMPAIGN_BINDING');
const safety=new Counter('campaign_safety_violations');
// Separate reader-page and API latency; the overall http_req_duration still gates the run.
const pageDuration=new Trend('campaign_page_duration',true),apiDuration=new Trend('campaign_api_duration',true);
let assets=[];
export const options={discardResponseBodies:false,maxRedirects:0,scenarios:{users:{executor:'ramping-vus',startVUs:Math.min(m.maxVus,m.stages[0].vus),stages:m.stages.map(s=>({duration:s.seconds+'s',target:s.vus})),gracefulRampDown:'0s',gracefulStop:'0s'},...(m.browserPages===true?{reader_browser:{executor:'shared-iterations',exec:'readerBrowser',vus:1,iterations:Math.min(6,Math.max(1,Math.floor(m.durationSeconds/20))),maxDuration:m.durationSeconds+'s',options:{browser:{type:'chromium'}}}}:{})},thresholds:{http_req_failed:[{threshold:`rate<${m.stop.httpErrorRate}`,abortOnFail:true,delayAbortEval:'10s'}],http_req_duration:[{threshold:`p(95)<${m.stop.p95Ms}`,abortOnFail:true,delayAbortEval:'10s'}],checks:[{threshold:'rate>0.99',abortOnFail:true,delayAbortEval:'10s'}],campaign_safety_violations:[{threshold:'count==0',abortOnFail:true}]},tags:{environment:'staging',profile:m.profile},systemTags:['status','method','name','scenario','expected_response'],summaryTrendStats:['avg','min','med','p(50)','p(95)','p(99)','max']};
export default function(){
 if(exec.scenario.iterationInTest>=m.trafficRequests){sleep(1);return;}
 const user=registry.users[(exec.vu.idInTest-1)%registry.users.length];
 if(!user.cookie||!user.id||!user.feeds.length)exec.test.abort('INCOMPLETE_REAL_USER_REGISTRY');
 const feed=user.feeds[exec.scenario.iterationInTest%user.feeds.length],other=registry.users.find(u=>u.id!==user.id);
 const feedPage='/'+encodeURIComponent(user.username)+'/'+encodeURIComponent(feed.config.slug);
 const choices=[['session','/api/auth/session'],['page-home','/'],['owned-feeds','/api/me/briefings'],['page-feed',feedPage],['account','/api/me/account'],['explore','/api/explore/feeds'],['page-explore','/explore'],['feed','/api/feed/'+user.username+'/'+feed.config.slug],['page-asset',null],['foreign-private','/api/feed/'+other.username+'/'+(other.feeds.find(f=>!f.config.publicFeedEnabled)?.config.slug??'not-found')]];
 let [name,path]=choices[exec.scenario.iterationInTest%choices.length];
 // One request per iteration keeps the approved traffic budget exact. A bundle
 // request uses a path learned from this VU's own earlier app-shell response.
 if(name==='page-asset'){path=assets[exec.scenario.iterationInTest%Math.max(1,assets.length)];if(!path){name='page-home';path='/';}}
 const page=PAGE_NAMES.includes(name),asset=name==='page-asset';
 const r=http.get(m.origin+path,{redirects:0,timeout:'15s',headers:{cookie:user.cookie,'X-Distilled-Campaign':m.runId,...(page?{accept:'text/html'}:{})},tags:{name},responseCallback:http.expectedStatuses(...(name==='foreign-private'?[404]:[200]))});
 check(r,{'request completed':res=>name==='foreign-private'?res.status===404:res.status===200});
 (page||asset?pageDuration:apiDuration).add(r.timings.duration,{name});
 let bad;
 if(page){bad=pageViolation(name,r.status,r.headers['Content-Type'],r.body);if(!bad&&r.status===200)assets=assetPaths(r.body);}
 else if(asset)bad=null;
 else{let json;try{json=r.json()}catch{json=null;}bad=readViolation(name,r.status,json,user,feed);}
 safety.add(bad?1:0);if(bad)exec.test.abort('ISOLATION_VIOLATION');sleep(1);
}

/** One real headless-Chrome reader opens their own feed page and lets it render. */
export async function readerBrowser(){
 const user=registry.users[exec.scenario.iterationInTest%registry.users.length];
 const feed=user.feeds[exec.scenario.iterationInTest%user.feeds.length];
 const cookie=/^([^=;\s]+)=([^;]*)/.exec(user.cookie??'');
 if(!cookie||!feed)exec.test.abort('INCOMPLETE_REAL_USER_REGISTRY');
 const context=await browser.newContext();
 await context.addCookies([{name:cookie[1],value:cookie[2],url:m.origin}]);
 const page=await context.newPage();
 try{
  const response=await page.goto(m.origin+'/'+encodeURIComponent(user.username)+'/'+encodeURIComponent(feed.config.slug),{waitUntil:'networkidle',timeout:'30s'});
  check(response,{'browser page loaded':res=>res!==null&&res.status()===200});
  sleep(1);
 }finally{await page.close();await context.close();}
}
