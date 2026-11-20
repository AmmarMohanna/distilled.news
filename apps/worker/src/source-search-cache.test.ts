import {expect,it,vi} from 'vitest';
import {cachedSourceSearch,cacheSourceSearchProgress,readSourceSearchCache} from './source-search-cache';
it('keeps selection progress separate from completed searches and prefers final evidence',async()=>{
 const saved=new Map<string,Response>(),cache={match:async(key:Request)=>saved.get(key.url)?.clone(),put:async(key:Request,response:Response)=>{saved.set(key.url,response.clone());}};
 const first={source:'https://one.example/',title:'First',publisher:'one.example'},second={source:'https://two.example/',title:'Second',publisher:'two.example'};
 const partial={results:[first],unavailable:false},complete={results:[first,second],unavailable:false};
 await cacheSourceSearchProgress('owner','query','https://app.example',partial,cache);
 expect(await readSourceSearchCache('owner','query','https://app.example',cache)).toEqual(partial);
 const load=vi.fn(async()=>complete);
 expect(await cachedSourceSearch('owner','query','https://app.example',load,cache)).toEqual(complete);expect(load).toHaveBeenCalledOnce();
 await cacheSourceSearchProgress('owner','query','https://app.example',partial,cache);
 expect(await readSourceSearchCache('owner','query','https://app.example',cache)).toEqual(complete);
 expect(await cachedSourceSearch('owner','query','https://app.example',load,cache)).toEqual(complete);expect(load).toHaveBeenCalledOnce();
 expect(await readSourceSearchCache('another-owner','query','https://app.example',cache)).toBeUndefined();
});
it('reuses successful searches while separating owners and hiding raw queries in cache keys',async()=>{
 const saved=new Map<string,Response>();
 const cache={match:vi.fn(async(key:RequestInfo)=>saved.get(String(key instanceof Request?key.url:key))?.clone()),put:vi.fn(async(key:RequestInfo,response:Response)=>{expect(response.headers.get('cache-control')).toBe('public, max-age=120');saved.set(String(key instanceof Request?key.url:key),response.clone());})};
 const load=vi.fn(async()=>({results:[],unavailable:false}));
 for(const owner of ['one','one','two'])await cachedSourceSearch(owner,'Georges Khabbaz','https://joud.example',load,cache);
 expect(load).toHaveBeenCalledTimes(2);
 expect([...saved.keys()].join(' ')).not.toMatch(/Georges|Khabbaz|one|two/);
});
it('does not cache transport outages and still works when cache reads fail',async()=>{
 const cache={match:vi.fn(async()=>{throw Error('cache unavailable');}),put:vi.fn()};
 const load=vi.fn(async()=>({results:[],unavailable:true}));
 expect(await cachedSourceSearch('owner','query','https://joud.example',load,cache)).toEqual({results:[],unavailable:true});
 expect(cache.put).not.toHaveBeenCalled();
});
it('does not cache an empty search whose access checks are incomplete',async()=>{
 const cache={match:vi.fn(async()=>undefined),put:vi.fn()};
 const load=vi.fn(async()=>({results:[],unavailable:false,accessIncomplete:true}));
 for(let i=0;i<2;i++)await cachedSourceSearch('owner','query','https://joud.example',load,cache);
 expect(load).toHaveBeenCalledTimes(2);expect(cache.put).not.toHaveBeenCalled();
});
