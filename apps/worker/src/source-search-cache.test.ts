import {expect,it,vi} from 'vitest';
import {cachedSourceSearch} from './source-search-cache';
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
