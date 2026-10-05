import type { SourceExecutionPort } from './platform-providers';

/** Dedicated trusted runtime endpoint. No redirects or credential-bearing diagnostics. */
export class HttpSourceExecution implements SourceExecutionPort {
  private readonly url: string;
  constructor(url:string,private readonly token:string,private readonly dispatch:typeof fetch=fetch,
    allowLoopbackHttp=false,private readonly timeoutMs=65000) {
    const parsed=new URL(url);
    if((parsed.protocol!=='https:'&&!(allowLoopbackHttp&&parsed.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)))||
      parsed.username||parsed.password||parsed.search||parsed.hash||token.length<32)throw new Error('INVALID_SOURCE_EXECUTION_CONFIG');
    this.url=parsed.href;
  }
  async execute(kind:Parameters<SourceExecutionPort['execute']>[0],input:Record<string,unknown>):Promise<unknown> {
    const body=JSON.stringify({kind,input});
    if(new TextEncoder().encode(body).length>8000000)throw new Error('SOURCE_EXECUTION_INPUT_TOO_LARGE');
    const signal=AbortSignal.timeout(this.timeoutMs);
    const response=await this.dispatch(this.url,{method:'POST',redirect:'manual',signal,
      headers:{authorization:`Bearer ${this.token}`,'content-type':'application/json'},body});
    if(response.status!==200){await response.body?.cancel();throw new Error('SOURCE_EXECUTION_UNAVAILABLE');}
    const reader=response.body?.getReader();if(!reader)throw new Error('SOURCE_EXECUTION_INVALID_RESPONSE');
    let size=0;const chunks:Uint8Array[]=[];
    try {
      for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;
        if(size>8000000)throw new Error('SOURCE_EXECUTION_OUTPUT_TOO_LARGE');chunks.push(part.value);}
    }catch(error){void reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new Error('SOURCE_EXECUTION_INVALID_RESPONSE');}
  }
}
