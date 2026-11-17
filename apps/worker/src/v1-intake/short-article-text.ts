import {unreadableArticleReason} from '@distilled/connectors';
/** Preserve a short primary description as an excerpt, never a complete article.
 * A title, date and navigation buttons alone do not establish usable body text. */
export function usableShortArticle(title:unknown,body:unknown):boolean {
 if(typeof title!=='string'||!title.trim()||typeof body!=='string'||body.length<80||body.length>=200||unreadableArticleReason(body))return false;
 const remainder=body.replace(title,'').replace(/\b(?:try now|contact sales|opens in a new window)\b/gi,'').replace(/\s+/g,' ').trim();
 return remainder.length>=30&&(remainder.match(/[\p{L}\p{M}]/gu)??[]).length>=25;
}
