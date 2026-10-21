import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createSourceExecution} from './source-execution.mjs';

// Bind to loopback; expose only through an authenticated TLS reverse proxy/tunnel.
export function createSourceExecutionServer({token,execution,maxConcurrent=2,maxPending=32,queueTimeoutMs=10000}) {
  if(typeof token!=='string'||token.length<32)throw new Error('SOURCE_EXECUTION_TOKEN_REQUIRED');
  if(!Number.isSafeInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>32)throw new Error('INVALID_EXECUTION_CONCURRENCY');
  if(!Number.isSafeInteger(maxPending)||maxPending<0||maxPending>128||!Number.isSafeInteger(queueTimeoutMs)||queueTimeoutMs<1||queueTimeoutMs>30000)throw new Error('INVALID_EXECUTION_QUEUE');
  const expected=Buffer.from(`Bearer ${token}`);let active=0,activeTelegram=0,receiving=0;
  const pending=[];
  const dispatch=()=>{
    for(let i=0;active<maxConcurrent&&i<pending.length;){
      const entry=pending[i];
      if(entry.telegram&&activeTelegram){i++;continue;}
      pending.splice(i,1);clearTimeout(entry.timer);active++;if(entry.telegram)activeTelegram++;
      entry.resolve(true);
    }
  };
  const acquire=telegram=>{
    if(!pending.length&&active<maxConcurrent&&(!telegram||!activeTelegram)){active++;if(telegram)activeTelegram++;return Promise.resolve(true);}
    if(pending.length>=maxPending)return Promise.resolve(false);
    return new Promise(resolve=>{const entry={telegram,resolve,timer:setTimeout(()=>{const index=pending.indexOf(entry);if(index>=0)pending.splice(index,1);resolve(false);},queueTimeoutMs)};pending.push(entry);dispatch();});
  };
  const server=createServer(async(req,res)=>{
    const reply=(status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store',...(status===503?{'retry-after':'5'}:{})});res.end(JSON.stringify(value));};
    const supplied=Buffer.from(req.headers.authorization??'');
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return reply(401,{error:'UNAUTHORIZED'});
    if(req.method!=='POST'||req.url!=='/v1/source-execution')return reply(404,{error:'NOT_FOUND'});
    if(receiving+pending.length+active>=maxConcurrent+maxPending)return reply(503,{error:'BUSY'});
    receiving++;let receivingBody=true,ownsSlot=false,ownsTelegram=false;
    try{
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>8000000){reply(413,{error:'INPUT_TOO_LARGE'});return;}chunks.push(chunk);}
      let request;try{request=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reply(400,{error:'INVALID_REQUEST'});}
      if(!request||!['feedparser','telethon','telegram_resolve','google_resolve','google_feed','public_article','extract','playwright'].includes(request.kind)||
        !request.input||typeof request.input!=='object'||Array.isArray(request.input))return reply(400,{error:'INVALID_REQUEST'});
      const telegram=['telethon','telegram_resolve'].includes(request.kind);
      receiving--;receivingBody=false;
      if(!await acquire(telegram))return reply(503,{error:'BUSY'});
      ownsSlot=true;ownsTelegram=telegram;
      if(res.destroyed)return;
      const result=await execution.execute(request.kind,request.input);
      const data=JSON.stringify(result);
      if(Buffer.byteLength(data)>8000000)return reply(502,{error:'OUTPUT_TOO_LARGE'});
      reply(200,result);
    }catch{return reply(502,{error:'EXECUTION_FAILED'});}finally{if(receivingBody)receiving--;if(ownsSlot)active--;if(ownsTelegram)activeTelegram--;dispatch();}
  });
  server.requestTimeout=70000;server.headersTimeout=10000;server.maxHeadersCount=16;
  return server;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  const port=Number(process.env.SOURCE_EXECUTION_PORT??8790);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('INVALID_PORT');
  const execution=createSourceExecution({python:process.env.SOURCE_EXECUTION_PYTHON,environment:process.env});
  const server=createSourceExecutionServer({token:process.env.SOURCE_EXECUTION_TOKEN,execution});
  server.listen(port,'127.0.0.1',()=>console.log('Source execution listening on loopback'));
}
