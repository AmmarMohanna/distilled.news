import {expect,it,vi} from 'vitest';
import {targets} from './scoring';
it('publication metadata discovery preserves candidates without warming unselected semantic bodies',async()=>{
 const revision={id:'r',sourceObservationId:'o',acceptedAt:'2026-10-03T12:00:00Z'},version={id:'v',eventId:'e',version:1,type:'CREATED',title:'Road update',state:'The road reopened.',createdAt:revision.acceptedAt};
 const warm=vi.fn(async()=>{}),tx:any={snapshot:{feed:{id:'feed'}},store:{currentEvidence:async()=>[{revision}],db:{prepare:()=>({bind:()=>({all:async()=>({results:[]})})})}},list:async(kind:string)=>kind==='events'?[{id:'e',currentVersionId:'v'}]:kind==='memberships'?[{eventVersionId:'v',evidenceRevisionId:'r'}]:[],read:async()=>version,preload:async()=>{},preloadSemanticReferences:warm};
 const window={start:'2026-10-03T00:00:00Z',end:'2026-10-04T00:00:00Z',kind:'DAILY' as const};
 const before=await targets(tx,window,true);
 expect(warm).toHaveBeenCalledTimes(1);
 const after=await (targets as any)(tx,window,true,{preloadSemanticReferences:false});
 expect(after).toEqual(before);expect(after[0].eventVersionIds).toEqual(['v']);expect(after[0].evidence).toEqual([revision]);
 expect(warm).toHaveBeenCalledTimes(1);
});
