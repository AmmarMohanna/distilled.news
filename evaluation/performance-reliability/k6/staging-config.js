// Separate from every existing fixture/campaign profile. Never runs on import.
export function stagingConfiguration(env) {
  const origin='https://distilled-news-staging.distillednews-platform.workers.dev';
  if(env.STAGING_ORIGIN!==origin||env.STAGING_AUTHORIZATION!=='APPROVED_READ_ONLY'||env.USAGE_PREFLIGHT!=='VERIFIED'||!/^[-a-zA-Z0-9_]{1,64}$/.test(env.APPROVAL_ID??''))throw Error('STAGING_APPROVAL_AND_USAGE_PREFLIGHT_REQUIRED');
  if(!/^[a-zA-Z0-9_-]{1,64}$/.test(env.RUN_ID??'')||!/^[a-f0-9]{40}$/.test(env.COMMIT_SHA??''))throw Error('REPRODUCIBLE_RUN_REQUIRED');
  const profile=env.STAGING_PROFILE??'public-read';
  if(!['public-read','authenticated-read'].includes(profile))throw Error('READ_ONLY_PROFILE_REQUIRED');
  if(profile==='authenticated-read'&&(!env.ISOLATED_ACCOUNT_ID||!env.STAGING_SESSION_COOKIE))throw Error('ISOLATED_ACCOUNT_REQUIRED');
  for(const value of [env.FEED_USER,env.FEED_SLUG,env.EDITION_ID])if(!/^[a-zA-Z0-9_-]{1,100}$/.test(value??''))throw Error('EXPLICIT_FIXTURE_IDENTITIES_REQUIRED');
  const count=Number(env.REQUEST_BUDGET??10);
  if(!Number.isSafeInteger(count)||count<8||count>20)throw Error('REQUEST_BUDGET_8_TO_20_REQUIRED');
  return {origin,profile,runId:env.RUN_ID,approvalId:env.APPROVAL_ID,commit:env.COMMIT_SHA,
    user:env.FEED_USER,feed:env.FEED_SLUG,edition:env.EDITION_ID,
    budget:{maximumRequests:count,maximumVUs:1,maximumSeconds:60,mutationRequests:0,providerCalls:0,dbRowsRead:'UNMEASURED_ACCOUNT_HEADROOM_REQUIRED'},
    options:{scenarios:{staging:{executor:'shared-iterations',vus:1,iterations:count,maxDuration:'60s',gracefulStop:'0s'}},maxRedirects:0,discardResponseBodies:false,summaryTrendStats:['med','p(50)','p(95)','p(99)','max'],
      thresholds:{http_req_failed:['rate==0'],checks:['rate==1'],http_req_duration:['p(95)<3000','p(99)<5000']},tags:{environment:'staging',campaign:env.RUN_ID,profile},systemTags:['status','method','name','scenario','expected_response']}};
}
export function campaignReports(config,data) {
  const report={schemaVersion:'distilled-staging-http.v1',mode:'CONTROLLED_LIVE_READ_ONLY',runId:config.runId,approvalId:config.approvalId,commit:config.commit,environment:'staging',finishedAt:new Date().toISOString(),budget:config.budget,settings:config.options,metrics:data.metrics,
    limitations:['HTTP success is not Browser Agent or V3 task correctness.','Database usage, provider/queue behavior and Grafana correlation require separate evidence.','Requested traceparent identifiers are not observed native trace IDs.','Tail percentiles from at most twenty requests are exploratory.']};
  const json=JSON.stringify(report,null,2),escaped=json.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  return {'staging-performance.json':json,'staging-performance.html':'<!doctype html><meta charset="utf-8"><title>Distilled staging HTTP evidence</title><h1>Bounded staging HTTP campaign</h1><p>Read-only HTTP; not agent or publication correctness.</p><pre>'+escaped+'</pre>'};
}
