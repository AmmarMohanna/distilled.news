import {existsSync,mkdtempSync,readdirSync,readFileSync,rmSync,statSync,writeFileSync} from "node:fs";
import type {Server} from "node:http";
import type {AddressInfo} from "node:net";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from "vitest";
import type {AuthenticatedBrowserBridgeRequest,AuthenticatedBrowserSurface} from "@distilled/agent-runtime";
import {AuthenticatedBrowserBridgeService} from "../src/service";
import {createBridgeHttpServer} from "../src/server";
import {SYNTHETIC_COOKIE,SYNTHETIC_IDENTIFIER,SYNTHETIC_PASSWORD,SyntheticAuthAdapter,SyntheticSite,allocate,newFlow} from "./synthetic-site";

const BRIDGE_SECRET="bridge_secret_leak_test_secret_32bytes_!";
const MARKERS={identifier:SYNTHETIC_IDENTIFIER,password:SYNTHETIC_PASSWORD,cookie:SYNTHETIC_COOKIE};
const SECRETS=Object.values(MARKERS).concat(BRIDGE_SECRET);
const leaks=(text:string,allowed:string[]=[])=>SECRETS.filter(secret=>!allowed.includes(secret)&&text.includes(secret));

/**
 * Chromium keeps its (temporary) profile on disk; anything secret written there would be a plaintext persistence leak.
 * This file runs in its own worker process with a private TMP/TEMP/TMPDIR root, so everything created under that root is
 * ours by construction; Chromium instances launched concurrently by other test packages can never be mistaken for it.
 */
const originalTmp={TMPDIR:process.env.TMPDIR,TEMP:process.env.TEMP,TMP:process.env.TMP};
let privateTmp="";
const browserTempDirs=()=>readdirSync(privateTmp).map(name=>join(privateTmp,name));
function scanTree(root:string,budget={files:4000}):string[]{
  const hits:string[]=[];
  const walk=(path:string)=>{if(budget.files--<=0)return;let stat;try{stat=statSync(path)}catch{return}
    if(stat.isDirectory()){try{for(const entry of readdirSync(path))walk(join(path,entry))}catch{}return}
    if(stat.size===0||stat.size>4_000_000)return;let data:Buffer;try{data=readFileSync(path)}catch{return}
    const text=data.toString("latin1");const wide=data.toString("utf16le");
    for(const secret of Object.values(MARKERS))if(text.includes(secret)||wide.includes(secret))hits.push(`${path} contains ${secret.slice(0,18)}…`);
  };
  walk(root);return hits;
}

