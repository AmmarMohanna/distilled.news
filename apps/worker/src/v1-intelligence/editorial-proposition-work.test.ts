import {expect,it} from 'vitest';
import {deferPropositionWork,resolvePropositionWork} from './editorial-proposition-work';
it('retains independent material work until exact edition prose and compatible acceptance exist',async()=>{
 const docs=new Map<string,any>();const tx:any={snapshot:{feed:{id:'f'}},read:async(k:string,id:string)=>docs.get(k+id),write:async(k:string,id:string,v:any)=>docs.set(k+id,v)};
 const candidate:any={stableTargetId:'event',targetVersionId:'v',protectedReasons:[]};
 const work=await deferPropositionWork(tx,candidate,{id:'meta',parentFactId:'parent',text:'Meta released a model.'},'plan','window','now');
 expect(work.expiresAt).toBeUndefined();
 const edition:any={id:'edition',feedId:'f',stories:[{candidateId:'other',claims:[{id:'c',text:'A different story.'}]}]};
 const proof:any={status:'ACCEPT',contract:'EVIDENCE_GROUNDED_V2',editionId:'edition',targetVersionId:'v',propositionIds:['meta'],readerSpans:[{propositionId:'meta',claimId:'c',text:'Meta released a model.'}]};
 docs.set('publication_validation_results'+'proof',proof);
 expect(await resolvePropositionWork(tx,work,edition,'proof')).toBe(false);
 edition.stories=[{candidateId:'candidate',claims:[{id:'c',text:'Meta released a model.'}]}];proof.candidateId='candidate';
 expect(await resolvePropositionWork(tx,work,edition,'proof')).toBe(true);
 expect(docs.get('editorial_work_resolutions'+JSON.stringify([work.id,'edition']))?.workId).toBe(work.id);
});
