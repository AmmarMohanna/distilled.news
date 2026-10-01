import {parseEnv} from "node:util";
import {existsSync,readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import type {Browser,BrowserContext,Page} from "@playwright/test";

const args=process.argv.slice(2).filter(value=>value!=="--");
if(args.length===1&&args[0]==="--help"){console.log("Usage: node scripts/bootstrap-authenticated-profile-compatible.mjs --profile authenticated_profile_id");process.exit(0)}
if(args.length!==2||args[0]!=="--profile"||!/^authenticated_profile_[a-f0-9]{16,64}$/.test(args[1])){console.error("Usage: node scripts/bootstrap-authenticated-profile-compatible.mjs --profile authenticated_profile_id");process.exit(2)}
const profileId=args[1];
const vars=fileURLToPath(new URL("../../../apps/worker/.dev.vars",import.meta.url));
let configuration:Record<string,string>={};
try{if(existsSync(vars)){const parsed=parseEnv(readFileSync(vars,"utf8"));for(const key of ["WEB_OPERATOR_RUNTIME_URL","AUTH_PROFILE_BOOTSTRAP_TOKEN","WEB_OPERATOR_RUNTIME_TOKEN"])if(parsed[key])configuration[key]=parsed[key]}}catch{console.error("Unable to load operator configuration.");process.exit(1)}
for(const name of ["DEBUG","PWDEBUG"])delete process.env[name];
const {chromium}=await import("@playwright/test");
const endpoint=new URL("/v1/authenticated-profiles/manual-bootstrap",process.env.WEB_OPERATOR_RUNTIME_URL||configuration.WEB_OPERATOR_RUNTIME_URL||"https://distilled.news");
const token=process.env.AUTH_PROFILE_BOOTSTRAP_TOKEN??configuration.AUTH_PROFILE_BOOTSTRAP_TOKEN??process.env.WEB_OPERATOR_RUNTIME_TOKEN??configuration.WEB_OPERATOR_RUNTIME_TOKEN;
const abort=new AbortController();process.once("SIGINT",()=>abort.abort());process.once("SIGTERM",()=>abort.abort());
let browser:Browser|undefined,context:BrowserContext|undefined,requestId:string|undefined,captured=false,verified=false,loginTemporarilyLimited=false;
async function call(body:unknown,signal=abort.signal):Promise<Record<string,any>>{
  const response=await fetch(endpoint,{method:"POST",redirect:"error",signal:AbortSignal.any([signal,AbortSignal.timeout(30_000)]),headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify(body)});
  if(!response.ok)throw new Error("OPERATOR_REQUEST_FAILED");
  return await response.json() as Record<string,any>;
}
async function authenticated(page:Page,active:BrowserContext){
  const [profileLink,accountSwitcher]=await Promise.all([page.locator('[data-testid="AppTabBar_Profile_Link"]').first().isVisible(),page.locator('[data-testid="SideNav_AccountSwitcher_Button"]').first().isVisible()]);
  if(!profileLink||!accountSwitcher)return false;
  return (await active.cookies()).some(cookie=>cookie.name==="auth_token"&&!!cookie.value&&["x.com","twitter.com"].includes(cookie.domain.replace(/^\./,"")));
}
try{
  if(endpoint.protocol!=="https:"||endpoint.username||endpoint.password||!token)throw new Error("CONFIGURATION_REQUIRED");
  const admission=await call({action:"begin",profileId});
  if(typeof admission.requestId!=="string"||typeof admission.expiresAt!=="string")throw new Error("INVALID_ADMISSION");
  requestId=admission.requestId;
  const deadline=Date.parse(admission.expiresAt);if(!Number.isFinite(deadline))throw new Error("INVALID_ADMISSION");
  const browserEnvironment:Record<string,string>={};
  const osVariables=new Set(["PATH","SYSTEMROOT","WINDIR","TEMP","TMP","LOCALAPPDATA","APPDATA","USERPROFILE","HOMEDRIVE","HOMEPATH","PROGRAMFILES","PROGRAMFILES(X86)","HOME","LANG","DISPLAY","WAYLAND_DISPLAY","XDG_RUNTIME_DIR"]);
  for(const [key,value] of Object.entries(process.env))if(value&&osVariables.has(key.toUpperCase()))browserEnvironment[key]=value;
  const launchOptions={channel:"chrome" as const,headless:false,env:browserEnvironment,ignoreDefaultArgs:["--enable-automation"]};
  browser=await chromium.launch(launchOptions);
  context=await browser.newContext({acceptDownloads:false,serviceWorkers:"allow"});
  const page=await context.newPage();page.on("download",download=>{void download.cancel().catch(()=>undefined)});
  await page.goto("https://x.com/i/flow/login",{waitUntil:"domcontentloaded",timeout:30_000});
  console.log("Sign into X once in the visible Chrome window. Complete any account verification there. Waiting up to 10 minutes.");
  while(true){
    if(abort.signal.aborted||Date.now()>=deadline-15_000)throw new Error("MANUAL_LOGIN_CANCELLED_OR_EXPIRED");
    if(await page.getByText(/temporarily limited your login/i).first().isVisible()){loginTemporarilyLimited=true;throw new Error("LOGIN_TEMPORARILY_LIMITED")}
    if(await authenticated(page,context))break;
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  const state=await context.storageState();
  const filtered={cookies:state.cookies.filter(cookie=>["x.com","twitter.com"].includes(cookie.domain.replace(/^\./,""))),origins:state.origins.filter(origin=>["https://x.com","https://twitter.com"].includes(origin.origin))};
  await call({action:"capture",requestId,state:filtered});captured=true;
  await context.close();context=undefined;
  await browser.close();browser=undefined;
  const persisted=await call({action:"restore",requestId});if(!persisted.state)throw new Error("PERSISTED_SESSION_MISSING");
  browser=await chromium.launch(launchOptions);
  context=await browser.newContext({acceptDownloads:false,serviceWorkers:"allow",storageState:persisted.state});
  const freshPage=await context.newPage();await freshPage.goto("https://x.com/home",{waitUntil:"domcontentloaded",timeout:30_000});
  let restored=false;for(let attempt=0;attempt<20;attempt++){if(abort.signal.aborted)throw new Error("CANCELLED");if(await authenticated(freshPage,context)){restored=true;break}await new Promise(resolve=>setTimeout(resolve,1000))}
  const result=await call({action:"verify",requestId,restored});verified=true;
  if(!restored||result.freshContextRestored!==true)throw new Error("RESTORE_FAILED");
  console.log("Encrypted X session persisted and verified in a fresh Chrome context.");
}catch{
  console.error(loginTemporarilyLimited?"X temporarily limited login. Stop sign-in attempts for at least one hour; the encrypted profile was not activated.":"Compatible X bootstrap did not complete. The encrypted profile was not activated.");process.exitCode=1;
}finally{
  if(context)await context.close().catch(()=>undefined);
  if(browser)await browser.close().catch(()=>undefined);
  if(captured&&!verified&&requestId)await call({action:"verify",requestId,restored:false},new AbortController().signal).catch(()=>undefined);
  if(!captured&&requestId)await call({action:"abort",requestId,...(loginTemporarilyLimited?{reason:"LOGIN_TEMPORARILY_LIMITED"}:{})},new AbortController().signal).catch(()=>undefined);
}
