import {HttpSourceExecution} from '@distilled/connectors';
import {z} from 'zod';
import type {Env} from './types';

/** Public-channel reads only. Never joins channels or starts an account login. */
export async function telegramVerificationEvidence(env:Env,username:string){
 if(!env.SOURCE_EXECUTION_SERVICE||!env.SOURCE_EXECUTION_URL||!env.SOURCE_EXECUTION_TOKEN)throw new Error('TELEGRAM_NOT_CONFIGURED');
 const execution=new HttpSourceExecution(env.SOURCE_EXECUTION_URL,env.SOURCE_EXECUTION_TOKEN,(value,init)=>env.SOURCE_EXECUTION_SERVICE!.fetch(value,init),true);
 const resolved=await execution.execute('telegram_resolve',{username});
 if(resolved&&typeof resolved==='object'&&'error' in resolved&&['AUTH_REQUIRED','RATE_LIMIT','EXECUTION_FAILED','UNAVAILABLE'].includes(String(resolved.error)))throw new Error(`TELEGRAM_${resolved.error}`);
 const identity=z.object({channelId:z.string().regex(/^-[1-9]\d*$/),username:z.string()}).safeParse(resolved);
 if(!identity.success||identity.data.username.toLowerCase()!==username.toLowerCase())throw new Error('TELEGRAM_IDENTITY_UNVERIFIED');
 const raw=await execution.execute('telethon',{channelId:identity.data.channelId,afterId:0,limit:20});
 const page=z.object({channelId:z.literal(identity.data.channelId),records:z.array(z.object({id:z.number().int().positive(),text:z.string().max(100_000).optional(),publishedAt:z.string().optional(),deleted:z.boolean().optional()})).max(500)}).parse(raw);
 return page.records.filter(item=>!item.deleted&&item.text?.trim()).slice(0,20).map(item=>({
  title:undefined,body:item.text!,publishedAt:item.publishedAt,url:`https://t.me/${identity.data.username}/${item.id}`
 }));
}
