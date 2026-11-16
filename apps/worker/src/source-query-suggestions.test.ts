import {expect,it,vi} from 'vitest';
import {sourceQuerySuggestions} from './source-query-suggestions';
it('asks for typed query suggestions only and bounds the untrusted response',async()=>{
 const fetcher=vi.fn<typeof fetch>(async url=>{
  const target=new URL(String(url));expect(target.origin).toBe('https://www.google.com');expect([...target.searchParams.keys()].sort()).toEqual(['client','hl','q']);
  expect(target.searchParams.get('q')).toBe('amm');
  return Response.json(['amm',['amman','ammonia','amman','<script>bad</script>',...Array.from({length:10},(_,i)=>'amm '+i)]]);
 });
 const result=await sourceQuerySuggestions('amm','en','owner',fetcher);
 expect(result.unavailable).toBe(false);expect(result.suggestions.slice(0,2)).toEqual(['amman','ammonia']);expect(result.suggestions).toHaveLength(8);
});
it('caches suggestions by owner and language without exposing raw queries in keys',async()=>{
 const values=new Map<string,Response>(),cache={match:async(key:Request)=>values.get(key.url)?.clone(),put:async(key:Request,value:Response)=>{values.set(key.url,value.clone());}};
 const fetcher=vi.fn<typeof fetch>(async()=>Response.json(['amm',['amman']])),limit=vi.fn(async()=>{});
 for(const owner of ['one','one','two'])await sourceQuerySuggestions('amm','en',owner,fetcher,cache,limit);
 expect(fetcher).toHaveBeenCalledTimes(2);expect(limit).toHaveBeenCalledTimes(2);expect([...values.keys()].join(' ')).not.toContain('amm');
});
it('fails quickly and quietly without inventing suggestions',async()=>{
 expect(await sourceQuerySuggestions('amm','en','one',vi.fn(async()=>new Response('',{status:403})))).toEqual({suggestions:[],unavailable:true});
 expect(await sourceQuerySuggestions('amm','en','one',vi.fn(async()=>Response.json(['other',['irrelevant']])))).toEqual({suggestions:[],unavailable:true});
});
