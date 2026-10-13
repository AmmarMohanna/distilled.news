import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const args=process.argv.slice(2),value=name=>args[args.indexOf(name)+1];
const providers={x_twitterapi_io:'twitterApiIo',x_apify:'apify',google_apify:'apify',linkedin_apify:'apify',zyte:'zyte'};
const provider=value('--provider'),aggregate=Number(value('--aggregate-usd')),ceiling=Number(value('--operation-ceiling-usd'));
if(!args.includes('--provider')||!Object.hasOwn(providers,provider)||!args.includes('--aggregate-usd')||!args.includes('--operation-ceiling-usd')||!Number.isFinite(aggregate)||aggregate<=0||!Number.isFinite(ceiling)||ceiling<=0||ceiling>15||ceiling>aggregate)
 throw Error('Usage: node scripts/authorize-source-provider.mjs --provider x_twitterapi_io --aggregate-usd <explicit operator limit> --operation-ceiling-usd <bounded reservation> [--apply]');
const config=fileURLToPath(new URL('../apps/worker/wrangler.sources-qa.toml',import.meta.url));
let text=await readFile(config,'utf8');
const parse=name=>JSON.parse(text.match(new RegExp(`^${name} = '([^']*)'`,'m'))?.[1]??'{}');
const budgets=parse('SOURCE_PROVIDER_BUDGETS_JSON'),ceilings=parse('SOURCE_OPERATION_CEILINGS_JSON');
budgets[provider]=aggregate;ceilings[providers[provider]]=ceiling;
console.log(JSON.stringify({target:'distilled-news-sources-qa',provider,aggregateAuthorizedUsd:aggregate,perSourcePerProviderUsd:15,operationReservationUsd:ceiling,apply:args.includes('--apply'),deploy:false}));
if(args.includes('--apply')){
 text=text.replace(/^SOURCE_PROVIDER_BUDGETS_JSON = .*$/m,`SOURCE_PROVIDER_BUDGETS_JSON = '${JSON.stringify(budgets)}'`)
  .replace(/^SOURCE_OPERATION_CEILINGS_JSON = .*$/m,`SOURCE_OPERATION_CEILINGS_JSON = '${JSON.stringify(ceilings)}'`);
 await writeFile(config,text);
 console.log('Configuration updated. Install the provider secret securely and deploy after reviewing the diff. Existing reservations are retained.');
}
