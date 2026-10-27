/** ProMED's public Next.js snapshot supplies stable alert IDs; its public
 * client maps those IDs to /alert/<id>. Never evaluate scripts or infer IDs. */
export function discoverPromedReports(scripts:string[],visibleRows:string[],url:string){
 const page=new URL(url);
 if(!['www.promedmail.org','promedmail.org'].includes(page.hostname)||page.protocol!=='https:'||page.pathname!=='/'||page.search)return undefined;
 let payload='';
 for(const script of scripts){
  const match=script.trim().match(/^self\.__next_f\.push\(([\s\S]*)\)\s*;?$/);
  if(!match)continue;
  try{const frame=JSON.parse(match[1]);if(frame[0]===1&&typeof frame[1]==='string'){if(payload.length+frame[1].length>2_000_000)return undefined;payload+=frame[1];}}catch{/* Not a data frame. */}
 }
 const reports=new Map<string,{url:string;title:string;publishedAt?:string}>();
 // Flight also contains length-prefixed text records without newline endings.
 // Locate only the observed alert-component record, then balance JSON safely.
 for(const match of payload.matchAll(/[0-9a-f]+:\["\$","\$[A-Za-z0-9]+",null,\{"alerts":/g)){
  const start=match.index!+match[0].indexOf('[');let end=start,depth=0,quoted=false,escaped=false;
  for(;end<payload.length;end++){
   const c=payload[end];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue}
   if(c==='"')quoted=true;else if(c==='['||c==='{')depth++;else if(c===']'||c==='}'){if(--depth===0){end++;break}}
  }
  const row=payload.slice(start,end);
  try{
   const pending:unknown[]=[JSON.parse(row)];let seen=0;
   while(pending.length&&seen++<20000){
    const value=pending.pop();if(Array.isArray(value)){pending.push(...value);continue}if(!value||typeof value!=='object')continue;
    const object=value as Record<string,unknown>;
    if(Array.isArray(object.alerts))for(const raw of object.alerts){
     if(!raw||typeof raw!=='object')continue;const alert=raw as Record<string,unknown>,id=alert.alert_id,title=alert.post_title;
     if(!Number.isSafeInteger(id)||Number(id)<=0||typeof title!=='string'||!title.trim()||title.length>2000||!visibleRows.some(row=>row.includes(title)))continue;
     const date=typeof alert.issue_date==='string'?alert.issue_date.replace(/^\$D/,''):undefined;
     const publishedAt=date&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(date)&&Number.isFinite(Date.parse(date))?new Date(date).toISOString():undefined;
     const href=new URL('/alert/'+id,page.origin).href;if(!reports.has(href))reports.set(href,{url:href,title,...(publishedAt?{publishedAt}:{})});
    }
    pending.push(...Object.values(object));
   }
  }catch{/* Ignore other Flight rows and malformed data without guessing. */}
 }
 return reports.size?{articles:[...reports.values()],paginationUnresolved:true as const}:undefined;
}
