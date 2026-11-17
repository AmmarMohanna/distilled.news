/** Metadata-only observations. Attempt completion is never durable publication success. */
export type AgentOpsBoundary = 'fetch' | 'scheduled' | 'queue' | 'investigation';
type Sink = (line: string) => void;
const boundaries = new Set(['fetch','scheduled','queue','investigation']);
export function emitAgentOps(boundary: AgentOpsBoundary, outcome: 'ok'|'error', durationMs: number, sink: Sink = line=>console.info(line)): void {
  try {
    if(!boundaries.has(boundary)||!['ok','error'].includes(outcome)||!Number.isFinite(durationMs)||durationMs<0)return;
    sink(JSON.stringify({schema:'agentops.v1',boundary,outcome,duration_ms:durationMs}));
  } catch { /* Observers must not alter authority, retries, or original exceptions. */ }
}
export async function observeInvocation<T>(boundary: AgentOpsBoundary, work:()=>Promise<T>, sink?:Sink, clock:()=>number=()=>performance.now()):Promise<T> {
  const safeClock=()=>{try{return clock();}catch{return Number.NaN;}};
  const start=safeClock();let outcome:'ok'|'error'='error';
  try { const result=await work();outcome=result instanceof Response&&result.status>=500?'error':'ok';return result; }
  finally { emitAgentOps(boundary,outcome,safeClock()-start,sink); }
}
