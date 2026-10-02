import { createServer,type IncomingMessage,type Server,type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { BrowserNavigationError,SelfHostedChromiumProvider } from "../src";

/**
 * Chromium follows redirects inside its network stack, so context.route() never sees a redirect hop. These tests assert the
 * property that matters: a redirect to a non-admitted origin is failed BEFORE it is followed, i.e. the foreign server
 * receives ZERO requests (not merely that the navigation is reported as denied afterwards).
 */
const listen=(handler:(req:IncomingMessage,res:ServerResponse)=>void)=>new Promise<Server>(resolve=>{const server=createServer(handler);server.listen(0,"127.0.0.1",()=>resolve(server))});
const originOf=(server:Server,host="127.0.0.1")=>`http://${host}:${(server.address() as AddressInfo).port}`;
const html=(res:ServerResponse,body:string,status=200)=>{res.writeHead(status,{"content-type":"text/html"});res.end(`<!DOCTYPE html><html><head><title>t</title></head><body>${body}</body></html>`)};

describe("pre-dispatch redirect-hop enforcement",()=>{
  const foreign={hits:[] as string[],bodies:[] as string[]};
  const admittedFrameHits:string[]=[];
  let foreignServer:Server,siteServer:Server,siblingServer:Server;let foreignOrigin:string,siteOrigin:string,siblingOrigin:string,siblingLocalhost:string;
  let provider:SelfHostedChromiumProvider;

  beforeAll(async()=>{
    foreignServer=await listen((req,res)=>{foreign.hits.push(`${req.method} ${req.url}`);const chunks:Buffer[]=[];req.on("data",chunk=>chunks.push(chunk));req.on("end",()=>{foreign.bodies.push(Buffer.concat(chunks).toString());html(res,"<h1>FOREIGN_PAGE</h1>")})});
    foreignOrigin=originOf(foreignServer);
    siblingServer=await listen((req,res)=>{if(req.url==="/to-foreign"){res.writeHead(302,{location:`${foreignOrigin}/from-sibling`});return void res.end()}html(res,"<p>SIBLING_OK</p>")});
    siblingOrigin=originOf(siblingServer);siblingLocalhost=originOf(siblingServer,"localhost");
    siteServer=await listen((req,res)=>{
      const url=new URL(req.url??"/","http://x");
      const redirect=(status:number,location:string)=>{res.writeHead(status,{location});res.end()};
      switch(url.pathname){
        case"/to-foreign":return redirect(302,`${foreignOrigin}/from-get`);
        case"/hop1":return redirect(302,"/hop2");
        case"/hop2":return redirect(302,`${foreignOrigin}/from-chain`);
        case"/old":return redirect(302,"/new");
        case"/new":return html(res,"<p>ALLOWED_DESTINATION</p>");
        case"/sibling-hop":return redirect(302,`${siblingOrigin}/landing`);
        case"/data-scheme":return redirect(302,"data:text/html,<h1>DATA_PAGE</h1>");
        case"/relative-escape":return redirect(302,`//127.0.0.1:${(foreignServer.address() as AddressInfo).port}/from-protocol-relative`);
        case"/form":return html(res,`<form id="f" method="POST" action="/post-307"><input name="password" value="TEST_PASSWORD_SECRET_redirect"></form><script>document.getElementById("f").submit()</script>`);
        case"/post-307":return redirect(307,`${foreignOrigin}/from-post`);
        case"/frame":return html(res,`<iframe src="/to-foreign"></iframe><p>FRAME_PARENT</p>`);
        case"/allowed-frame":return html(res,`<iframe src="/allowed-frame-child"></iframe><p>FRAME_PARENT</p>`);
        case"/allowed-frame-child":admittedFrameHits.push(req.url??"");return html(res,"<p>ALLOWED_FRAME_CHILD</p>");
        case"/oopif":return html(res,`<iframe src="${siblingLocalhost}/to-foreign"></iframe><p>OOPIF_PARENT</p>`);
        default:return html(res,"<p>SITE</p>");
      }
    });
    siteOrigin=originOf(siteServer);
    provider=SelfHostedChromiumProvider.forTest();
  });
  afterAll(async()=>{for(const server of[foreignServer,siteServer,siblingServer])await new Promise<void>(resolve=>server.close(()=>resolve()))});

  const session=async(runId:string,allowed:string[])=>{const scope=await provider.allocate({runId,tenantId:"tenant",generation:1,allowedOrigins:allowed});return scope};
  const visit=async(scope:Awaited<ReturnType<typeof session>>,url:string,writes:string[]=[siteOrigin])=>{foreign.hits.length=0;foreign.bodies.length=0;await provider.navigateAuthenticationEntrypoint(scope,url,writes)};
  const settle=()=>new Promise(resolve=>setTimeout(resolve,600));

  it("fails a redirect to a foreign origin before it is followed: the foreign server receives no request",async()=>{
    const scope=await session("hop-get",[siteOrigin]);
    try{
      await expect(visit(scope,`${siteOrigin}/to-foreign`)).rejects.toMatchObject({code:"NETWORK_POLICY_DENIED"});
      await settle();expect(foreign.hits).toEqual([]);
      expect((await provider.observeAuthenticationSurface(scope)).visibleText).not.toContain("FOREIGN_PAGE");
    }finally{await provider.close(scope)}
  },60_000);

  it("validates every hop of a chain, not just the first",async()=>{
    const scope=await session("hop-chain",[siteOrigin]);
    try{
      await expect(visit(scope,`${siteOrigin}/hop1`)).rejects.toBeInstanceOf(BrowserNavigationError);
      await settle();expect(foreign.hits).toEqual([]);
    }finally{await provider.close(scope)}
  },60_000);

  it("fails redirects to disallowed schemes and protocol-relative escapes",async()=>{
    const scope=await session("hop-schemes",[siteOrigin]);
    try{
      await expect(visit(scope,`${siteOrigin}/data-scheme`)).rejects.toMatchObject({code:"NETWORK_POLICY_DENIED"});
      await expect(visit(scope,`${siteOrigin}/relative-escape`)).rejects.toMatchObject({code:"NETWORK_POLICY_DENIED"});
      await settle();expect(foreign.hits).toEqual([]);
    }finally{await provider.close(scope)}
  },60_000);

  it("does not re-send a POST body to a foreign origin on a 307 redirect",async()=>{
    const scope=await session("hop-post",[siteOrigin]);
    try{
      // The page auto-submits a credential-bearing POST; the server answers 307 to a foreign origin. The hop is denied during the navigation.
      await expect(visit(scope,`${siteOrigin}/form`)).rejects.toMatchObject({code:"NETWORK_POLICY_DENIED"});
      await settle();
      expect(foreign.hits).toEqual([]);expect(foreign.bodies.join("")).not.toContain("TEST_PASSWORD_SECRET_redirect");
      expect((await provider.observeAuthenticationSurface(scope).catch(()=>({visibleText:""}))).visibleText).not.toContain("FOREIGN_PAGE");
    }finally{await provider.close(scope)}
  },60_000);

  it("blocks a foreign redirect issued by a subframe navigation",async()=>{
    const scope=await session("hop-frame",[siteOrigin]);
    try{await visit(scope,`${siteOrigin}/frame`);await settle();expect(foreign.hits).toEqual([])}finally{await provider.close(scope)}
  },60_000);

  it("allows an admitted child frame in the same page",async()=>{
    admittedFrameHits.length=0;
    const scope=await session("allowed-frame",[siteOrigin]);
    try{await visit(scope,`${siteOrigin}/allowed-frame`);await settle();expect(admittedFrameHits).toContain("/allowed-frame-child")}finally{await provider.close(scope)}
  },60_000);

  it("blocks a foreign redirect issued from a cross-site (out-of-process) iframe",async()=>{
    const scope=await session("hop-oopif",[siteOrigin,siblingLocalhost]);
    try{await visit(scope,`${siteOrigin}/oopif`,[siteOrigin,siblingLocalhost]);await settle();expect(foreign.hits).toEqual([])}finally{await provider.close(scope)}
  },60_000);

  it("still follows redirects to admitted origins, same-origin and cross-origin",async()=>{
    const scope=await session("hop-allowed",[siteOrigin,siblingOrigin]);
    try{
      await visit(scope,`${siteOrigin}/old`,[siteOrigin]);
      expect(await provider.observeAuthenticationSurface(scope)).toMatchObject({url:`${siteOrigin}/new`,visibleText:expect.stringContaining("ALLOWED_DESTINATION")});
      await visit(scope,`${siteOrigin}/sibling-hop`,[siteOrigin]);
      expect((await provider.observeAuthenticationSurface(scope)).url).toBe(`${siblingOrigin}/landing`);
      expect(foreign.hits).toEqual([]);
    }finally{await provider.close(scope)}
  },60_000);
});
