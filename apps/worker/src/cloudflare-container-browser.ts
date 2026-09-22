import {Container} from "@cloudflare/containers";
import {AuthenticatedBrowserBridgeError,BRIDGE_FAILURE_CODES,BRIDGE_MAX_REQUEST_BYTES,BRIDGE_MAX_RESPONSE_BYTES,byteLength,type AuthenticatedBrowserBridgeFailureCode,type AuthenticatedBrowserBridgeRequest,type AuthenticatedBrowserBridgeResponse,type AuthenticatedBrowserBridgeResult} from "@distilled/agent-runtime";
import type {Env} from "./types";
import {containerUnknownOutcome} from "./cloudflare-container-browser-transport";

const INTERNAL_PATH="/v1/internal-authenticated-browser";
const HEALTH_PATH="/health";

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
  enableInternet=true;
  pingEndpoint="container/health";

  async health():Promise<{state:"READY"}|{state:"HTTP_ERROR";status:number}|{state:"UNAVAILABLE"}>{
    try{
      await this.startAndWaitForPorts({ports:8080});
      const response=await this.containerFetch(HEALTH_PATH,{method:"GET"},8080);
      return response.ok?{state:"READY"}:{state:"HTTP_ERROR",status:response.status};
    }catch{return {state:"UNAVAILABLE"};}
  }

  async executeAuthenticatedBrowser(request:AuthenticatedBrowserBridgeRequest):Promise<AuthenticatedBrowserBridgeResult>{
    const body=JSON.stringify(request);if(byteLength(body)>BRIDGE_MAX_REQUEST_BYTES)throw new AuthenticatedBrowserBridgeError("BRIDGE_PAYLOAD_TOO_LARGE");
    let response:Response;try{await this.startAndWaitForPorts({ports:8080});response=await this.containerFetch(INTERNAL_PATH,{method:"POST",headers:{"content-type":"application/json","content-length":String(byteLength(body))},body},8080);}catch{throw new AuthenticatedBrowserBridgeError(containerUnknownOutcome(request.operation))}
    const declared=Number(response.headers.get("content-length")??0);if(declared>BRIDGE_MAX_RESPONSE_BYTES)throw new AuthenticatedBrowserBridgeError(containerUnknownOutcome(request.operation));
    let text:string;try{text=await response.text()}catch{throw new AuthenticatedBrowserBridgeError(containerUnknownOutcome(request.operation))}if(byteLength(text)>BRIDGE_MAX_RESPONSE_BYTES)throw new AuthenticatedBrowserBridgeError(containerUnknownOutcome(request.operation));
    let envelope:Partial<AuthenticatedBrowserBridgeResponse>;try{envelope=JSON.parse(text) as Partial<AuthenticatedBrowserBridgeResponse>}catch{throw new AuthenticatedBrowserBridgeError(containerUnknownOutcome(request.operation))}
    if(envelope?.protocol!=="v1")throw new AuthenticatedBrowserBridgeError(containerUnknownOutcome(request.operation));
    if(envelope.ok===true&&response.ok&&envelope.result!==undefined){if(request.operation==="CLOSE_AUTH_BROWSER")await this.stop().catch(()=>undefined);return envelope.result;}
    if(envelope.ok===false){const code=(envelope.error as {code?:string}|undefined)?.code;if(BRIDGE_FAILURE_CODES.includes(code as AuthenticatedBrowserBridgeFailureCode))throw new AuthenticatedBrowserBridgeError(code as AuthenticatedBrowserBridgeFailureCode);}
    throw new AuthenticatedBrowserBridgeError(containerUnknownOutcome(request.operation));
  }
}

