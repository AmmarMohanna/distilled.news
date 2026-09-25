import {existsSync,readFileSync} from "node:fs";
import {createServer as createHttpServer,type Server} from "node:http";
import {createServer as createHttpsServer} from "node:https";
import {Readable} from "node:stream";
import {fileURLToPath} from "node:url";
import {AuthenticatedBrowserBridgeService} from "./service";

const LOOPBACK_HOSTS=["127.0.0.1","::1","localhost"];

/** Thin Node adapter: every routing, size, auth and replay decision is made by the service; nothing is written to stdout/stderr per request. */
export function createBridgeHttpServer(service:{handle(request:Request):Promise<Response>},tls?:{cert:string;key:string}):Server{
  const handler=async(req:import("node:http").IncomingMessage,res:import("node:http").ServerResponse)=>{const abort=new AbortController();res.once("close",()=>abort.abort());try{const origin=`http://${req.headers.host??"127.0.0.1"}`;const body=req.method==="POST"?Readable.toWeb(req) as ReadableStream<Uint8Array>:undefined;const response=await service.handle(new Request(new URL(req.url??"/",origin),{method:req.method,headers:req.headers as HeadersInit,body,signal:abort.signal,duplex:"half"} as RequestInit));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))}catch{if(!res.headersSent)res.writeHead(500,{"content-type":"application/json","cache-control":"no-store"});res.end('{"protocol":"v1","ok":false,"error":{"code":"BRIDGE_BROWSER_FAILURE"}}')}};
  const server=tls?createHttpsServer({cert:tls.cert,key:tls.key},handler):createHttpServer(handler);
  server.requestTimeout=60_000;server.headersTimeout=15_000;server.maxHeadersCount=32;server.keepAliveTimeout=5_000;
  return server;
}

export async function chromiumAvailable():Promise<boolean>{try{const packageName="@playwright/test";const {chromium}=await import(packageName);return existsSync(chromium.executablePath())}catch{return false}}

async function runServer(){
  const host=process.env.BROWSER_BRIDGE_HOST?.trim()||"127.0.0.1",port=Number(process.env.BROWSER_BRIDGE_PORT||8789),credential=process.env.SELF_HOSTED_BROWSER_BRIDGE_AUTH?.trim()||"",production=process.env.NODE_ENV==="production",internalOnly=process.env.BROWSER_BRIDGE_INTERNAL_TRANSPORT==="true";
  const certFile=process.env.BROWSER_BRIDGE_TLS_CERT_FILE?.trim(),keyFile=process.env.BROWSER_BRIDGE_TLS_KEY_FILE?.trim();const loopback=LOOPBACK_HOSTS.includes(host);
  if(!credential&&!internalOnly)throw new Error("SELF_HOSTED_BROWSER_BRIDGE_AUTH is required");
  if(!loopback&&!internalOnly&&process.env.BROWSER_BRIDGE_EXPOSE_NETWORK!=="true")throw new Error("network exposure requires BROWSER_BRIDGE_EXPOSE_NETWORK=true");
  if(production&&process.env.BROWSER_BRIDGE_ALLOW_TEST_MODE==="true")throw new Error("production bridge forbids test mode");
  if(!loopback&&!(certFile&&keyFile)&&process.env.BROWSER_BRIDGE_TLS_TERMINATED!=="true")throw new Error("non-loopback bridge requires native TLS (BROWSER_BRIDGE_TLS_CERT_FILE/KEY_FILE) or an explicitly declared TLS-terminating boundary");
  if(production&&!(certFile&&keyFile)&&process.env.BROWSER_BRIDGE_TLS_TERMINATED!=="true")throw new Error("production bridge requires native TLS or an explicitly declared TLS-terminating boundary");
  const service=new AuthenticatedBrowserBridgeService({serviceCredential:credential||"container-internal-only"});
  const handler=(request:Request)=>{const url=new URL(request.url);if(request.method==="GET"&&url.pathname==="/health")return Promise.resolve(new Response("ok",{status:200,headers:{"cache-control":"no-store"}}));return internalOnly?service.handleInternal(request):service.handle(request)};
  const server=createBridgeHttpServer({handle:handler},certFile&&keyFile?{cert:readFileSync(certFile,"utf8"),key:readFileSync(keyFile,"utf8")}:undefined);
  const chromium=await chromiumAvailable();
  server.listen(port,host,()=>console.log(JSON.stringify({provider:"SELF_HOSTED_CHROMIUM",listenMode:internalOnly?"container_internal":loopback?"loopback":"explicit_network",transport:certFile&&keyFile?"native_tls":internalOnly?"container_private":loopback?"loopback_http":"tls_terminated_upstream",authConfigured:!internalOnly,maxSessions:2,chromiumAvailable:chromium?"yes":"no"})));
  let stopping=false;const shutdown=async()=>{if(stopping)return;stopping=true;server.close();await service.shutdown();process.exit(0)};process.once("SIGINT",()=>void shutdown());process.once("SIGTERM",()=>void shutdown());
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  runServer().catch(error=>{console.error(JSON.stringify({provider:"SELF_HOSTED_CHROMIUM",startup:"refused",reason:error instanceof Error?error.message:"unknown"}));process.exit(1)});
}
