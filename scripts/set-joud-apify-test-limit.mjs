import fs from 'node:fs/promises';
if(!process.argv.includes('--authorize-monthly-limit-usd=50.10'))throw Error('EXPLICIT_50_10_USD_LIMIT_APPROVAL_REQUIRED');
const env=await fs.readFile('.env','utf8');
const token=env.match(/^(?:APIFY_API_TOKEN|APIFY_TOKEN)\s*=\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g,'');
if(!token)throw Error('LOCAL_APIFY_TOKEN_MISSING');
const endpoint='https://api.apify.com/v2/users/me/limits';
const headers={authorization:'Bearer '+token,'content-type':'application/json'};
const read=async()=>{const response=await fetch(endpoint,{headers,signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('LIMIT_READ_FAILED_'+response.status);return (await response.json()).data;};
const summarize=data=>({limitUsd:data.limits.maxMonthlyUsageUsd,usageUsd:data.current.monthlyUsageUsd,cycleEndsAt:data.monthlyUsageCycle.endAt});
const before=await read();
if(![50,50.10].includes(before.limits.maxMonthlyUsageUsd))throw Error('ACCOUNT_LIMIT_CHANGED_OUTSIDE_APPROVED_RANGE');
const directory='.local-reports/general-web-search-probe-retry1';await fs.mkdir(directory,{recursive:true});
await fs.writeFile(directory+'/limit-before.json',JSON.stringify(summarize(before),null,2));
if(before.limits.maxMonthlyUsageUsd===50){
 const response=await fetch(endpoint,{method:'PUT',headers,body:JSON.stringify({maxMonthlyUsageUsd:50.10}),signal:AbortSignal.timeout(20000)});
 const result=await response.json().catch(()=>({}));
 await fs.writeFile(directory+'/limit-update.json',JSON.stringify({status:response.status,result},null,2));
 if(!response.ok){console.log(JSON.stringify({status:response.status,error:result.error}));throw Error('LIMIT_UPDATE_REJECTED');}
}
const after=await read();await fs.writeFile(directory+'/limit-after.json',JSON.stringify(summarize(after),null,2));
console.log(JSON.stringify({before:summarize(before),after:summarize(after)}));
if(after.limits.maxMonthlyUsageUsd!==50.10)throw Error('LIMIT_UPDATE_NOT_CONFIRMED');
if(after.limits.maxMonthlyUsageUsd-after.current.monthlyUsageUsd<0.05)throw Error('INSUFFICIENT_HEADROOM_FOR_FIVE_CENT_TEST');
