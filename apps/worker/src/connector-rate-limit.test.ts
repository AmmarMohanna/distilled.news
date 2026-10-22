import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {rateLimitedPublicHttp} from './connector-rate-limit';
let ctx:Awaited<ReturnType<typeof createIntakeDatabase>>;
beforeEach(async()=>{ctx=await createIntakeDatabase({product:true})});
afterEach(async()=>ctx.dispose());
const response=(status=429,headers:Record<string,string>={})=>({status,headers,bytes:new Uint8Array(),telemetry:{requests:1,latencyMs:1,providerCostUsd:0}});
it('shares an origin cooldown across feeds, preserves real attempts and resumes after expiry',async()=>{
 let at=Date.parse('2026-10-16T12:00:00Z');const get=vi.fn(async()=>response()),authorize=vi.fn(async()=>{});
 const first=rateLimitedPublicHttp(ctx.db,{get},authorize,()=>at),second=rateLimitedPublicHttp(ctx.db,{get},authorize,()=>at);
 expect((await first.get('https://venturebeat.com/ai/feed/',{})).headers['retry-after']).toBe('300');
 const wait=await second.get('https://venturebeat.com/news/feed/',{});
 expect(wait).toMatchObject({status:429,telemetry:{requests:0,providerCostUsd:0}});expect(get).toHaveBeenCalledTimes(1);
 at+=300000;expect((await second.get('https://venturebeat.com/news/feed/',{})).headers['retry-after']).toBe('600');expect(get).toHaveBeenCalledTimes(2);
 at+=600000;get.mockImplementation(async()=>response(200));expect((await first.get('https://venturebeat.com/ai/feed/',{})).status).toBe(200);
 expect(await ctx.db.prepare('SELECT 1 FROM connector_http_cooldowns').first()).toBeNull();
 get.mockImplementation(async()=>response());expect((await first.get('https://venturebeat.com/ai/feed/',{})).headers['retry-after']).toBe('300');
});
it.each(['7200','Fri, 16 Oct 2026 14:00:00 GMT'])('honors the full Retry-After %s instead of imposing a shorter retry',async header=>{
 const at=Date.parse('2026-10-16T12:00:00Z'),get=vi.fn(async()=>response(429,{'retry-after':header}));
 const http=rateLimitedPublicHttp(ctx.db,{get},async()=>{},()=>at);
 expect((await http.get('https://example.com/feed',{})).headers['retry-after']).toBe('7200');
 expect((await http.get('https://other.example/feed',{})).telemetry.requests).toBe(1);
 expect((await http.get('https://example.com/feed',{})).telemetry.requests).toBe(0);expect(get).toHaveBeenCalledTimes(2);
});
it('rechecks source authorization even when it can answer without a network call',async()=>{
 let approved=true;const get=vi.fn(async()=>response());
 const http=rateLimitedPublicHttp(ctx.db,{get},async()=>{if(!approved)throw Error('SOURCE_NOT_APPROVED')},()=>0);
 await http.get('https://example.com/feed',{});approved=false;
 await expect(http.get('https://example.com/feed',{})).rejects.toThrow('SOURCE_NOT_APPROVED');expect(get).toHaveBeenCalledTimes(1);
});
