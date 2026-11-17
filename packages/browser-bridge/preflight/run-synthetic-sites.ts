import {createServer} from "node:http";
import {ForeignSite,SyntheticSite} from "./synthetic-sites";

/**
 * Runs the synthetic "allowed" and "foreign" sites for the production bridge preflight.
 * The two site ports are meant to be published over HTTPS by the operator's tunnel; the control/stats endpoint binds to loopback
 * only and is never published. Markers come from the environment and are never printed.
 *
 *   SITE_PORT FOREIGN_PORT CONTROL_PORT  local ports
 *   FOREIGN_PUBLIC_ORIGIN                the foreign site's public https origin (what the allowed site redirects to)
 *   PREFLIGHT_IDENTIFIER / PREFLIGHT_PASSWORD / PREFLIGHT_COOKIE / PREFLIGHT_REDIRECT_MARKER   synthetic TEST_ markers
 */
const env=(name:string)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value};
const identifier=env("PREFLIGHT_IDENTIFIER"),password=env("PREFLIGHT_PASSWORD"),cookie=env("PREFLIGHT_COOKIE"),redirectMarker=env("PREFLIGHT_REDIRECT_MARKER");
for(const value of[identifier,password,cookie,redirectMarker])if(!value.startsWith("TEST_"))throw new Error("preflight markers must be synthetic (TEST_ prefix)");
const foreignOrigin=env("FOREIGN_PUBLIC_ORIGIN");if(new URL(foreignOrigin).protocol!=="https:")throw new Error("FOREIGN_PUBLIC_ORIGIN must be https");

const foreign=await new ForeignSite().start(Number(env("FOREIGN_PORT")));
const site=await new SyntheticSite({identifier,password,cookie,redirectMarker,foreignOrigin}).start(Number(env("SITE_PORT")));
const stats=()=>({
  foreign:{requestsReceived:foreign.hits.length,paths:foreign.hits,redirectMarkerReceived:foreign.bodies.some(body=>body.includes(redirectMarker)),anyPostBodyReceived:foreign.bodies.some(body=>body.length>0)},
  site:{postPaths:site.received.map(entry=>entry.path),identifierReceived:site.received.some(entry=>entry.path==="/login/step1"&&new URLSearchParams(entry.body).get("username")===identifier),passwordReceived:site.received.some(entry=>entry.path==="/login/step2"&&new URLSearchParams(entry.body).get("password")===password)}
});
const control=createServer((req,res)=>{
  if(req.method==="POST"&&req.url==="/reset"){foreign.reset();site.received.length=0}
  else if(!(req.method==="GET"&&req.url==="/stats")){res.writeHead(404);return void res.end()}
  res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify(stats()));
});
await new Promise<void>(resolve=>control.listen(Number(env("CONTROL_PORT")),"127.0.0.1",resolve));
console.log(JSON.stringify({synthetic:"ready",sitePort:Number(env("SITE_PORT")),foreignPort:Number(env("FOREIGN_PORT")),controlPort:Number(env("CONTROL_PORT"))}));
const stop=async()=>{control.close();await Promise.all([site.stop(),foreign.stop()]);process.exit(0)};process.once("SIGINT",()=>void stop());process.once("SIGTERM",()=>void stop());
