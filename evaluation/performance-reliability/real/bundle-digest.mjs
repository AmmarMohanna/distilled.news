// Prints the CAMPAIGN_EXPECTED_BUNDLE_DIGEST of the campaign Worker as deployed,
// computed exactly as the native preflight computes it. Read-only.
//
//   CAMPAIGN_CLOUDFLARE_TOKEN=... node evaluation/performance-reliability/real/bundle-digest.mjs [worker]
import {QUALITY_EVALUATION_D1} from '../../../benchmarks/quality-focus/ledger.mjs';
import {digest} from './manifest.mjs';

const worker = process.argv[2] ?? process.env.CAMPAIGN_PILOT_WORKER ?? 'distilled-news-staging-campaign-pilot';
const token = process.env.CAMPAIGN_CLOUDFLARE_TOKEN ?? process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw Error('Set CAMPAIGN_CLOUDFLARE_TOKEN (or CLOUDFLARE_API_TOKEN) first.');
if (!/campaign/.test(worker)) throw Error('Only isolated campaign Workers are supported.');
const accountId = new URL(QUALITY_EVALUATION_D1).pathname.split('/')[4];
const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${worker}`,
  {headers: {authorization: `Bearer ${token}`}, signal: AbortSignal.timeout(30_000)});
if (!response.ok) throw Error(`Cloudflare returned ${response.status} for the Worker bundle.`);
const module = (await response.formData()).get('index.js');
if (!module) throw Error('The deployed Worker has no index.js module.');
const bytes = typeof module === 'string' ? Buffer.from(module) : Buffer.from(await module.arrayBuffer());
console.log(digest(bytes.toString('base64')));
