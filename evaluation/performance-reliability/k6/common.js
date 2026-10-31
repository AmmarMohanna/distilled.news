import http from 'k6/http';
import {check,sleep} from 'k6';
import exec from 'k6/execution';
import {Rate,Trend,Counter} from 'k6/metrics';
export const journeySuccess=new Rate('journey_success'),journeyLatency=new Trend('journey_latency_ms'),faultObserved=new Counter('fault_observed');
export function journey(config){
 const i=exec.scenario.iterationInTest,kind=config.profile==='fault'?2:i%5;
 const base='/api/feed/'+config.user+'/'+config.feed;
 const paths=['/','/api/explore/feeds',base,base+'/editions/'+config.edition,base];
 const names=['home','explore','feed','edition','refresh'];
 const phase=exec.scenario.name==='warmup'?'warmup':'measured',tags={phase,name:names[kind]};
 const response=http.get(config.origin+paths[kind],{redirects:0,timeout:'3s',tags,headers:{Accept:kind===0?'text/html':'application/json',...(kind===4?{'Cache-Control':'no-cache'}:{})}});
 const expected=config.profile==='fault'&&i<3?503:200;
 if(expected===503&&response.status===503)faultObserved.add(1);
 let shape=true;
 if(response.status===200&&kind!==0){try{const json=response.json();shape=kind===1?Array.isArray(json.feeds):kind===3?Boolean(json.edition):Boolean(json.briefing)&&Array.isArray(json.editions);}catch{shape=false;}}
 const ok=check(response,{'expected HTTP status':r=>r.status===expected,'valid reader payload':()=>shape,'bounded response':r=>(r.body||'').length<2*1024*1024},tags);
 journeySuccess.add(ok,tags);journeyLatency.add(response.timings.duration,tags);
 if(config.profile==='fault')sleep(.05);
}
export function summary(config,data){
 const report={schemaVersion:'distilled-k6-result.v1',mode:config.mode,evidence:config.local?'synthetic fixture HTTP only; not application throughput':'authorized read-only HTTP campaign',profile:config.profile,harnessSha256:__ENV.HARNESS_SHA256||null,k6Version:__ENV.K6_VERSION||null,commit:__ENV.COMMIT_SHA||'UNRECORDED',startedAt:__ENV.RUN_STARTED_AT||null,finishedAt:new Date().toISOString(),origin:config.origin,settings:config.options,metrics:data.metrics,limitations:['HTTP request latency is not cutoff-to-reader pipeline latency.','k6 quantiles are diagnostic; use raw samples and Aya R7 for evaluation comparisons.','Public fixture routes only; no publication, inference, source collection or notification.','No client cache; warmup excluded from measured thresholds; CDN cache state unobserved.']};
 const html='<!doctype html><meta charset="utf-8"><title>Offline k6 evidence</title><h1>k6 '+config.profile+'</h1><pre>'+JSON.stringify(report,null,2).replaceAll('&','&amp;').replaceAll('<','&lt;')+'</pre>';
 return {[(__ENV.RESULT_DIR||'.')+'/'+config.profile+'.html']:html,[(__ENV.RESULT_DIR||'.')+'/'+config.profile+'.json']:JSON.stringify(report,null,2),'stdout':JSON.stringify({profile:config.profile,metrics:data.metrics},null,2)+'\n'};
}
