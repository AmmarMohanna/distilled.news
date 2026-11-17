import {ELIGIBLE_PUSH_SQL} from './push-outbox';

const MAX_PREVIEW_CHARS=180;
export function genericPushPreview(language:string):string {
 return language==='ar'?'ملخص جديد جاهز في خلاصاتك.':language==='fr'?'Un nouveau résumé est disponible dans vos fils.':'A new briefing is ready in your feeds.';
}

/** Reuse published reader text, without generating or truncating factual claims. */
export function briefingPushPreview(value:unknown,uiLanguage:string):string {
 const fallback=genericPushPreview(uiLanguage);
 const edition=value as {engine?:string;language?:string;stories?:{claims?:{text?:unknown}[]}[]}|null;
 if(edition?.engine!=='v3'||!Array.isArray(edition.stories)||!edition.stories.length)return fallback;
 const headlines=edition.stories.map(s=>typeof s?.claims?.[0]?.text==='string'?s.claims[0].text.split(/\r?\n/,1)[0].replace(/\s+/g,' ').trim():'');
 if(headlines.some(h=>!h))return fallback;
 const lead=headlines[0],more=headlines.length-1;
 const language=['en','ar','fr'].includes(edition.language??'')?edition.language:uiLanguage;
 const suffix=!more?'':language==='ar'?(more===1?' · ومستجد آخر':` · ومستجدات أخرى (${more})`):language==='fr'?` · ${more} autre${more===1?'':'s'} actualité${more===1?'':'s'}`:` · ${more} more update${more===1?'':'s'}`;
 if(Array.from(lead+suffix).length<=MAX_PREVIEW_CHARS)return lead+suffix;
 return Array.from(lead).length<=MAX_PREVIEW_CHARS?lead:fallback;
}

/** Same oldest-first, receipt/cutoff eligibility as the acceptance outbox. */
export async function readBriefingPushPreview(db:D1Database,s:{account_id:string;last_notified_at:string;newest:string;notification_version:string;language:string}):Promise<string>{
 const row=await db.prepare(`SELECT e.json FROM briefings b JOIN accounts a ON a.id=b.owner_account_id
 ${ELIGIBLE_PUSH_SQL} WHERE b.owner_account_id=? AND json_extract(p.json,'$.publishedAt')>?
 AND json_extract(p.json,'$.publishedAt')<=?
 AND NOT EXISTS(SELECT 1 FROM v1_feed_documents r WHERE r.kind='browser_push_receipts' AND r.feed_id=e.feed_id AND json_extract(r.json,'$.editionId')=e.id AND json_extract(r.json,'$.subscriptionVersion')=?)
 ORDER BY json_extract(p.json,'$.publishedAt'),e.id LIMIT 1`).bind(s.account_id,s.last_notified_at,s.newest,s.notification_version).first<{json:string}>();
 if(!row)return genericPushPreview(s.language);
 try{return briefingPushPreview(JSON.parse(row.json),s.language);}catch{return genericPushPreview(s.language);}
}
