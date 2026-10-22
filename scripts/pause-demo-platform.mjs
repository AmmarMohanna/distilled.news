import fs from 'node:fs/promises';
const dir='.local-reports/demo-platform-20261021',origin='https://distilled-news-sources-qa.distillednews-platform.workers.dev';
const run=JSON.parse(await fs.readFile(dir+'/deployed-run.json','utf8'));
const cookie=(await fs.readFile(dir+'/dataset-session','utf8')).trim();
async function api(path,method='GET',body){const response=await fetch(origin+path,{method,headers:{cookie,'content-type':'application/json',origin},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(60000)});return {status:response.status,data:await response.json()};}
const account=await api('/api/me/account');if(account.data.account?.username!=='qa-dataset-owner')throw Error('WRONG_TEST_OWNER');
const current=await api('/api/me/briefings');
const expected=new Set(run.feeds.map(x=>x.id));
if(expected.size!==40||[...expected].some(x=>!/^qads_20261021_\d{2}$/.test(x)))throw Error('UNEXPECTED_TEST_MANIFEST');
const found=current.data.briefings.filter(x=>expected.has(x.id));if(found.length!==40)throw Error('MISSING_TEST_FEEDS');
const results=[];let next=0;
await Promise.all(Array.from({length:4},async()=>{while(next<found.length){const feed=found[next++];const start=Date.now();const result=await api('/api/admin/briefings/'+feed.id,'PATCH',{paused:true});results.push({id:feed.id,status:result.status,paused:result.data.briefing?.paused,durationMs:Date.now()-start});}}));
const verification=await api('/api/me/briefings');
const report={at:new Date().toISOString(),reason:'Bounded dataset test ended; pause only its 40 temporary feeds to stop recurring collection. No sources, evidence, jobs, spending reservations or unknown holds were deleted/reset.',results,verifiedPaused:verification.data.briefings.filter(x=>expected.has(x.id)&&x.paused).length};
await fs.writeFile(dir+'/test-cleanup.json',JSON.stringify(report,null,2));
if(report.verifiedPaused!==40||results.some(x=>x.status!==200||!x.paused))throw Error('PAUSE_INCOMPLETE');
console.log(JSON.stringify({paused:report.verifiedPaused,at:report.at}));
