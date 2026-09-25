import {Container} from "@cloudflare/containers";
import {AuthenticatedBrowserBridgeError,BRIDGE_FAILURE_CODES,BRIDGE_MAX_REQUEST_BYTES,BRIDGE_MAX_RESPONSE_BYTES,byteLength,type BrowserNetworkPolicyDiagnostic,type AuthenticatedBrowserBridgeFailureCode,type AuthenticatedBrowserBridgeRequest,type AuthenticatedBrowserBridgeResponse,type AuthenticatedBrowserBridgeResult} from "@distilled/agent-runtime";
import type {Env} from "./types";
import {containerUnknownOutcome} from "./cloudflare-container-browser-transport";

const INTERNAL_PATH="http://container/v1/internal-authenticated-browser";
const HEALTH_PATH="http://container/health";

/**
 * A single named DO represents one fenced bridge execution.  It owns no
 * Durable Object storage and intentionally exposes only this typed RPC method;
 * callers cannot address the container's HTTP port or execute arbitrary code.
 */
export class AuthenticatedBrowserContainer extends Container<Env>{
  defaultPort=8080;
  requiredPorts=[8080];
  sleepAfter="60s";
  envVars={NODE_ENV:"production",BROWSER_BRIDGE_INTERNAL_TRANSPORT:"true",BROWSER_BRIDGE_HOST:"0.0.0.0",BROWSER_BRIDGE_PORT:"8080",BROWSER_BRIDGE_TLS_TERMINATED:"true"};
  entrypoint=["pnpm","--filter","@distilled/browser-bridge","exec","tsx","src/server.ts"];
  enableInternet=true;
  pingEndpoint="container/health";

  async health():Promise<{state:"READY"}|{state:"HTTP_ERROR";status:number}|{state:"UNAVAILABLE";kind:"NO_INSTANCE"|"PORT_NOT_READY"|"START_FAILED"}>{
    try{
      await this.startAndWaitForPorts({ports:8080,startOptions:{envVars:this.runtimeEnvVars()}});
      const response=await this.containerFetch(HEALTH_PATH,{method:"GET"},8080);
      return response.ok?{state:"READY"}:{state:"HTTP_ERROR",status:response.status};
    }catch(error){
      const message=error instanceof Error?error.message:"";
      const kind=/no instance|provision|concurrent instance/i.test(message)?"NO_INSTANCE":/port|connect|fetch|timeout|ready/i.test(message)?"PORT_NOT_READY":"START_FAILED";
      console.error("container_health_diagnostic",{errorName:error instanceof Error?error.name:typeof error,errorMessage:message.slice(0,300),kind,targetPort:8080});
      return {state:"UNAVAILABLE",kind};
    }
  }

  async executeAuthenticatedBrowser(request:AuthenticatedBrowserBridgeRequest):Promise<AuthenticatedBrowserBridgeResult>{
    const body=JSON.stringify(request);if(byteLength(body)>BRIDGE_MAX_REQUEST_BYTES)throw new AuthenticatedBrowserBridgeError("BRIDGE_PAYLOAD_TOO_LARGE");
    const unknown=(stage:string,extra?:Record<string,unknown>)=>{console.error("container_bridge_diagnostic",{stage,operation:request.operation,...extra});return new AuthenticatedBrowserBridgeError(containerUnknownOutcome(request.operation))};
    let response:Response;try{await this.startAndWaitForPorts({ports:8080,startOptions:{envVars:this.runtimeEnvVars()}});response=await this.containerFetch(INTERNAL_PATH,{method:"POST",headers:{"content-type":"application/json","content-length":String(byteLength(body))},body},8080);}catch(error){throw unknown("transport_fetch",{errorName:error instanceof Error?error.name:typeof error,errorMessage:error instanceof Error?error.message.slice(0,300):""})}
    const declared=Number(response.headers.get("content-length")??0);if(declared>BRIDGE_MAX_RESPONSE_BYTES)throw unknown("declared_length_exceeded",{declared,status:response.status});
    let text:string;try{text=await response.text()}catch(error){throw unknown("response_text_read",{errorName:error instanceof Error?error.name:typeof error,status:response.status})}if(byteLength(text)>BRIDGE_MAX_RESPONSE_BYTES)throw unknown("actual_length_exceeded",{length:byteLength(text),status:response.status});
    let envelope:Partial<AuthenticatedBrowserBridgeResponse>;try{envelope=JSON.parse(text) as Partial<AuthenticatedBrowserBridgeResponse>}catch(error){throw unknown("json_parse",{errorName:error instanceof Error?error.name:typeof error,status:response.status,length:byteLength(text)})}
    if(envelope?.protocol!=="v1")throw unknown("protocol_mismatch",{status:response.status,protocol:envelope?.protocol,ok:envelope?.ok});
    if(envelope.ok===true&&response.ok&&envelope.result!==undefined){if(request.operation==="CLOSE_AUTH_BROWSER")await this.stop().catch(()=>undefined);return envelope.result;}
    if(envelope.ok===false){const bridgeError=envelope.error as {code?:string;diagnostic?:BrowserNetworkPolicyDiagnostic}|undefined;const code=bridgeError?.code;if(BRIDGE_FAILURE_CODES.includes(code as AuthenticatedBrowserBridgeFailureCode)){console.error("container_bridge_diagnostic",{stage:"typed_bridge_error",operation:request.operation,status:response.status,code,diagnostic:bridgeError?.diagnostic});throw new AuthenticatedBrowserBridgeError(code as AuthenticatedBrowserBridgeFailureCode,bridgeError?.diagnostic)}throw unknown("untyped_bridge_error_code",{status:response.status,code})}
    throw unknown("fallthrough",{status:response.status,ok:envelope.ok,hasResult:envelope.ok===true?envelope.result!==undefined:undefined});
  }
  private runtimeEnvVars(){return {...this.envVars,...(this.env.OPENROUTER_API_KEY?{OPENROUTER_API_KEY:this.env.OPENROUTER_API_KEY}:{})};}
}
