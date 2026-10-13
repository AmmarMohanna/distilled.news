/** SSE framing is transport only. Partial text never becomes a model result. */
export async function readStructuredStream(response:Response,onGeneration:(id:string)=>Promise<void>,expectedId?:string):Promise<any>{
 const reader=response.body?.getReader();if(!reader)throw Error('MODEL_EMPTY_RESPONSE');
 const decoder=new TextDecoder();let buffer='',content='',finish:string|undefined,done=false,usage:any,generationId=expectedId,size=0;
 const event=async(raw:string)=>{
  const data=raw.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(!data)return;
  if(data==='[DONE]'){done=true;return}
  if(done)throw Error('MODEL_STREAM_INVALID');
  const chunk=JSON.parse(data);
  if(chunk.id){if(typeof chunk.id!=='string'||generationId&&generationId!==chunk.id)throw Error('MODEL_STREAM_IDENTITY_MISMATCH');if(!generationId){generationId=chunk.id;if(/^gen-[a-zA-Z0-9-]{1,124}$/.test(chunk.id))await onGeneration(chunk.id)}}
  if(chunk.error)throw Error('MODEL_STREAM_PROVIDER_FAILURE');
  if(chunk.choices?.length>1)throw Error('MODEL_STREAM_INVALID');
  const choice=chunk.choices?.[0];if(choice?.delta?.content){if(finish||typeof choice.delta.content!=='string')throw Error('MODEL_STREAM_INVALID');content+=choice.delta.content;size+=new TextEncoder().encode(choice.delta.content).length;if(size>2000000)throw Error('MODEL_RESPONSE_STORAGE_CONTINUATION_REQUIRED')}
  if(choice?.finish_reason){if(finish&&finish!==choice.finish_reason)throw Error('MODEL_STREAM_INVALID');finish=choice.finish_reason}
  if(chunk.usage)usage=chunk.usage;
 };
 try{
  for(;;){const part=await reader.read();if(part.done)break;buffer+=decoder.decode(part.value,{stream:true});
   for(;;){const boundary=/\r?\n\r?\n/.exec(buffer);if(!boundary)break;const raw=buffer.slice(0,boundary.index);buffer=buffer.slice(boundary.index+boundary[0].length);await event(raw)}
   if(buffer.length>2000000)throw Error('MODEL_RESPONSE_STORAGE_CONTINUATION_REQUIRED');
  }
  buffer+=decoder.decode();if(buffer.trim())await event(buffer);
  if(!done||!finish)throw Error('MODEL_STREAM_INCOMPLETE');
  if(!['stop','length','content_filter','tool_calls','function_call'].includes(finish))throw Error('MODEL_STREAM_INVALID');
  return {id:generationId,usage,choices:[{message:{content},finish_reason:finish}]};
 }finally{await reader.cancel().catch(()=>{})}
}
