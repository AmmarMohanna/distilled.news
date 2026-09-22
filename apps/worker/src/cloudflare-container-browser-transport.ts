import {AuthenticatedBrowserBridgeError,BRIDGE_MUTATION_OPERATIONS,type AuthenticatedBrowserBridgeFailureCode,type AuthenticatedBrowserBridgeRequest,type AuthenticatedBrowserBridgeResult,type BrowserBridgeTransport} from "@distilled/agent-runtime";

export interface AuthenticatedBrowserContainerRpc{executeAuthenticatedBrowser(request:AuthenticatedBrowserBridgeRequest):Promise<AuthenticatedBrowserBridgeResult>;health?():Promise<{state:"READY"}|{state:"HTTP_ERROR";status:number}|{state:"UNAVAILABLE";kind:"NO_INSTANCE"|"PORT_NOT_READY"|"START_FAILED"}>}

/** Runtime-neutral typed DO RPC transport; it deliberately has no container fetch, shell, or arbitrary URL API. */
export class CloudflareContainerBrowserBridgeTransport implements BrowserBridgeTransport{
  constructor(private readonly binding:{idFromName(name:string):unknown;get(id:unknown):AuthenticatedBrowserContainerRpc}){}
  async execute(request:AuthenticatedBrowserBridgeRequest){try{return await this.binding.get(this.binding.idFromName(`auth-browser:${request.capability.bridgeExecutionId}`)).executeAuthenticatedBrowser(request)}catch(error){if(error instanceof AuthenticatedBrowserBridgeError)throw error;throw new AuthenticatedBrowserBridgeError(containerUnknownOutcome(request.operation));}}
}
export function containerUnknownOutcome(operation:string):AuthenticatedBrowserBridgeFailureCode{return BRIDGE_MUTATION_OPERATIONS.has(operation)?"BRIDGE_EFFECT_UNKNOWN":"BRIDGE_UNAVAILABLE";}
