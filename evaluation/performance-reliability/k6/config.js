export const profileNames=['smoke','load','spike','stress','soak','recovery','fault'];
export function configuration(profile,env){
 if(!profileNames.includes(profile))throw Error('UNKNOWN_PROFILE');
 const origin=env.BASE_URL||'http://127.0.0.1:8789';
 const local=/^http:\/\/(?:127\.0\.0\.1|localhost)(?::[1-9][0-9]{0,4})?$/.test(origin);
 if(!local){
  if(!/^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::443)?$/.test(origin)||/(?:^|\.)(?:distilled|lownoise)\.news(?::443)?$/.test(origin.replace('https://','')))throw Error('UNSAFE_ORIGIN');
  if(env.ALLOW_REMOTE_READ_LOAD!=='I_HAVE_AUTHORIZATION'||env.TARGET_ENV!=='isolated'||env.AUTHORIZED_ORIGIN!==origin)throw Error('EXPLICIT_ISOLATED_AUTHORIZATION_REQUIRED');
 }
 const campaign=['stress','soak','recovery','fault'].includes(profile);
 if(campaign&&env.ENABLE_CAMPAIGN!=='yes')throw Error('CAMPAIGN_OPT_IN_REQUIRED');
 if(profile==='fault'&&!local)throw Error('FAULT_LOCAL_ONLY');
 const user=env.FEED_USER||'fixture',feed=env.FEED_SLUG||'news',edition=env.EDITION_ID||'edition-1';
 for(const v of [user,feed,edition])if(!/^[a-zA-Z0-9_-]{1,80}$/.test(v))throw Error('INVALID_FIXTURE_ID');
 const common={preAllocatedVUs:4,maxVUs:20,timeUnit:'1s',gracefulStop:'5s'};
 const scenarios={
  smoke:{executor:'shared-iterations',vus:1,iterations:10,maxDuration:'30s',gracefulStop:'5s'},
  load:{executor:'constant-arrival-rate',rate:2,duration:'30s',...common},
  spike:{executor:'ramping-arrival-rate',startRate:1,stages:[{duration:'5s',target:1},{duration:'10s',target:8},{duration:'5s',target:1}],...common},
  stress:{executor:'ramping-arrival-rate',startRate:1,stages:[{duration:'30s',target:5},{duration:'30s',target:10},{duration:'30s',target:20},{duration:'30s',target:1}],...common},
  soak:{executor:'constant-arrival-rate',rate:5,duration:'5m',...common},
  recovery:{executor:'constant-arrival-rate',rate:1,duration:'15s',...common},
  fault:{executor:'shared-iterations',vus:1,iterations:12,maxDuration:'30s',gracefulStop:'5s'}
 };
 const measured={...scenarios[profile],startTime:profile==='fault'?'0s':'5s',tags:{phase:'measured'}};
 const thresholds={'checks{phase:measured}':['rate==1'],'journey_success{phase:measured}':['rate==1'],'journey_latency_ms{phase:measured}':['p(95)<1500'],'http_reqs{phase:measured}':['count>=10'],dropped_iterations:['count==0']};
 if(profile==='fault')thresholds.fault_observed=['count==3'];
 return {profile,origin,mode:local?'OFFLINE_CONTRACT':'CONTROLLED_LIVE',local,user,feed,edition,options:{scenarios:{...(profile==='fault'?{}:{warmup:{executor:'shared-iterations',vus:1,iterations:5,maxDuration:'4s',gracefulStop:'0s',tags:{phase:'warmup'}}}),measured},thresholds,systemTags:['status','method','name','scenario','expected_response'],summaryTrendStats:['avg','min','med','max','p(50)','p(95)','p(99)'],maxRedirects:0,userAgent:'Distilled-k6-readonly/1',tags:{workstream:'agentops',profile},insecureSkipTLSVerify:false}};
}
