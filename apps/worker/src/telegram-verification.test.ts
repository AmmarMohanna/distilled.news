import {it,expect,vi} from 'vitest';
import {telegramVerificationEvidence} from './telegram-verification';
import type {Env} from './types';

function fixture(identity:unknown={channelId:'-100123456',username:'telegram'},page:unknown={channelId:'-100123456',records:[{id:42,text:'Real public update',publishedAt:'2026-10-21T12:00:00Z'},{id:43,text:'Deleted',deleted:true},{id:44,text:''}]}){
 const requests:unknown[]=[];
 const fetch=vi.fn(async(_url:unknown,init:RequestInit)=>{const request=JSON.parse(init.body as string);requests.push(request);return Response.json(request.kind==='telegram_resolve'?identity:page);});
 const env={SOURCE_EXECUTION_URL:'https://execution.example/v1/source-execution',SOURCE_EXECUTION_TOKEN:'test-only-token-'.repeat(3),SOURCE_EXECUTION_SERVICE:{fetch}} as unknown as Env;
 return {env,requests,fetch};
}
it('resolves the signed-in public identity before reading bounded recent posts',async()=>{
 const {env,requests}=fixture();
 expect(await telegramVerificationEvidence(env,'telegram')).toEqual([{body:'Real public update',title:undefined,publishedAt:'2026-10-21T12:00:00Z',url:'https://t.me/telegram/42'}]);
 expect(requests).toEqual([{kind:'telegram_resolve',input:{username:'telegram'}},{kind:'telethon',input:{channelId:'-100123456',afterId:0,limit:20}}]);
});
it.each([{error:'AUTH_REQUIRED'},{channelId:'-100123456',username:'different'}])('does not read posts from an unverified identity: %j',async identity=>{
 const {env,fetch}=fixture(identity);await expect(telegramVerificationEvidence(env,'telegram')).rejects.toThrow('error' in identity?'TELEGRAM_AUTH_REQUIRED':'TELEGRAM_IDENTITY_UNVERIFIED');expect(fetch).toHaveBeenCalledTimes(1);
});
it('rejects posts returned for another channel',async()=>{
 const {env}=fixture(undefined,{channelId:'-100999999',records:[{id:42,text:'wrong channel'}]});
 await expect(telegramVerificationEvidence(env,'telegram')).rejects.toThrow();
});
it('distinguishes an inaccessible channel from a broken runtime',async()=>{
 const {env,fetch}=fixture({error:'UNAVAILABLE'});
 await expect(telegramVerificationEvidence(env,'durov')).rejects.toThrow('TELEGRAM_UNAVAILABLE');expect(fetch).toHaveBeenCalledTimes(1);
});
