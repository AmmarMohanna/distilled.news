import {it,expect} from 'vitest';
import {indexSourcePassages} from './source-passages';
import {assertClaimSpan} from './claims';
import {constructionTransport,PACKET_CONSTRUCTION_VERSION} from './construction-transport';
import {parseConstruction} from './semantic-construction';
const revision:any={id:'r',feedId:'feed',title:'What changed?',body:'Subscribe now. The company said it is developing agents. They could run only after approval.\n\nقالت الشركة إنها لم تطلق المنتج. 尚未发布。',contentHash:'h',acceptedAt:'2026-10-21T10:00:00Z',publishedAt:'2026-10-20T09:00:00Z'};
it('indexes exact multi-sentence source passages without semantic classification or filtering',async()=>{
 const a=await indexSourcePassages(revision),b=await indexSourcePassages(revision);
 expect(a).toEqual(b);expect(a.mentions).toHaveLength(3);
 expect(a.mentions[1].sourceText).toContain('They could run only after approval.');
 for(const m of a.mentions){assertClaimSpan(m,revision);expect(m).toMatchObject({reportingRole:'OTHER_UNCERTAIN',certainty:{kind:'UNSPECIFIED',hedges:[]},qualifiers:[],quantities:[],reportTime:revision.publishedAt});expect(m.attribution).toBeUndefined()}
 const covered=a.mentions.filter(m=>m.span.field==='body').map(m=>m.sourceText).join('\n\n');expect(covered).toBe(revision.body);
 expect(()=>assertClaimSpan({...a.mentions[1],sourceText:'The agents are available.'},revision)).toThrow();
});
it('allows the AI to assign a shared passage to independent developments without inherited hints',async()=>{
 const {mentions}=await indexSourcePassages(revision),input:any={revision,candidates:[],storylineIds:[],role:'REPORTED_DEVELOPMENT'},wire=constructionTransport(mentions,input,{constructionOwnershipVersion:PACKET_CONSTRUCTION_VERSION});
 const group=(groupId:string)=>({groupId,occurrence:'An independently reported occurrence',eventId:null,storylineId:null,structuralRelation:'NEW_STORYLINE',epistemicEffects:[]});
 const raw={confidence:1,groups:[group('G0'),group('G1')],dispositionByUnitId:{C0:'G0',C1:['G0','G1'],C2:'G1'}};
 const parsed=parseConstruction(wire.decode(raw),mentions,input,{scorer:'TEST',policyVersion:'article-passages'});
 expect(parsed.groups.every(g=>g.claimMentionIds.includes(mentions[1].id))).toBe(true);
 const payload=JSON.stringify(wire.state);expect(payload).not.toContain('reportingRoleHint');expect(payload).not.toContain('"certainty"');
 expect(()=>wire.decode({...raw,dispositionByUnitId:{C0:'G0',C1:'G0'}})).toThrow();
});
it('accepts an explicit semantic no-development decision while retaining complete source coverage',async()=>{
 const {mentions}=await indexSourcePassages(revision),input:any={revision,candidates:[],role:'REPORTED_DEVELOPMENT'},wire=constructionTransport(mentions,input,{constructionOwnershipVersion:PACKET_CONSTRUCTION_VERSION});
 const raw={confidence:1,groups:[],dispositionByUnitId:Object.fromEntries(mentions.map((_,i)=>['C'+i,'BACKGROUND']))};
 expect(parseConstruction(wire.decode(raw),mentions,input,{scorer:'TEST',policyVersion:'article-passages'}).backgroundMentionIds).toEqual(mentions.map(m=>m.id));
});

it('indexes single-newline acquired paragraphs without splitting sentences or dropping source characters',async()=>{
 const r={...revision,body:'The company is developing agents. They may act only after approval.\nThe next paragraph describes an independent fund.\n\nHistorical context remains available.'};
 const {mentions}=await indexSourcePassages(r);expect(mentions.filter(m=>m.span.field==='body')).toHaveLength(3);expect(mentions[1].sourceText).toContain('They may act only after approval.');
 for(const m of mentions)assertClaimSpan(m,r);for(let i=0;i<r.body.length;i++)if(!/\s/.test(r.body[i]))expect(mentions.some(m=>m.span.field==='body'&&m.span.start<=i&&m.span.end>i)).toBe(true);
});
