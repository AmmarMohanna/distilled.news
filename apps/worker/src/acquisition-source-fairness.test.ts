import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({pending:vi.fn(),enqueue:vi.fn(),sync:vi.fn()}));
vi.mock('./v1-queue-dispatch',async original=>({...await original<any>(),pendingV1Jobs:mocks.pending,enqueueV1:mocks.enqueue}));
vi.mock('./v1-intelligence/product',async original=>({...await original<any>(),synchronizeV1ProductSource:mocks.sync}));
import {dispatchV1Acquisitions} from './v1-downstream-runtime';import type {Env} from './types';
beforeEach(()=>{vi.clearAllMocks();mocks.sync.mockResolvedValue(undefined);mocks.pending.mockImplementation(async(_env,source)=>Array.from({length:5},(_,n)=>({id:source+':'+n})));});
it('shares four available slots across two source backlogs without changing per-source order',async()=>{
 const sent:string[]=[];mocks.enqueue.mockImplementation(async(_e,_k,id)=>{if(sent.length>=4)return false;sent.push(id);return true});
 expect(await dispatchV1Acquisitions({V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'a,b',DB:{}} as Env,new Date('2026-10-27T12:00:00Z'))).toBe(4);
 expect(sent.filter(id=>id.startsWith('a:'))).toEqual(['a:0','a:1']);expect(sent.filter(id=>id.startsWith('b:'))).toEqual(['b:0','b:1']);
});
it('rotates the winning source when repeated relays have only one free slot',async()=>{
 const winners:string[]=[];for(const at of ['2026-10-27T12:00:00Z','2026-10-27T12:00:05Z']){let sent=false;mocks.enqueue.mockImplementation(async(_e,_k,id)=>{if(sent)return false;sent=true;winners.push(id);return true});await dispatchV1Acquisitions({V1_DOWNSTREAM_ENABLED:'true',V1_DOWNSTREAM_FEED_SOURCE_IDS:'a,b',DB:{}} as Env,new Date(at));}
 expect(new Set(winners)).toEqual(new Set(['a:0','b:0']));
});
