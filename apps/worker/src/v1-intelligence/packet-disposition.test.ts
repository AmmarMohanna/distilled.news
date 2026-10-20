import {it,expect} from 'vitest';
import {extractClaimMentions,isNewsMention} from './claims';
import {constructionTransport,PACKET_CONSTRUCTION_VERSION,MINIMAL_CONSTRUCTION_VERSION} from './construction-transport';
import {parseConstruction} from './semantic-construction';
const revision:any={id:'r',feedId:'f',body:'Officials said Parliament approved reform and the airport reopened.',contentHash:'h',acceptedAt:'2026-10-03T12:00:00Z'};
const group=(id:string)=>({groupId:id,occurrence:'A source-grounded occurrence',eventId:null,storylineId:null,structuralRelation:'NEW_STORYLINE',epistemicEffects:[]});
it('allows one exact source unit to support independent packet developments without altering evidence',async()=>{
 const mentions=(await extractClaimMentions(revision)).mentions.filter(isNewsMention),input:any={revision,candidates:[],storylineIds:[],role:'REPORTED_DEVELOPMENT'};
 const wire=constructionTransport(mentions,input,{constructionOwnershipVersion:PACKET_CONSTRUCTION_VERSION}),raw={confidence:.9,originDependencyLabel:null,groups:[group('G0'),group('G1')],dispositionByUnitId:Object.fromEntries(mentions.map((_,i)=>['C'+i,['G0','G1']]))};
 const decoded=parseConstruction(wire.decode(raw),mentions,input,{scorer:'GPT',policyVersion:'packet-test'});
 expect(decoded.groups[0].claimMentionIds).toEqual(mentions.map(m=>m.id));expect(decoded.groups[1].claimMentionIds).toEqual(mentions.map(m=>m.id));expect(mentions.every(m=>revision.body.slice(m.span.start,m.span.end)===m.sourceText)).toBe(true);
 expect(()=>constructionTransport(mentions,input,{constructionOwnershipVersion:MINIMAL_CONSTRUCTION_VERSION}).decode(raw)).toThrow();
 for(const value of [['G0','G0'],['G0','BACKGROUND'],['G0','G99'],[]])expect(()=>wire.decode({...raw,dispositionByUnitId:Object.fromEntries(mentions.map((_,i)=>['C'+i,value]))})).toThrow();
});
