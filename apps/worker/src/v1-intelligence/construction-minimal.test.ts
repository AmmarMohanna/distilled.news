import {it,expect} from 'vitest';
import {constructionTransport} from './construction-transport';
import {extractClaimMentions} from './claims';
import {parseConstruction} from './semantic-construction';
const version='minimal-claim-disposition-v1';
const group=(id:string)=>({groupId:id,occurrence:'A distinct news occurrence',eventId:null,storylineId:null,structuralRelation:'NEW_STORYLINE',epistemicEffects:['CHANGES_STATE']});
async function fixture(){
 const revision:any={id:'source-r',feedId:'feed',body:'The council approved a water fund with 5% of its shares. Details remain uncertain. The union separately called a strike.',contentHash:'h',acceptedAt:'2026-10-03T12:00:00Z'};
 const {mentions}=await extractClaimMentions(revision),input:any={revision,role:'REPORTED_DEVELOPMENT',candidates:[]},wire=constructionTransport(mentions,input,{constructionOwnershipVersion:version});
 return {mentions,input,wire};
}
it('does not request enrichment and accepts independent developments with complete text evidence',async()=>{
 const {mentions,input,wire}=await fixture(),schema:any=wire.schema,p=schema.properties.groups.items.anyOf[0].properties;
 for(const name of ['claimMentionIds','entities','slots','storylineState','ownedPassages'])expect(p[name]).toBeUndefined();
 const raw={confidence:1,groups:[group('G0'),group('G1')],dispositionByUnitId:{C0:'G0',C1:'G0',C2:'G1'}},decoded=wire.decode(raw),construction=parseConstruction(decoded,mentions,input,{scorer:'FIXTURE',policyVersion:version});
 expect(construction.groups).toHaveLength(2);expect(construction.groups[0]).toMatchObject({entities:[],slots:[]});expect(construction.groups[0].storylineState).toBeUndefined();expect(construction.groups.flatMap(g=>g.claimMentionIds)).toEqual(mentions.map(m=>m.id));
});
it('rejects supplied enrichment rather than silently dropping or accepting its invalid references',async()=>{
 const {wire}=await fixture(),raw:any={confidence:1,groups:[{...group('G0'),storylineState:{lifecycle:'ACTIVE',openQuestionMentionIds:['C2'],expectedNextDate:null},entities:[{canonicalLabel:'Council',aliases:['Absent alias'],claimMentionIds:['C0']}],slots:[{kind:'percentage',claimMentionId:'C0',entityLabel:'Council shares',value:'5%',asOf:null} ]},group('G1')],dispositionByUnitId:{C0:'G0',C1:'G0',C2:'G1'}};
 delete raw.dispositionByUnitId.C0;raw.dispositionByUnitId.C99='G9';
 const before=JSON.stringify(raw);try{wire.decode(raw);throw Error('UNSAFE_ACCEPTANCE')}catch(e){expect((e as any).mechanicalIssues.map((i:any)=>i.code)).toEqual(expect.arrayContaining(['UNREQUESTED_ENRICHMENT','FOREIGN_GROUP_REFERENCE','SLOT_ENTITY_OWNERSHIP','ENTITY_ALIAS_NOT_SOURCE','MISSING_UNIT','UNKNOWN_UNIT']))}expect(JSON.stringify(raw)).toBe(before);
});
it('retains the required-key coverage, source authorization and canonical identity gates',async()=>{
 const {wire,mentions,input}=await fixture(),base:any={confidence:1,groups:[group('G0')],dispositionByUnitId:{C0:'G0',C1:'G0',C2:'G0'}};
 for(const change of [(r:any)=>delete r.dispositionByUnitId.C0,(r:any)=>r.dispositionByUnitId.C99='G0',(r:any)=>r.dispositionByUnitId.C0='G8',(r:any)=>r.dispositionByUnitId.C0='BACKGROUND',(r:any)=>r.groups.push(group('G1')),(r:any)=>r.groups[0].eventId='E99']){const raw=structuredClone(base);change(raw);expect(()=>wire.decode(raw)).toThrow()}
 const foreign=structuredClone(mentions);foreign[0].feedId='other-feed';expect(()=>constructionTransport(foreign,input,{constructionOwnershipVersion:version})).toThrow();
});
it('allows more than three distinct groups and consolidates overlap through offered canonical identities',async()=>{
 const revision:any={id:'r',feedId:'f',body:'The council opened a school. The court dismissed a case. A union called a strike. A firm recalled a device.',acceptedAt:'2026-10-03T12:00:00Z',contentHash:'h'}, {mentions}=await extractClaimMentions(revision);
 const input:any={revision,role:'REPORTED_DEVELOPMENT',candidates:[{id:'existing-school',version:{id:'v1',state:mentions[0].sourceText},evidenceRevisionIds:['previous-article'],newestAt:revision.acceptedAt}],storylineIds:['school-story']},wire=constructionTransport(mentions,input,{constructionOwnershipVersion:version});
 const raw:any={confidence:1,groups:mentions.map((_,i)=>group('G'+i)),dispositionByUnitId:Object.fromEntries(mentions.map((_,i)=>['C'+i,'G'+i]))};Object.assign(raw.groups[0],{eventId:'E0',storylineId:'L0',structuralRelation:'SAME_EVENT'});
 const result=parseConstruction(wire.decode(raw),mentions,input,{scorer:'FIXTURE',policyVersion:version});expect(result.groups).toHaveLength(4);expect(result.groups[0].eventId).toBe('existing-school');expect(result.groups[0].storylineId).toBe('school-story');
});

it('defines article-first identity separately from supporting facts, future uncertainty and routing placeholders',async()=>{
 const {mentions,input}=await fixture();const wire=constructionTransport(mentions,input,{constructionOwnershipVersion:version,prior:{structuralRelation:'DEFER',confidence:0,provenance:{fallbackReason:'NO_ACCEPTED_JUDGMENT'}}});
 expect(wire.state.instruction).toContain('principal news occurrence');expect(wire.state.instruction).toContain('DEFER means unresolved occurrence identity');
 expect(wire.state.prior).toBeUndefined();expect(wire.state.instruction).toContain('published');
 const branch=(wire.schema as any).properties.groups.items.anyOf[0];expect(Object.keys(branch.properties.structuralRelation)).toEqual(['$ref']);expect(wire.state.instruction).toContain('future outcome');
 const groundedPrior={structuralRelation:'SAME_EVENT',eventId:'existing',confidence:.9,provenance:{scorer:'JEV',judgmentId:'settled'}};expect(constructionTransport(mentions,input,{constructionOwnershipVersion:version,prior:groundedPrior}).state.prior).toMatchObject({structuralRelation:'SAME_EVENT',provenance:{judgmentId:'settled'}});
});

it('separates omission and possible uses from contradiction without rewriting genuine model effects',async()=>{
 const {wire}=await fixture();expect(wire.state.instruction).toContain('omission from a prior summary are not contradictions');expect(wire.state.instruction).toContain('factory');const raw={confidence:1,groups:[{...group('G0'),epistemicEffects:['CONTRADICTS']}],dispositionByUnitId:{C0:'G0',C1:'G0',C2:'G0'}};expect(wire.decode(raw).groups[0].epistemicEffects).toEqual(['CONTRADICTS']);
});
