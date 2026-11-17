import {HttpSourceExecution} from '@distilled/connectors';
import {sha256} from '@distilled/contracts';
import type {Env} from './types';

/** The trusted runtime supplies Telegram's account-wide flood-wait deadline.
 * Share that cooldown across requests, without storing session credentials. */
export function telegramExecution(env:Env){
 if(!env.SOURCE_EXECUTION_SERVICE||!env.SOURCE_EXECUTION_URL||!env.SOURCE_EXECUTION_TOKEN)throw Error('TELEGRAM_NOT_CONFIGURED');
 const execution=new HttpSourceExecution(env.SOURCE_EXECUTION_URL,env.SOURCE_EXECUTION_TOKEN,(value,init)=>env.SOURCE_EXECUTION_SERVICE!.fetch(value,init),true);
 return {async execute(kind:'telegram_resolve'|'telethon',input:Record<string,unknown>,bounds?:{timeoutMs?:number}){
  const key='telegram-verification-backoff/v1/'+await sha256(env.SOURCE_EXECUTION_URL+'\n'+env.SOURCE_EXECUTION_TOKEN)+'.json';
  const username=kind==='telegram_resolve'&&typeof input.username==='string'?input.username.toLowerCase():undefined;
  const identityKey=username?'source-assessment-cache/v1/telegram-identity/'+await sha256(env.SOURCE_EXECUTION_URL+'\n'+env.SOURCE_EXECUTION_TOKEN+'\n'+username)+'.json':undefined;
  const identity=(value:unknown):value is {channelId:string;username:string}=>!!value&&typeof value==='object'&&'channelId' in value&&typeof value.channelId==='string'&&/^-[1-9]\d*$/.test(value.channelId)&&'username' in value&&typeof value.username==='string'&&value.username.toLowerCase()===username&&!('error' in value);
  // A recent exact username/numeric-ID receipt is sufficient for immediate
  // approval. It grants no post-read authority and never bypasses a flood wait
  // for a new identity or actual collection.
  if(identityKey)try{
   const cached=await env.RAW_ARCHIVE?.get(identityKey);
   if(cached){const value=await cached.json<{expiresAt:number;identity:unknown}>();if(value.expiresAt>Date.now()&&value.expiresAt<=Date.now()+300_000&&identity(value.identity))return value.identity;}
  }catch{/* Without a valid receipt, the runtime must resolve the identity. */}
  let retryNotBefore:string|undefined;
  try{const cached=await env.RAW_ARCHIVE?.get(key);if(cached){const value=await cached.json<{retryNotBefore?:string}>();if(typeof value.retryNotBefore==='string'&&Date.parse(value.retryNotBefore)>Date.now())retryNotBefore=value.retryNotBefore;}}catch{/* The runtime still enforces its own limit. */}
  if(retryNotBefore)throw Object.assign(Error('TELEGRAM_RATE_LIMIT'),{retryNotBefore});
  const result=await execution.execute(kind,input,bounds);
  if(result&&typeof result==='object'&&'error' in result&&result.error==='RATE_LIMIT'){
   if('retryNotBefore' in result&&typeof result.retryNotBefore==='string'&&Date.parse(result.retryNotBefore)>Date.now())retryNotBefore=new Date(result.retryNotBefore).toISOString();
   if(retryNotBefore)try{await env.RAW_ARCHIVE?.put(key,JSON.stringify({retryNotBefore}),{httpMetadata:{contentType:'application/json'}});}catch{/* Never accept a rate-limited result if persisting the cooldown fails. */}
   throw Object.assign(Error('TELEGRAM_RATE_LIMIT'),{retryNotBefore});
  }
  if(identityKey&&identity(result))try{await env.RAW_ARCHIVE?.put(identityKey,JSON.stringify({expiresAt:Date.now()+300_000,identity:{channelId:result.channelId,username:result.username}}),{httpMetadata:{contentType:'application/json'}});}catch{/* A cache failure cannot fabricate an identity. */}
  return result;
 }};
}
