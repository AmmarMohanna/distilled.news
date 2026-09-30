import { parseEnv } from "node:util";
import { existsSync,readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const args=process.argv.slice(2).filter(a=>a!=="--");
let profileId:string|undefined;
if(args.length===1&&args[0]==="--help"){console.log("Usage: corepack pnpm bootstrap:x:manual [--profile authenticated_profile_id]");process.exit(0)}
if(args.length){if(args.length!==2||args[0]!=="--profile"||!/^authenticated_profile_[a-f0-9]{16,64}$/.test(args[1])){console.error("Usage: corepack pnpm bootstrap:x:manual [--profile authenticated_profile_id]");process.exit(2)}profileId=args[1]}

// Only infrastructure configuration is read here. X login happens entirely in Chromium.
const vars=fileURLToPath(new URL("../../../apps/worker/.dev.vars",import.meta.url));
let configuration:Record<string,string>={};
try{if(existsSync(vars)){const parsed=parseEnv(readFileSync(vars,"utf8"));for(const key of ["WEB_OPERATOR_RUNTIME_URL","AUTH_PROFILE_BOOTSTRAP_TOKEN","WEB_OPERATOR_RUNTIME_TOKEN"])if(parsed[key])configuration[key]=parsed[key]}}catch{console.error("Unable to load operator configuration.");process.exit(1)}
// Protocol debug output can contain cookies. Disable it before loading Playwright.
delete process.env.DEBUG;delete process.env.PWDEBUG;
const { chromium }=await import("@playwright/test");
const { SelfHostedChromiumProvider,XAuthenticatedSiteAdapter }=await import("@distilled/agent-runtime");
let endpoint:URL;
try{endpoint=new URL("/v1/authenticated-profiles/manual-bootstrap",process.env.WEB_OPERATOR_RUNTIME_URL||configuration.WEB_OPERATOR_RUNTIME_URL||"https://distilled.news")}catch{console.error("Invalid operator endpoint configuration.");process.exit(1)}
const token=process.env.AUTH_PROFILE_BOOTSTRAP_TOKEN??configuration.AUTH_PROFILE_BOOTSTRAP_TOKEN??process.env.WEB_OPERATOR_RUNTIME_TOKEN??configuration.WEB_OPERATOR_RUNTIME_TOKEN;
const abort=new AbortController();process.once("SIGINT",()=>abort.abort());process.once("SIGTERM",()=>abort.abort());
const adapter=new XAuthenticatedSiteAdapter(true);
// Chromium gets only OS/display settings, never the operator token or keyring.
const browserEnvironment:Record<string,string>={};
const osVariables=new Set(["PATH","SYSTEMROOT","WINDIR","TEMP","TMP","LOCALAPPDATA","APPDATA","USERPROFILE","HOMEDRIVE","HOMEPATH","PROGRAMFILES","PROGRAMFILES(X86)","HOME","LANG","DISPLAY","WAYLAND_DISPLAY","XDG_RUNTIME_DIR"]);
for(const [key,value] of Object.entries(process.env))if(value&&osVariables.has(key.toUpperCase()))browserEnvironment[key]=value;
const browser=new SelfHostedChromiumProvider({launchBrowser:options=>chromium.launch({...options,headless:false,env:browserEnvironment})});
let scope:Awaited<ReturnType<typeof browser.allocate>>|undefined;
let requestId:string|undefined,captured=false,verified=false;
async function call(body:unknown,signal=abort.signal):Promise<Record<string,any>>{
  const response=await fetch(endpoint,{method:"POST",redirect:"error",signal:AbortSignal.any([signal,AbortSignal.timeout(30_000)]),headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify(body)});
  if(!response.ok)throw new Error("OPERATOR_REQUEST_FAILED");
  return await response.json() as Record<string,any>;
}
try{
  if(endpoint.protocol!=="https:"||endpoint.username||endpoint.password||!token)throw new Error("CONFIGURATION_REQUIRED");
  const admission=await call({action:"begin",...(profileId?{profileId}:{})});
  if(typeof admission.requestId!=="string"||typeof admission.tenantId!=="string"||typeof admission.expiresAt!=="string")throw new Error("INVALID_ADMISSION");
  requestId=admission.requestId;
  const deadline=Date.parse(admission.expiresAt);if(!Number.isFinite(deadline))throw new Error("INVALID_ADMISSION");
  scope=await browser.allocate({runId:requestId!,tenantId:admission.tenantId,generation:1,allowedOrigins:[...adapter.authenticationNetworkOrigins],signal:abort.signal});
  await browser.navigateAuthenticationEntrypoint(scope,adapter.authenticationEntryPoint.url,[...adapter.authenticationWriteOrigins]);
  console.log("Sign into X in the visible browser. Complete any verification there. Waiting up to 10 minutes.");
  const recorded=new Set<string>();
  while(true){
    if(abort.signal.aborted||Date.now()>=deadline-10_000)throw new Error("MANUAL_LOGIN_CANCELLED_OR_EXPIRED");
    const detection=await browser.detectAuthenticatedState(scope,adapter);
    if(detection.state==="ACTIVE")break;
    const kind=detection.challengeKind??(detection.state==="MFA_REQUIRED"?"MFA":detection.state==="CHALLENGE_REQUIRED"?"UNKNOWN":undefined);
    if(kind&&!recorded.has(kind)){await call({action:"challenge",requestId,kind});recorded.add(kind)}
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  const state=await browser.exportAuthenticatedSession(scope);
  const filtered={cookies:state.cookies.filter(c=>["x.com","twitter.com"].includes(c.domain.replace(/^\./,""))),origins:state.origins.filter(o=>adapter.allowedOrigins.includes(o.origin as "https://x.com"|"https://twitter.com"))};
  await call({action:"capture",requestId,state:filtered});captured=true;
  await browser.close(scope);scope=undefined;
  const persisted=await call({action:"restore",requestId});
  if(!persisted.state)throw new Error("PERSISTED_SESSION_MISSING");
  scope=await browser.allocate({runId:requestId!,tenantId:admission.tenantId,generation:2,allowedOrigins:[...adapter.authenticationNetworkOrigins],signal:abort.signal});
  await browser.attachAuthenticatedSession(scope,persisted.state);
  await browser.navigate(scope,"https://x.com/home");
  // Re-observe after hydration; a redirect to a login surface never passes.
  let restored=false;
  for(let attempt=0;attempt<15;attempt++){
    if(abort.signal.aborted)throw new Error("CANCELLED");
    const detection=await browser.detectAuthenticatedState(scope,adapter);
    const fresh=await browser.exportAuthenticatedSession(scope);
    if(detection.state==="ACTIVE"&&fresh.cookies.some(c=>c.name==="auth_token"&&c.value&&["x.com","twitter.com"].includes(c.domain.replace(/^\./,"")))){restored=true;break}
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  const result=await call({action:"verify",requestId,restored});verified=true;
  if(!restored||result.freshContextRestored!==true)throw new Error("RESTORE_FAILED");
  console.log("Encrypted X session persisted. Fresh browser context restored successfully. Profile is ready for acquisition.");
}catch{
  // Never print provider errors, response bodies, URLs, state, or stack traces.
  console.error("Manual bootstrap did not complete. Check Worker deployment and operator configuration, or retry login. New sessions are enabled only after restore verification.");process.exitCode=1;
}finally{
  if(scope)await browser.close(scope).catch(()=>undefined);
  if(captured&&!verified&&requestId)await call({action:"verify",requestId,restored:false},new AbortController().signal).catch(()=>undefined);
  if(!captured&&requestId)await call({action:"abort",requestId},new AbortController().signal).catch(()=>undefined);
}