describe("secret handling across the real bridge (synthetic markers only)",()=>{
  const site=new SyntheticSite();let bridgeServer:Server;let bridgeUrl:string;let service:AuthenticatedBrowserBridgeService;let adapter:SyntheticAuthAdapter;
  let sinks:string[]=[];let restore:Array<()=>void>=[];
  const wire:{requests:string[];responses:string[]}={requests:[],responses:[]};

  beforeAll(async()=>{
    privateTmp=mkdtempSync(join(tmpdir(),"bridge-leak-root-"));process.env.TMPDIR=process.env.TEMP=process.env.TMP=privateTmp;
    await site.start();adapter=new SyntheticAuthAdapter(site.origin);
    service=new AuthenticatedBrowserBridgeService({serviceCredential:BRIDGE_SECRET,allowTestMode:true});bridgeServer=createBridgeHttpServer(service);
    await new Promise<void>(resolve=>bridgeServer.listen(0,"127.0.0.1",resolve));bridgeUrl=`http://127.0.0.1:${(bridgeServer.address() as AddressInfo).port}/v1/authenticated-browser`;
  });
  afterAll(async()=>{await service.shutdown().catch(()=>undefined);await new Promise<void>(resolve=>bridgeServer.close(()=>resolve()));await site.stop();for(const [key,value] of Object.entries(originalTmp)){if(value===undefined)delete process.env[key];else process.env[key]=value}await new Promise(resolve=>setTimeout(resolve,500));try{rmSync(privateTmp,{recursive:true,force:true,maxRetries:10,retryDelay:200})}catch{/* Windows can hold Chromium profile files briefly after exit; the leak assertions already ran */}});
  beforeEach(()=>{
    sinks=[];wire.requests=[];wire.responses=[];
    const capture=(stream:NodeJS.WriteStream)=>{const original=stream.write.bind(stream);(stream as unknown as {write:unknown}).write=(chunk:unknown,...rest:unknown[])=>{sinks.push(String(chunk));return (original as (...args:unknown[])=>boolean)(chunk,...rest)};restore.push(()=>{(stream as unknown as {write:unknown}).write=original})};
    capture(process.stdout);capture(process.stderr);
    for(const method of["log","info","warn","error","debug"] as const){const spy=vi.spyOn(console,method).mockImplementation((...args:unknown[])=>{sinks.push(args.map(arg=>typeof arg==="string"?arg:JSON.stringify(arg)).join(" "))});restore.push(()=>spy.mockRestore())}
  });
  afterEach(()=>{for(const undo of restore.splice(0))undo()});

  /** Records exactly what crosses the wire, without altering it. */
  const recordingFetch:typeof fetch=async(input,init)=>{wire.requests.push(String(init?.body));const response=await fetch(input,init);const text=await response.clone().text();wire.responses.push(text);return response};

  it("keeps identifier, password and cookie markers out of every sink except the two places they are meant to travel",async()=>{
    const flow=newFlow({bridgeUrl,secret:BRIDGE_SECRET,adapter,label:"leak",fetch:recordingFetch});const scope=await allocate(flow);let diskHits:string[]=[];let liveDirs:string[]=[];let observation:AuthenticatedBrowserSurface|undefined;
    try{
      const detection=await flow.executor.establishAuthenticatedSession(scope,adapter,{username:MARKERS.identifier,password:MARKERS.password},undefined,undefined,flow.challenges);
      expect(detection.state).toBe("ACTIVE");
      const state=await flow.executor.exportAuthenticatedSession(scope);
      expect(JSON.stringify(state)).toContain(MARKERS.cookie); // the session is meant to reach the coordinator, and only it
      observation=await flow.transport.execute({protocol:"v1",operationId:"op_final_observe",capability:flow.capability,operation:"OBSERVE_AUTH_SURFACE"}) as AuthenticatedBrowserSurface;
      // While the browser is still live, nothing secret may sit in its on-disk profile.
      liveDirs=browserTempDirs();
      expect(liveDirs.some(dir=>/chromiumdev_profile/.test(dir))).toBe(true); // the scan really is looking at Chromium's live profile
      diskHits=liveDirs.flatMap(dir=>scanTree(dir));
    }finally{await flow.executor.close(scope)}

    // 1. Requests: the secrets travel only inside the two INJECT_AUTH_FIELD calls; never in any other request.
    const injects=wire.requests.filter(body=>(JSON.parse(body) as {operation:string}).operation==="INJECT_AUTH_FIELD");
    expect(injects).toHaveLength(2);
    for(const body of wire.requests.filter(body=>!injects.includes(body)))expect(leaks(body),"non-inject request").toEqual([]);
    const parsed=injects.map(body=>JSON.parse(body) as {fieldKind:string;secretValue:string});
    expect(parsed[0]).toMatchObject({fieldKind:"IDENTIFIER",secretValue:MARKERS.identifier});expect(parsed[1]).toMatchObject({fieldKind:"PASSWORD",secretValue:MARKERS.password});
    // Nothing secret in the URL/headers is possible by construction (the URL is fixed and carries no query); assert the fixed shape.
    expect(new URL(bridgeUrl).search).toBe("");
    // 2. Responses: identifier/password never come back; the cookie marker appears only in the CAPTURE response.
    const captureIndex=wire.requests.findIndex(body=>(JSON.parse(body) as {operation:string}).operation==="CAPTURE_AUTH_STATE");
    wire.responses.forEach((text,index)=>expect(leaks(text,index===captureIndex?[MARKERS.cookie]:[]),`response #${index} (${(JSON.parse(wire.requests[index]) as {operation:string}).operation})`).toEqual([]));
    // 3. Observations, diagnostics, provenance and the coordinator's challenge store.
    expect(leaks(JSON.stringify(observation))).toEqual([]);
    expect(leaks(JSON.stringify([...flow.store.records.values()]))).toEqual([]);
    // 4. Service internals: idempotency records hold outcomes only.
    const executions=(service as unknown as {executions:Map<string,{records:Map<string,unknown>;inflight:Map<string,unknown>}>}).executions;
    for(const execution of executions.values())expect(leaks(JSON.stringify([...execution.records.entries()]))).toEqual([]);
    // 5. Logs: nothing on stdout/stderr/console from the client, service, HTTP server or provider.
    expect(sinks.filter(chunk=>leaks(chunk).length>0)).toEqual([]);
    // 6. Persistence: no secret in Chromium's temp profile while live, and no browser temp state left after close.
    expect(diskHits).toEqual([]);
    await new Promise(resolve=>setTimeout(resolve,500));
    expect(browserTempDirs()).toEqual([]);
  },90_000);

  it("keeps secrets out of failure paths: typed errors, rejected credentials and forced browser errors",async()=>{
    const flow=newFlow({bridgeUrl,secret:BRIDGE_SECRET,adapter,label:"leak-fail",fetch:recordingFetch});const scope=await allocate(flow);const errors:unknown[]=[];
    try{
      await flow.transport.execute({protocol:"v1",operationId:"op_nav",capability:flow.capability,operation:"NAVIGATE_AUTH_ENTRYPOINT"});
      // Stale handle carrying a marker secret: must fail without echoing it.
      errors.push(await flow.transport.execute({protocol:"v1",operationId:"op_stale",capability:flow.capability,operation:"INJECT_AUTH_FIELD",fieldKind:"IDENTIFIER",fieldHandle:"forged",pageRevision:"stale",secretValue:MARKERS.password} as AuthenticatedBrowserBridgeRequest).catch(error=>error));
      // Wrong field kind for a real handle, marker secret in the request.
      const surface=await flow.transport.execute({protocol:"v1",operationId:"op_obs",capability:flow.capability,operation:"OBSERVE_AUTH_SURFACE",wait:"AUTH_SURFACE"}) as AuthenticatedBrowserSurface;
      const username=surface.controls.find(control=>control.label==="Username")!;
      errors.push(await flow.transport.execute({protocol:"v1",operationId:"op_kind",capability:flow.capability,operation:"INJECT_AUTH_FIELD",fieldKind:"PASSWORD",fieldHandle:username.handle,pageRevision:surface.pageRevision,secretValue:MARKERS.identifier} as AuthenticatedBrowserBridgeRequest).catch(error=>error));
      // Replay of an identical signed request (nonce reuse) and a bad signature, both carrying a marker.
      const body=JSON.stringify({protocol:"v1",operationId:"op_bad",capability:flow.capability,operation:"INJECT_AUTH_FIELD",fieldKind:"IDENTIFIER",fieldHandle:"x",pageRevision:"y",secretValue:MARKERS.identifier});
      const bad=await fetch(bridgeUrl,{method:"POST",headers:{"content-type":"application/json","x-distilled-bridge-timestamp":String(Date.now()),"x-distilled-bridge-nonce":"n1","x-distilled-bridge-signature":"00"},body});
      errors.push(await bad.text());
    }finally{await flow.executor.close(scope)}
    const wrong=newFlow({bridgeUrl,secret:BRIDGE_SECRET,adapter,label:"leak-wrong",fetch:recordingFetch});const wrongScope=await allocate(wrong);
    try{errors.push(JSON.stringify(await wrong.executor.establishAuthenticatedSession(wrongScope,adapter,{username:MARKERS.identifier,password:`${MARKERS.password}_WRONG`})))}finally{await wrong.executor.close(wrongScope)}
    const rendered=errors.map(error=>error instanceof Error?`${error.name}:${error.message}:${error.stack??""}:${JSON.stringify(error)}`:String(error)).join("\n");
    expect(leaks(rendered)).toEqual([]);
    expect(leaks(wire.responses.join("\n"))).toEqual([]);
    expect(sinks.filter(chunk=>leaks(chunk).length>0)).toEqual([]);
    expect(errors.filter(error=>error instanceof Error).map(error=>(error as {code?:string}).code)).toEqual(expect.arrayContaining(["BRIDGE_OBSERVATION_STALE","BRIDGE_FENCE_MISMATCH"]));
  },90_000);

  it("keeps the bridge service credential out of requests, responses and logs",async()=>{
    const flow=newFlow({bridgeUrl,secret:BRIDGE_SECRET,adapter,label:"leak-credential",fetch:recordingFetch});const scope=await allocate(flow);
    try{await flow.executor.detectAuthenticatedState(scope,adapter)}finally{await flow.executor.close(scope)}
    expect(wire.requests.concat(wire.responses).filter(text=>text.includes(BRIDGE_SECRET))).toEqual([]);
    expect(sinks.filter(chunk=>chunk.includes(BRIDGE_SECRET))).toEqual([]);
    expect(existsSync(tmpdir())).toBe(true);
  },60_000);

  it("positive control: the on-disk scan detects a planted marker (so a clean result is meaningful)",()=>{
    const dir=mkdtempSync(join(tmpdir(),"bridge-leak-control-"));
    try{writeFileSync(join(dir,"Cookies"),`padding ${MARKERS.cookie} padding`);expect(scanTree(dir)).toHaveLength(1);writeFileSync(join(dir,"utf16"),Buffer.from(MARKERS.password,"utf16le"));expect(scanTree(dir)).toHaveLength(2)}
    finally{rmSync(dir,{recursive:true,force:true})}
  });
});
