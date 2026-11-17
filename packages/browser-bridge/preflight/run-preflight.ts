import {BRIDGE_PREFLIGHT_STAGES,runBridgePreflight,type BridgePreflightStage} from "@distilled/agent-runtime";

/**
 * Runs the synthetic bridge preflight from an operator machine (the same function the production Worker route runs).
 * It proves the bridge, its TLS boundary and its network policy from the outside; it does not prove the Worker's own egress.
 *
 *   BRIDGE_URL           https://<host>/v1/authenticated-browser
 *   SITE_ORIGIN          the synthetic allowed site's public https origin
 *   SELF_HOSTED_BROWSER_BRIDGE_AUTH, PREFLIGHT_IDENTIFIER, PREFLIGHT_PASSWORD   credential and synthetic markers
 *   STAGES               optional comma list (default: all)
 */
const env=(name:string)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value};
const stages=(process.env.STAGES?.split(",").map(stage=>stage.trim()).filter(Boolean)??[...BRIDGE_PREFLIGHT_STAGES]) as BridgePreflightStage[];
const credential=env("SELF_HOSTED_BROWSER_BRIDGE_AUTH");let failed=false;
for(const stage of stages){
  const result=await runBridgePreflight({url:env("BRIDGE_URL"),serviceCredential:credential},{stage,siteOrigin:env("SITE_ORIGIN"),markers:{identifier:env("PREFLIGHT_IDENTIFIER"),password:env("PREFLIGHT_PASSWORD")}}).catch(error=>({stage,pass:false,protocol:"v1" as const,checks:[{name:"preflight run",pass:false,detail:error instanceof Error?error.message:"error"}]}));
  failed||=!result.pass;console.log(JSON.stringify(result));
}
process.exit(failed?1:0);
