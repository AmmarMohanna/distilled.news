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
const group=(id:string,open:string[]=[])=>({groupId:id,occurrence:'A distinct occurrence',eventId:null,storylineId:null,structuralRelation:'NEW_STORYLINE',epistemicEffects:[],entities:[],slots:[],storylineState:{lifecycle:'ACTIVE',openQuestionMentionIds:open,expectedNextDate:null}});
const proposal=()=>({confidence:1,groups:[group('G0',['C1']),group('G1')],dispositionByUnitId:{C0:'G0',C1:'G0',C2:'G1'}});
it('requires exactly one scalar disposition per offered ClaimMention and derives downstream ownership',async()=>{
 const {mentions,input,wire}=await ownershipFixture(),raw=proposal(),before=JSON.stringify(raw),decoded=wire.decode(raw);
 expect(parseConstruction(decoded,mentions,input,{scorer:'fixture',policyVersion:'fixture'}).groups).toHaveLength(2);
 expect(decoded.groups[0].claimMentionIds).toEqual([mentions[0].id,mentions[1].id]);expect(decoded.groups[0].storylineState.openQuestionMentionIds).toEqual([mentions[1].id]);expect(decoded.backgroundMentionIds).toEqual([]);expect(JSON.stringify(raw)).toBe(before);
 const schema:any=wire.schema,props=schema.properties;
 expect(props.backgroundMentionIds).toBeUndefined();expect(props.groups.items.anyOf[0].properties.ownedPassages).toBeUndefined();expect(props.groups.items.anyOf[0].properties.claimMentionIds).toBeUndefined();
 expect(props.dispositionByUnitId).toMatchObject({additionalProperties:false,required:['C0','C1','C2']});expect(props.dispositionByUnitId.properties.C0.type).toBe('string');
 expect(wire.state.claimMentions[1]).toMatchObject({id:'C1',text:mentions[1].sourceText,evidenceRevisionId:input.revision.id,span:mentions[1].span});
});
it('collects missing, unknown, foreign, duplicate and empty group errors without rewriting',async()=>{
 const {wire}=await ownershipFixture(),raw:any=proposal();delete raw.dispositionByUnitId.C0;raw.dispositionByUnitId.C2='G8';raw.dispositionByUnitId.C99='G0';raw.groups.push(group('G1'));raw.groups[0].storylineState.openQuestionMentionIds=['C2'];
 const before=JSON.stringify(raw);try{wire.decode(raw);throw Error('UNSAFE_ACCEPTANCE')}catch(e){expect((e as any).mechanicalIssues.map((i:any)=>i.code)).toEqual(expect.arrayContaining(['MISSING_UNIT','UNKNOWN_UNIT','UNKNOWN_GROUP','INVALID_GROUP_ID','EMPTY_GROUP','FOREIGN_GROUP_REFERENCE']));expect((e as any).mechanicalIssues.every((i:any)=>i.pointer&&i.invariant&&'observed' in i)).toBe(true)}expect(JSON.stringify(raw)).toBe(before);
});
it('rejects competing legacy fields and reports every exact conflict',async()=>{
 const {wire}=await ownershipFixture(),raw={confidence:1,groups:[ownedGroup('G0',['C0','C1']),ownedGroup('G1',['C2'])],backgroundMentionIds:['C1','C2']};
 try{wire.decode(raw);throw Error('UNSAFE_ACCEPTANCE')}catch(e){expect((e as any).mechanicalIssues).toEqual(expect.arrayContaining([{code:'CONFLICTING_DISPOSITIONS',pointer:'/dispositionByUnitId/C1',unitId:'C1',observed:['G0','BACKGROUND'],invariant:'Each ClaimMention has exactly one destination.'},{code:'CONFLICTING_DISPOSITIONS',pointer:'/dispositionByUnitId/C2',unitId:'C2',observed:['G1','BACKGROUND'],invariant:'Each ClaimMention has exactly one destination.'}]))}
});
it('rejects ineligible background, invalid source/date and canonical event relationships',async()=>{
 const {mentions,input,wire}=await ownershipFixture();const raw:any=proposal();raw.dispositionByUnitId.C1='BACKGROUND';raw.groups[0].storylineState.openQuestionMentionIds=[];
 expect(()=>wire.decode(raw)).toThrow();raw.dispositionByUnitId.C1='G0';raw.groups[0].storylineState.expectedNextDate={claimMentionId:'C1',text:'October 9'};
 expect(()=>parseConstruction(wire.decode(raw),mentions,input,{scorer:'fixture',policyVersion:'fixture'})).toThrow();raw.groups[0].storylineState.expectedNextDate=null;raw.groups[0].eventId='E99';raw.groups[0].structuralRelation='SAME_EVENT';expect(()=>wire.decode(raw)).toThrow();
 const wrong=structuredClone(mentions);wrong[0].evidenceRevisionId='foreign';expect(()=>constructionTransport(wrong,input,{constructionOwnershipVersion:GROUP_OWNERSHIP_VERSION})).toThrow();
});
it('repair exposes precise legacy foreign references without asserting a canonical partition',async()=>{
 const {mentions}=await ownershipFixture(),raw={groups:[{claimMentionIds:[mentions[0].id],storylineState:{openQuestionMentionIds:[mentions[1].id]},entities:[],slots:[]}],backgroundMentionIds:[mentions[1].id,mentions[2].id]};
 const map=constructionRepairOwnership(raw,mentions);expect(map.groups[0]).toMatchObject({groupId:'G0',proposedClaimMentionIds:[mentions[0].id],offendingReferences:[{field:'storylineState.openQuestionMentionIds',claimMentionId:mentions[1].id}]});
});
it('consolidates overlap into the offered event while preserving a separate development',async()=>{
 const {revision,mentions}=await ownershipFixture(),input:any={revision,role:'REPORTED_DEVELOPMENT',candidates:[{id:'existing-water',version:{id:'water-v1',state:'The council approved a water fund.'},evidenceRevisionIds:['earlier-source'],newestAt:'2026-10-03T11:00:00Z'}],storylineIds:['water-storyline']};
 const wire=constructionTransport(mentions,input,{constructionOwnershipVersion:GROUP_OWNERSHIP_VERSION,events:[{id:'existing-water',state:input.candidates[0].version.state}]}),raw:any=proposal();Object.assign(raw.groups[0],{eventId:'E0',storylineId:'L0',structuralRelation:'SAME_EVENT'});
 const value=parseConstruction(wire.decode(raw),mentions,input,{scorer:'fixture',policyVersion:'fixture'});expect(value.groups.map(g=>g.eventId)).toEqual(['existing-water',null]);expect(value.groups[1].claimMentionIds).toEqual([mentions[2].id]);expect(wire.state.events[0].id).toBe('E0');
});
it('renders connected quote context with original coordinates without forcing common ownership',async()=>{
 const revision:any={id:'source-r',feedId:'feed',body:'The company said, “Bolder approaches may be needed. The Fund will have the versatility to pursue them.”',contentHash:'h',acceptedAt:'2026-10-03T12:00:00Z'};
 const {mentions}=await extractClaimMentions(revision),input:any={revision,role:'REPORTED_DEVELOPMENT',candidates:[]},wire=constructionTransport(mentions,input,{constructionOwnershipVersion:GROUP_OWNERSHIP_VERSION});
 expect(mentions.length).toBeGreaterThanOrEqual(2);expect(wire.state.connectedContext).toMatchObject([{text:revision.body,unitIds:mentions.map((_,i)=>'C'+i),start:0,end:revision.body.length,assignable:false}]);
 const raw={confidence:1,groups:[group('G0'),group('G1')],dispositionByUnitId:Object.fromEntries(mentions.map((_,i)=>['C'+i,i===0?'G0':'G1']))};expect(wire.decode(raw).groups).toHaveLength(2);expect(mentions[1].sourceText).toContain('pursue them');
});

it('rejects unknown raw property names even if an object parser filters prototype-sensitive keys',async()=>{
 const {wire}=await ownershipFixture(),raw=JSON.parse(JSON.stringify(proposal()).replace('"C0":"G0"','"__proto__":"G0","C0":"G0"'));
 expect(()=>wire.decode(raw)).toThrow();
});
it('rejects non-scalar destinations, assignment arrays and reserved BACKGROUND group identity',async()=>{
 const {wire}=await ownershipFixture();
 const arrayValue:any=proposal();arrayValue.dispositionByUnitId.C0=['G0','BACKGROUND'];expect(()=>wire.decode(arrayValue)).toThrow();
 const assignments:any=proposal();assignments.dispositionByUnitId=[{unitId:'C0',destination:'G0'}];expect(()=>wire.decode(assignments)).toThrow();
 const reserved:any=proposal();reserved.groups[0].groupId='BACKGROUND';reserved.dispositionByUnitId.C0='BACKGROUND';expect(()=>wire.decode(reserved)).toThrow();
});
