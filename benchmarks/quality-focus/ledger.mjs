// Dedicated isolated QA wire adapter; same atomic application accounting, fixed non-production endpoint.
export const QUALITY_EVALUATION_D1='https://api.cloudflare.com/client/v4/accounts/e32b564514d4f9b9e383b7dd30dbb026/d1/database/5ca750ba-dad8-413f-896e-bd62b1023ac2/query';
export function qualityD1(token,fetcher=fetch){
 if(!token)throw Error('EVALUATION_CLOUDFLARE_AUTH_REQUIRED');
 const query=async body=>{
  const response=await fetcher(QUALITY_EVALUATION_D1,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
  const data=await response.json();
  if(!response.ok||!data.success||data.result?.some(r=>!r.success))throw Error('EVALUATION_D1_QUERY_FAILED:'+JSON.stringify((data.errors??[]).map(e=>({code:e.code,message:e.message}))));
  return data.result;
 };
 class Statement{
  constructor(sql,params=[]){this.sql=sql;this.params=params;}
  bind(...params){return new Statement(this.sql,params);}
  async all(){return (await query({sql:this.sql,params:this.params}))[0];}
  async first(column){const row=(await this.all()).results[0]??null;return column?row?.[column]??null:row;}
  async run(){return this.all();}
 }
 return {prepare:sql=>new Statement(sql),batch:statements=>query({batch:statements.map(s=>({sql:s.sql,params:s.params}))})};
}
