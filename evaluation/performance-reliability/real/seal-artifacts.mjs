import {readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {seal} from './artifact-crypto.mjs';
const dir=resolve('.local-reports/real-campaigns'),key=process.env.CAMPAIGN_ARTIFACT_KEY;
if(!/^[a-f0-9]{64}$/i.test(key??''))throw Error('PRIVATE_ARTIFACT_KEY_REQUIRED');
const files=[];if(existsSync(dir))for(const run of readdirSync(dir))if(/^[a-z0-9]{8,24}$/.test(run))for(const name of readdirSync(resolve(dir,run))){if(!/^[a-z0-9_.-]+$/i.test(name)||name==='active.lock')continue;const body=readFileSync(resolve(dir,run,name));if(body.length>8_000_000)throw Error('ARTIFACT_TOO_LARGE_REVIEW_PRIVATE_EXPORT');files.push({path:run+'/'+name,body:body.toString('base64')});}
const data=Buffer.from(JSON.stringify({version:1,files}));if(data.length>64_000_000)throw Error('ARTIFACT_BUNDLE_LIMIT');
writeFileSync('.local-reports/campaign-evidence.encrypted.json',JSON.stringify(seal(data,key)),{mode:0o600});
console.log('Private campaign evidence encrypted; key was not included.');
