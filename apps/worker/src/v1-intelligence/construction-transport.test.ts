import {it,expect} from 'vitest';
import {constructionTransport} from './construction-transport';
import {extractClaimMentions} from './claims';
it('reference aliases preserve source wording, typed ownership and original identifiers',async()=>{
 const revision={id:'source-r',feedId:'feed',body:'C0 launched a product. Officials may approve 40 measures.',contentHash:'h',acceptedAt:'2026-10-03T12:00:00Z'} as any,{mentions}=await extractClaimMentions(revision),input={revision,role:'REPORTED_DEVELOPMENT' as const,candidates:[]};
 const state={claimMentions:mentions.map(m=>({id:m.id,text:m.sourceText})),source:{id:revision.id,text:revision.body}},wire=constructionTransport(mentions,input,state);
 expect(wire.state.claimMentions.map((m:any)=>m.text)).toEqual(mentions.map(m=>m.sourceText));expect(wire.state.claimMentions[0].id).toBe('C0');expect(wire.state.source.id).toBe('source-r');
 const proposal={groups:[{claimMentionIds:['C0','C1'],eventId:null,storylineId:null,structuralRelation:'NEW_STORYLINE',entities:[{canonicalLabel:'C0',aliases:['C0'],claimMentionIds:['C0']}],slots:[],epistemicEffects:[]}],backgroundMentionIds:[],confidence:.9};
 const decoded=wire.decode(proposal);expect(decoded.groups[0].claimMentionIds).toEqual(mentions.map(m=>m.id));expect(decoded.groups[0].entities[0].canonicalLabel).toBe('C0');expect(()=>wire.decode({...proposal,groups:[{...proposal.groups[0],claimMentionIds:['C99']}]})).toThrow();
});
