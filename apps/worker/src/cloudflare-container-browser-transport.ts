import {AuthenticatedBrowserBridgeError,BRIDGE_FAILURE_CODES,BRIDGE_MUTATION_OPERATIONS,type BrowserNetworkPolicyDiagnostic,type AuthenticatedBrowserBridgeFailureCode,type AuthenticatedBrowserBridgeRequest,type AuthenticatedBrowserBridgeResult,type BrowserBridgeTransport} from "@distilled/agent-runtime";

export interface AuthenticatedBrowserContainerRpc{executeAuthenticatedBrowser(request:AuthenticatedBrowserBridgeRequest):Promise<AuthenticatedBrowserBridgeResult>;health?():Promise<{state:"READY"}|{state:"HTTP_ERROR";status:number}|{state:"UNAVAILABLE";kind:"NO_INSTANCE"|"PORT_NOT_READY"|"START_FAILED"}>}

/** Runtime-neutral typed DO RPC transport; it deliberately has no container fetch, shell, or arbitrary URL API. */
export class CloudflareContainerBrowserBridgeTransport implements BrowserBridgeTransport{
  constructor(private readonly binding:{idFromName(name:string):unknown;get(id:unknown):AuthenticatedBrowserContainerRpc}){}
  async execute(request:AuthenticatedBrowserBridgeRequest){try{return await this.binding.get(this.binding.idFromName(`auth-browser:${request.capability.bridgeExecutionId}`)).executeAuthenticatedBrowser(request)}catch(error){
    const isInstance=error instanceof AuthenticatedBrowserBridgeError;
    const rawCode=error&&typeof error==="object"&&"code"in error?(error as {code?:unknown}).code:undefined;
    console.error("container_rpc_boundary_diagnostic",{operation:request.operation,isInstance,errorName:error instanceof Error?error.name:typeof error,rawCode:typeof rawCode==="string"?rawCode:typeof rawCode});
    if(isInstance)throw error;
    if(typeof rawCode==="string"&&(BRIDGE_FAILURE_CODES as readonly string[]).includes(rawCode)){const diagnostic=error&&typeof error==="object"&&"diagnostic"in error?(error as {diagnostic?:BrowserNetworkPolicyDiagnostic}).diagnostic:undefined;throw new AuthenticatedBrowserBridgeError(rawCode as AuthenticatedBrowserBridgeFailureCode,diagnostic);}
    throw new AuthenticatedBrowserBridgeError(containerUnknownOutcome(request.operation));
  }}
}
export function containerUnknownOutcome(operation:string):AuthenticatedBrowserBridgeFailureCode{return BRIDGE_MUTATION_OPERATIONS.has(operation)?"BRIDGE_EFFECT_UNKNOWN":"BRIDGE_UNAVAILABLE";}
