import {expect,it,vi} from 'vitest';
import {telegramExecution} from './telegram-execution';
import type {Env} from './types';

it('reuses only a recent exact channel identity during a later flood wait, without authorizing post reads',async()=>{
 const objects=new Map<string,string>();const get=vi.fn(async(key:string)=>objects.has(key)?{json:async()=>JSON.parse(objects.get(key)!)}:null);
 const put=vi.fn(async(key:string,value:string)=>{objects.set(key,value);});
 const service=vi.fn(async(_url:unknown,init:RequestInit)=>{const body=JSON.parse(init.body as string);return Response.json(body.input.username==='telegram'?{channelId:'-100123',username:'telegram'}:{error:'RATE_LIMIT',retryNotBefore:new Date(Date.now()+60_000).toISOString()});});
 const env={SOURCE_EXECUTION_SERVICE:{fetch:service},SOURCE_EXECUTION_URL:'http://127.0.0.1:8791/v1/source-execution',SOURCE_EXECUTION_TOKEN:'test-only-token-'.repeat(3),RAW_ARCHIVE:{get,put}} as unknown as Env;
 const execution=telegramExecution(env);
 expect(await execution.execute('telegram_resolve',{username:'telegram'})).toMatchObject({channelId:'-100123'});
 await expect(execution.execute('telegram_resolve',{username:'otherchannel'})).rejects.toThrow('TELEGRAM_RATE_LIMIT');
 expect(await execution.execute('telegram_resolve',{username:'TELEGRAM'})).toMatchObject({channelId:'-100123'});
 await expect(execution.execute('telethon',{channelId:'-100123'})).rejects.toThrow('TELEGRAM_RATE_LIMIT');
 expect(service).toHaveBeenCalledTimes(2);
 for(const [key,value] of objects)if(key.includes('/telegram-identity/'))objects.set(key,JSON.stringify({...JSON.parse(value),expiresAt:Date.now()-1}));
 await expect(execution.execute('telegram_resolve',{username:'telegram'})).rejects.toThrow('TELEGRAM_RATE_LIMIT');
 expect(service).toHaveBeenCalledTimes(2);
});

it('shares a trusted flood-wait across lookups and post reads, then resumes after expiry',async()=>{
 let stored:string|undefined;
 const get=vi.fn(async()=>stored?{json:async()=>JSON.parse(stored!)}:null);
 const put=vi.fn(async(_key:string,value:string)=>{stored=value;});
 const service=vi.fn(async()=>Response.json({error:'RATE_LIMIT',retryNotBefore:new Date(Date.now()+60_000).toISOString()}));
 const env={SOURCE_EXECUTION_SERVICE:{fetch:service},SOURCE_EXECUTION_URL:'http://127.0.0.1:8791/v1/source-execution',SOURCE_EXECUTION_TOKEN:'test-only-token-'.repeat(3),RAW_ARCHIVE:{get,put}} as unknown as Env;
 await expect(telegramExecution(env).execute('telegram_resolve',{username:'telegram'})).rejects.toThrow('TELEGRAM_RATE_LIMIT');
 await expect(telegramExecution(env).execute('telegram_resolve',{username:'otherchannel'})).rejects.toThrow('TELEGRAM_RATE_LIMIT');
 await expect(telegramExecution(env).execute('telethon',{channelId:'-100123'})).rejects.toThrow('TELEGRAM_RATE_LIMIT');
 expect(service).toHaveBeenCalledTimes(1);expect(put).toHaveBeenCalledTimes(1);
 expect(stored).not.toContain(env.SOURCE_EXECUTION_TOKEN);
 stored=JSON.stringify({retryNotBefore:new Date(Date.now()-1).toISOString()});
 service.mockImplementationOnce(async()=>Response.json({channelId:'-100123',username:'telegram'}));
 expect(await telegramExecution(env).execute('telegram_resolve',{username:'telegram'})).toMatchObject({channelId:'-100123'});
 expect(service).toHaveBeenCalledTimes(2);
});

it('does not turn an invalid channel into a shared account cooldown',async()=>{
 const put=vi.fn();const service=vi.fn(async()=>Response.json({error:'UNAVAILABLE'}));
 const env={SOURCE_EXECUTION_SERVICE:{fetch:service},SOURCE_EXECUTION_URL:'http://127.0.0.1:8791/v1/source-execution',SOURCE_EXECUTION_TOKEN:'test-only-token-'.repeat(3),RAW_ARCHIVE:{get:async()=>null,put}} as unknown as Env;
 expect(await telegramExecution(env).execute('telegram_resolve',{username:'missingchannel'})).toEqual({error:'UNAVAILABLE'});
 expect(put).not.toHaveBeenCalled();
});
