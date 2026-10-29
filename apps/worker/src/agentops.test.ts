import {describe,it,expect} from 'vitest';
import {observeInvocation,emitAgentOps} from './agentops';
describe('AgentOps boundary',()=>{
 it('preserves result and emits only bounded metadata',async()=>{
  const rows:string[]=[];let t=10;
  const result=await observeInvocation('scheduled',async()=>42,s=>rows.push(s),()=>t+=5);
  expect(result).toBe(42);expect(JSON.parse(rows[0])).toMatchObject({schema:'agentops.v1',boundary:'scheduled',outcome:'ok',duration_ms:5});
  expect(rows[0]).not.toMatch(/token|feed|cookie|request|payload/);
 });
 it('does not let broken telemetry change success or original failure',async()=>{
  const sink=()=>{throw Error('observer')};
  expect(await observeInvocation('fetch',async()=>7,sink)).toBe(7);
  const original=Error('private content');
  await expect(observeInvocation('queue',async()=>{throw original},sink)).rejects.toBe(original);
 });
 it('does not log exception messages or arbitrary labels',async()=>{
  const rows:string[]=[];
  await expect(observeInvocation('queue',async()=>{throw Error('secret')},s=>rows.push(s))).rejects.toThrow('secret');
  expect(rows[0]).not.toContain('secret');expect(JSON.parse(rows[0]).outcome).toBe('error');
  emitAgentOps('fetch','ok',Infinity,s=>rows.push(s));expect(rows).toHaveLength(1);
 });
});
