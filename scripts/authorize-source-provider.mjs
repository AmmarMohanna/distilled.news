import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const args=process.argv.slice(2),value=name=>args[args.indexOf(name)+1];
const providers={x_twitterapi_io:'twitterApiIo',x_apify:'apify',google_apify:'apify',linkedin_apify:'apify',zyte:'zyte'};
const provider=value('--provider'),aggregate=Number(value('--aggregate-usd')),ceiling=Number(value('--operation-ceiling-usd'));
if(!args.includes('--provider')||!Object.hasOwn(providers,provider)||!args.includes('--aggregate-usd')||!args.includes('--operation-ceiling-usd')||!Number.isFinite(aggregate)||aggregate<0||!Number.isFinite(ceiling)||ceiling<0||ceiling>15||ceiling>aggregate||(aggregate>0&&ceiling===0)||(args.includes('--remote')&&!args.includes('--apply')))
 throw Error('Usage: node scripts/authorize-source-provider.mjs --provider x_twitterapi_io --aggregate-usd <explicit operator limit> --operation-ceiling-usd <bounded reservation> [--apply [--remote]]; use both values zero to revoke.');
const config=fileURLToPath(new URL('../apps/worker/wrangler.sources-qa.toml',import.meta.url));
let text=await readFile(config,'utf8');
if(!/^name = "distilled-news-sources-qa"$/m.test(text)||!/^database_name = "distilled-news-sources-qa"$/m.test(text))throw Error('UNEXPECTED_QA_TARGET');
const parse=name=>JSON.parse(text.match(new RegExp(`^${name} = '([^']*)'`,'m'))?.[1]??'{}');
const budgets=parse('SOURCE_PROVIDER_BUDGETS_JSON'),ceilings=parse('SOURCE_OPERATION_CEILINGS_JSON');
budgets[provider]=aggregate;ceilings[providers[provider]]=ceiling;
console.log(JSON.stringify({target:'distilled-news-sources-qa',provider,aggregateAuthorizedUsd:aggregate,perSourcePerProviderUsd:15,operationReservationUsd:ceiling,apply:args.includes('--apply'),remote:args.includes('--remote'),deploy:false}));
if(args.includes('--apply')){
 if(args.includes('--remote')){
  const dir=fileURLToPath(new URL('../.review-tmp/',import.meta.url));await mkdir(dir,{recursive:true});
  const command=`INSERT INTO connector_provider_budgets(provider_id,limit_usd) VALUES('${provider}',${aggregate}) ON CONFLICT(provider_id) DO UPDATE SET limit_usd=excluded.limit_usd`;
  const worker=fileURLToPath(new URL('../apps/worker/',import.meta.url)),wrangler=fileURLToPath(new URL('../apps/worker/node_modules/wrangler/bin/wrangler.js',import.meta.url));
  const result=spawnSync(process.execPath,[wrangler,'d1','execute','distilled-news-sources-qa','--remote','--config','wrangler.sources-qa.toml','--command',command],{cwd:worker,stdio:'inherit',shell:false,windowsHide:true,env:{...process.env,WRANGLER_LOG_PATH:fileURLToPath(new URL('../.review-tmp/source-budget-authorization.log',import.meta.url))}});
  if(result.error)throw result.error;if(result.status!==0)throw Error('REMOTE_AUTHORIZATION_FAILED');
 }
 text=text.replace(/^SOURCE_PROVIDER_BUDGETS_JSON = .*$/m,`SOURCE_PROVIDER_BUDGETS_JSON = '${JSON.stringify(budgets)}'`)
  .replace(/^SOURCE_OPERATION_CEILINGS_JSON = .*$/m,`SOURCE_OPERATION_CEILINGS_JSON = '${JSON.stringify(ceilings)}'`);
 await writeFile(config,text);
 console.log('Configuration updated. Existing reservations are retained. Queue mode requires both deployment authorization and the persisted D1 grant; use --apply --remote for an explicit grant or revocation, then deploy the reviewed configuration. No paid request was sent.');
}
