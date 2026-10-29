import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createSourceExecution} from './source-execution.mjs';

// Bind to loopback; expose only through an authenticated TLS reverse proxy/tunnel.
export function createSourceExecutionServer({token,execution,maxConcurrent=2,telegramQueueMs=0}) {
  if(typeof token!=='string'||token.length<32)throw new Error('SOURCE_EXECUTION_TOKEN_REQUIRED');
  if(!Number.isSafeInteger(maxConcurrent)||maxConcurrent<1||maxConcurrent>32)throw new Error('INVALID_EXECUTION_CONCURRENCY');
  if(!Number.isSafeInteger(telegramQueueMs)||telegramQueueMs<0||telegramQueueMs>30000)throw new Error('INVALID_TELEGRAM_QUEUE_TIMEOUT');
  const expected=Buffer.from(`Bearer ${token}`);let active=0,activeTelegram=0,sequence=0;
  const requests=new Map();
  const telegramWaiters=[];
  const acquireTelegram=()=>{
    if(!activeTelegram){activeTelegram=1;return Promise.resolve(true);}
    if(!telegramQueueMs)return Promise.resolve(false);
    return new Promise(resolve=>{
      const grant=()=>{clearTimeout(timer);resolve(true);};
      const timer=setTimeout(()=>{const index=telegramWaiters.indexOf(grant);if(index>=0)telegramWaiters.splice(index,1);resolve(false);},telegramQueueMs);
      telegramWaiters.push(grant);
    });
  };
  const releaseTelegram=()=>{const next=telegramWaiters.shift();if(next)next();else activeTelegram=0;};
  const server=createServer(async(req,res)=>{
    const reply=(status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store',...(status===503?{'retry-after':'5'}:{})});res.end(JSON.stringify(value));};
    const supplied=Buffer.from(req.headers.authorization??'');
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return reply(401,{error:'UNAUTHORIZED'});
    if(req.method==='GET'&&req.url==='/v1/source-execution/status')return reply(200,{active,maxConcurrent,activeTelegram,telegramWaiting:telegramWaiters.length,requests:[...requests.values()].map(r=>({kind:r.kind,phase:r.phase,elapsedMs:Date.now()-r.startedAt}))});
    if(req.method!=='POST'||req.url!=='/v1/source-execution')return reply(404,{error:'NOT_FOUND'});
    if(active>=maxConcurrent)return reply(503,{error:'BUSY'});
    active++;
    const requestId=++sequence,activity={kind:'unparsed',phase:'READING_INPUT',startedAt:Date.now()};requests.set(requestId,activity);
    let ownsTelegram=false;
    try{
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>8000000){reply(413,{error:'INPUT_TOO_LARGE'});return;}chunks.push(chunk);}
      let request;try{request=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reply(400,{error:'INVALID_REQUEST'});}
      if(!request||!['feedparser','telethon','telegram_resolve','google_resolve','google_feed','public_article','extract','playwright'].includes(request.kind)||
        !request.input||typeof request.input!=='object'||Array.isArray(request.input))return reply(400,{error:'INVALID_REQUEST'});
      if(['telethon','telegram_resolve'].includes(request.kind)){
        // One MTProto session must not be written by parallel Python clients.
        if(!await acquireTelegram())return reply(503,{error:'BUSY'});
        ownsTelegram=true;
      }
      activity.kind=request.kind;activity.phase='EXECUTING';
      const result=await execution.execute(request.kind,request.input);
      const data=JSON.stringify(result);
      if(Buffer.byteLength(data)>8000000)return reply(502,{error:'OUTPUT_TOO_LARGE'});
      reply(200,result);
    }catch{return reply(502,{error:'EXECUTION_FAILED'});}finally{active--;requests.delete(requestId);if(ownsTelegram)releaseTelegram();}
  });
  server.requestTimeout=70000;server.headersTimeout=10000;server.maxHeadersCount=16;
  return server;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  const port=Number(process.env.SOURCE_EXECUTION_PORT??8790);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('INVALID_PORT');
  const execution=createSourceExecution({python:process.env.SOURCE_EXECUTION_PYTHON,environment:process.env});
  const server=createSourceExecutionServer({token:process.env.SOURCE_EXECUTION_TOKEN,execution,
    maxConcurrent:Number(process.env.SOURCE_EXECUTION_MAX_CONCURRENT??2),telegramQueueMs:Number(process.env.SOURCE_EXECUTION_TELEGRAM_QUEUE_MS??0)});
  server.listen(port,'127.0.0.1',()=>console.log('Source execution listening on loopback'));
}
