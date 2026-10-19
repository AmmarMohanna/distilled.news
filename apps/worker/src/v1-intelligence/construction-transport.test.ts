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

import {GROUP_OWNERSHIP_VERSION} from './construction-transport';
import {parseConstruction} from './semantic-construction';
import {constructionRepairOwnership} from './semantic-construction-repair';
const ownedGroup=(groupId:string,ids:string[],openQuestion?:string)=>({groupId,ownedPassages:ids.map(passageId=>({passageId,openQuestion:passageId===openQuestion,expectedNextDateText:null})),eventId:null,storylineId:null,structuralRelation:'NEW_STORYLINE',epistemicEffects:[],entities:[],slots:[],storylineState:{lifecycle:'ACTIVE'}});
async function ownershipFixture(){
 const revision={id:'source-r',feedId:'feed',body:'The council approved a water fund. Governance details remain uncertain. The union called a strike.',contentHash:'h',acceptedAt:'2026-10-03T12:00:00Z',canonicalUrl:'https://publisher.example/news'} as any;
 const {mentions}=await extractClaimMentions(revision),input={revision,role:'REPORTED_DEVELOPMENT' as const,candidates:[]};
 return {revision,mentions,input,wire:constructionTransport(mentions,input,{constructionOwnershipVersion:GROUP_OWNERSHIP_VERSION,source:{id:revision.id,text:revision.body}})};
}
it('makes each storyline question and date an explicit property of an owned passage',async()=>{
 const {mentions,input,wire}=await ownershipFixture();
 const raw={confidence:1,backgroundMentionIds:[],groups:[ownedGroup('G0',['C0','C1'],'C1'),ownedGroup('G1',['C2'])]};
 const decoded=wire.decode(raw);expect(parseConstruction(decoded,mentions,input,{scorer:'fixture',policyVersion:'fixture'}).groups).toHaveLength(2);
 expect(decoded.groups[0].claimMentionIds).toEqual([mentions[0].id,mentions[1].id]);expect(decoded.groups[0].storylineState.openQuestionMentionIds).toEqual([mentions[1].id]);
 expect(decoded.groups[1].claimMentionIds).toEqual([mentions[2].id]);
 expect(wire.state.claimMentions[1]).toMatchObject({id:'C1',text:mentions[1].sourceText,evidenceRevisionId:input.revision.id,span:mentions[1].span});
 expect(wire.state.passageOwnership.unassignedIncomingPassageIds).toEqual(['C0','C1','C2']);
 const props=(wire.schema.properties.groups as any).items.anyOf[0].properties;
 expect(Object.keys(props.storylineState.properties)).toEqual(['lifecycle']);
 const lifecycle=props.storylineState.properties.lifecycle;expect((lifecycle.$ref?(wire.schema as any).$defs[lifecycle.$ref.split('/').at(-1)]:lifecycle).enum).toEqual(['ACTIVE','WATCHING','DORMANT','CLOSED']);
 expect(props.ownedPassages.items.properties.passageId).toBeDefined();expect(props.claimMentionIds).toBeUndefined();
});
it('cannot accept a foreign question by silently adding, rewriting or dropping an ID',async()=>{
 const {mentions,wire}=await ownershipFixture(),raw:any={confidence:1,backgroundMentionIds:[],groups:[ownedGroup('G0',['C0']),ownedGroup('G1',['C1','C2'])]};
 const original=structuredClone(raw);raw.groups[0].storylineState.openQuestionMentionIds=['C1'];
 expect(()=>wire.decode(raw)).toThrow();expect(raw.groups[0].ownedPassages).toEqual(original.groups[0].ownedPassages);
 delete raw.groups[0].storylineState.openQuestionMentionIds;raw.groups[0].ownedPassages[0].passageId='C999';expect(()=>wire.decode(raw)).toThrow();
 raw.groups[0].ownedPassages[0].passageId='C0';raw.groups[0].entities=[{canonicalLabel:'Council',aliases:['Council'],claimMentionIds:['C1']}];
 const decoded=wire.decode(raw);expect(()=>parseConstruction(decoded,mentions,( {revision:{},candidates:[]} as any),{scorer:'fixture',policyVersion:'fixture'})).toThrow();
});
it('uses the unchanged canonical source/date/coverage gates after decoding',async()=>{
 const {mentions,input,wire}=await ownershipFixture(),raw:any={confidence:1,backgroundMentionIds:[],groups:[ownedGroup('G0',['C0','C1'],'C1')]};
 expect(()=>parseConstruction(wire.decode(raw),mentions,input,{scorer:'fixture',policyVersion:'fixture'})).toThrow();
 raw.groups.push(ownedGroup('G1',['C2']));raw.groups[0].ownedPassages[1].expectedNextDateText='October 9';
 expect(()=>parseConstruction(wire.decode(raw),mentions,input,{scorer:'fixture',policyVersion:'fixture'})).toThrow();
 const wrong=structuredClone(mentions);wrong[0].evidenceRevisionId='foreign';expect(()=>constructionTransport(wrong,input,{constructionOwnershipVersion:GROUP_OWNERSHIP_VERSION})).toThrow();
});
it('repair exposes exact offending group references and a bounded allowed source catalog',async()=>{
 const {mentions}=await ownershipFixture(),raw={groups:[{claimMentionIds:[mentions[0].id],storylineState:{openQuestionMentionIds:[mentions[1].id]},entities:[],slots:[]}],backgroundMentionIds:[mentions[1].id,mentions[2].id]};
 const map=constructionRepairOwnership(raw,mentions);expect(map.groups[0]).toMatchObject({groupId:'G0',proposedOwnedPassageIds:[mentions[0].id],offendingReferences:[{field:'storylineState.openQuestionMentionIds',passageId:mentions[1].id}]});
 expect(map.allowedIncomingPassageIds).toEqual(mentions.map(m=>m.id));expect(raw.groups[0].claimMentionIds).toEqual([mentions[0].id]);
});

it('consolidates an overlapping source into the offered event while retaining an independent development',async()=>{
 const {revision,mentions}=await ownershipFixture(),input:any={revision,role:'REPORTED_DEVELOPMENT',candidates:[{id:'existing-water',version:{id:'water-v1',state:'The council approved a water fund.'},evidenceRevisionIds:['earlier-source'],newestAt:'2026-10-03T11:00:00Z'}],storylineIds:['water-storyline']};
 const wire=constructionTransport(mentions,input,{constructionOwnershipVersion:GROUP_OWNERSHIP_VERSION,source:{id:revision.id,text:revision.body},events:[{id:'existing-water',state:input.candidates[0].version.state}]});
 const raw:any={confidence:1,backgroundMentionIds:[],groups:[{...ownedGroup('G0',['C0','C1'],'C1'),eventId:'E0',storylineId:'L0',structuralRelation:'SAME_EVENT'},ownedGroup('G1',['C2'])]};
 const decoded=wire.decode(raw),result=parseConstruction(decoded,mentions,input,{scorer:'fixture',policyVersion:'fixture'});
 expect(result.groups.map(g=>g.eventId)).toEqual(['existing-water',null]);expect(result.groups).toHaveLength(2);
 expect(result.groups[0].claimMentionIds).not.toContain(mentions[2].id);expect(result.groups[1].claimMentionIds).toEqual([mentions[2].id]);
 expect(wire.state.events[0].id).toBe('E0');expect(wire.state.claimMentions[0].evidenceRevisionId).toBe(revision.id);
});
