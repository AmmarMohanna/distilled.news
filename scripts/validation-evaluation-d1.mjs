// Operator evaluation adapter: the endpoint cannot be redirected to production.
export const STAGING_EVALUATION_D1='https://api.cloudflare.com/client/v4/accounts/e32b564514d4f9b9e383b7dd30dbb026/d1/database/ab259bfe-6029-4e20-8cb6-eea6b7a67459/query';
export function evaluationD1(token,fetcher=fetch){
 if(!token)throw Error('EVALUATION_CLOUDFLARE_AUTH_REQUIRED');
 const query=async body=>{
  const response=await fetcher(STAGING_EVALUATION_D1,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
  const data=await response.json();
  if(!response.ok||!data.success||data.result?.some(r=>!r.success))throw Error('EVALUATION_D1_QUERY_FAILED:'+JSON.stringify((data.errors??[]).map(e=>e.code)));
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
