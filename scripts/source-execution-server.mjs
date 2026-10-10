import {createServer} from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createSourceExecution} from './source-execution.mjs';

// Bind to loopback; expose only through an authenticated TLS reverse proxy/tunnel.
export function createSourceExecutionServer({token,execution,maxConcurrent=2}) {
  if(typeof token!=='string'||token.length<32)throw new Error('SOURCE_EXECUTION_TOKEN_REQUIRED');
  const expected=Buffer.from(`Bearer ${token}`);let active=0;
  const server=createServer(async(req,res)=>{
    const reply=(status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
    const supplied=Buffer.from(req.headers.authorization??'');
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return reply(401,{error:'UNAUTHORIZED'});
    if(req.method!=='POST'||req.url!=='/v1/source-execution')return reply(404,{error:'NOT_FOUND'});
    if(active>=maxConcurrent)return reply(503,{error:'BUSY'});
    active++;
    try{
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>8000000){reply(413,{error:'INPUT_TOO_LARGE'});return;}chunks.push(chunk);}
      let request;try{request=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reply(400,{error:'INVALID_REQUEST'});}
      if(!request||!['feedparser','telethon','telegram_resolve','google_resolve','extract','playwright'].includes(request.kind)||
        !request.input||typeof request.input!=='object'||Array.isArray(request.input))return reply(400,{error:'INVALID_REQUEST'});
      const result=await execution.execute(request.kind,request.input);
      const data=JSON.stringify(result);
      if(Buffer.byteLength(data)>8000000)return reply(502,{error:'OUTPUT_TOO_LARGE'});
      reply(200,result);
    }catch{return reply(502,{error:'EXECUTION_FAILED'});}finally{active--;}
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
