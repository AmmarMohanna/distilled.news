import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
export function fixtureServer(fault='none'){
 if(!['none','transient','persistent','invalid-json','redirect'].includes(fault))throw Error('UNKNOWN_FAULT');
 let requests=0;
 return createServer((req,res)=>{
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  const path=req.url;
  if(!['/','/api/explore/feeds','/api/feed/fixture/news','/api/feed/fixture/news/editions/edition-1'].includes(path)){res.writeHead(404);res.end();return;}
  const fail=fault==='persistent'||fault==='transient'&&++requests<=3;
  if(fail){res.writeHead(503);res.end('deterministic fixture outage');return;}
  if(fault==='redirect'){res.writeHead(302,{location:'https://distilled.news'});res.end();return;}
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',path==='/'?'text/html':'application/json');
  if(path==='/')res.end('<!doctype html><title>SIMULATED Distilled reader</title>');
  else if(fault==='invalid-json')res.end('{broken');
  else res.end(JSON.stringify(path==='/api/explore/feeds'?{feeds:[{id:'fixture',visibility:'public'}]}:path.includes('/editions/')?{edition:{id:'edition-1',text:'Synthetic briefing'}}:{briefing:{id:'fixture',visibility:'public'},editions:[{id:'edition-1'}]}));
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const server=fixtureServer(process.env.FIXTURE_FAULT||'none');server.listen(8789,'127.0.0.1',()=>console.log('SIMULATED fixture listening on 127.0.0.1:8789'));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
}
