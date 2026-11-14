/** Read-only, staging-fixed operator source decision export. No inference or writes. */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {evaluationD1} from './validation-evaluation-d1.mjs';
import {buildSourceDecisions} from '../packages/briefing/src/source-accounting';
import {prepareArticles} from '../packages/briefing/src/prepare';
import type {V3WindowInput,V3WindowResult} from '../apps/worker/src/v1-intelligence/v3-window';
const args=process.argv.slice(2),value=(key:string)=>args[args.indexOf(key)+1];
if(!args.includes('--feed')||!args.includes('--window')||!value('--feed')||!value('--window'))throw Error('Use --feed <staging feed ID> --window <request ID>');
const token=readFileSync(join(process.env.APPDATA!,'xdg.config/.wrangler/config/default.toml'),'utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1],db=evaluationD1(token) as D1Database;
const feedId=value('--feed'),windowId=value('--window');
const request=await db.prepare("SELECT json FROM v1_feed_documents WHERE feed_id=? AND kind='briefing_requests' AND id=?").bind(feedId,windowId).first<{json:string}>();
if(!request)throw Error('STAGING_WINDOW_NOT_FOUND');
const r=JSON.parse(request.json),inputId=r.v3InputId??windowId;
const rows=await db.prepare("SELECT kind,json FROM v1_feed_documents WHERE feed_id=? AND id=? AND kind IN ('v3_window_inputs','v3_window_results')").bind(feedId,inputId).all<{kind:string;json:string}>();
const input=rows.results.find(row=>row.kind==='v3_window_inputs'),result=rows.results.find(row=>row.kind==='v3_window_results');
if(!input||!result)throw Error('WINDOW_INPUT_OR_RESULT_NOT_READY');
const snapshot=JSON.parse(input.json) as V3WindowInput,saved=JSON.parse(result.json) as V3WindowResult;
if(saved.inputId!==snapshot.fingerprint)throw Error('AUDIT_INPUT_BINDING_MISMATCH');
const {prepared}=prepareArticles(snapshot.input.articles,{maxArticleChars:Number.MAX_SAFE_INTEGER,minChars:1,nearDuplicate:1.01});
const decisions=saved.result.sourceDecisions??buildSourceDecisions(snapshot.input.articles.map(a=>a.id),prepared,saved.result);
const articles=new Map(snapshot.input.articles.map(a=>[a.id,a])),admissions=new Map(snapshot.admissions?.map(a=>[a.revisionId,a.reason]));
console.log(JSON.stringify({feedId,windowId,inputId,scheduledFor:snapshot.scheduledFor,windowStart:snapshot.input.windowStart,windowEnd:snapshot.input.windowEnd,
 policy:snapshot.editorAccountingPolicy??'legacy-unchecked',traceOrigin:saved.result.sourceDecisions?'persisted':'reconstructed-from-recorded-outcomes',
 requestState:r.state,requestResult:r.result,editorialResult:saved.result.status,originalSourceCount:snapshot.input.articles.length,
 unresolved:decisions.filter(d=>d.outcomes.some(o=>o.decision==='unresolved')).length,
 semanticCorrectness:'NOT_ESTABLISHED_BY_ACCOUNTING',
 sources:decisions.map(d=>{const a=articles.get(d.sourceId);return {...d,title:a?.title??null,url:a?.url??null,originalPublishedAt:a?.publishedAt??null,admission:admissions.get(d.sourceId)??null}})},null,2));
