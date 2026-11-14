import {it,expect} from 'vitest';
import {occurrenceNovelty,OCCURRENCE_RULE} from '../src/novelty';
import {UsageMeter} from '../src/model';
import {generateBriefing} from '../src/engine';
import {FEED,MODELS,WINDOW,article} from './helpers';
const prior={id:'old-shelling',at:'2026-11-11T17:03:34Z',headline:'Shelling reported in Mansouri and Qantara',body:'Airstrikes and artillery shelling reported on November 11.'};
const draft={headline:'Explosion reported in Qantara',body:'',sources:[{id:'source',publishedAt:'2026-11-14T09:50:44Z',text:'تفجير جديد داخل بلدة القنطرة'}]};
it('supplies source event wording, publication context and exact prior briefing times',async()=>{
 let request:any;const port={complete:async(r:any)=>{request=r;return{text:JSON.stringify({results:[{i:0,redundant:false,delta:'Source explicitly reports a new explosion',priorIds:[],sameOccurrence:''}]})}}};
 expect((await occurrenceNovelty(port,new UsageMeter(),'model',[draft],[prior],'2026-11-14T10:25:00Z'))[0].redundant).toBe(false);
 const input=JSON.parse(request.user);expect(input.alreadyTold[0].briefingPublishedAt).toBe(prior.at);expect(input.drafts[0].sources).toEqual(draft.sources);expect(request.system).toContain(OCCURRENCE_RULE);
});
it.each([
 {priorIds:[],sameOccurrence:'same town',delta:'none'},
 {priorIds:['invented'],sameOccurrence:'same incident',delta:'none'},
 {priorIds:[prior.id],sameOccurrence:'',delta:'none'},
 {priorIds:[prior.id],sameOccurrence:'same incident',delta:'new event'}
])('rejects unsupported duplicate proof %#',async proof=>{
 const port={complete:async()=>({text:JSON.stringify({results:[{i:0,redundant:true,...proof}]})})};
 await expect(occurrenceNovelty(port,new UsageMeter(),'model',[draft],[prior],WINDOW.windowEnd)).rejects.toThrow();
});
it('retains a new occurrence with identical headline text instead of using the old exact-text shortcut',async()=>{
 const headline='Explosion reported in Qantara';let seen:any[]=[];
 const port={complete:async(r:any)=>{seen.push(r);const out=r.system.startsWith('You are the editor')?{items:[{headline,body:'',sources:['S1'],relation:'new',updates:null,importance:2}]}:r.system.startsWith('You assess')?{results:[{i:0,redundant:false,delta:'Explicit new explosion after earlier coverage',priorIds:[],sameOccurrence:''}]}:{results:[{i:0,verdict:'ok',issues:[]}]};return{text:JSON.stringify(out)}}};
 const result=await generateBriefing({feed:FEED,...WINDOW,prior:[{...prior,headline,body:''}],articles:[article('a','تفجير جديد داخل بلدة القنطرة')]},port,MODELS,{noveltyGuard:true,noveltyPolicy:'occurrence-aware-v1',promptVersion:4,prepare:{minChars:1}});
 expect(result.items).toHaveLength(1);expect(seen).toHaveLength(3);expect(seen[0].system).toContain(OCCURRENCE_RULE);expect(seen[2].system).toContain(OCCURRENCE_RULE);
});
it('retains an auditable same-occurrence reason and never verifies a proven repeat',async()=>{
 const port={complete:async(r:any)=>({text:JSON.stringify(r.system.startsWith('You are the editor')?{items:[{headline:draft.headline,body:'',sources:['S1'],relation:'new',updates:null,importance:2}]}:{results:[{i:0,redundant:true,delta:'none',priorIds:[prior.id],sameOccurrence:'Retrospective explicitly describes the November 11 incident'}]})})};
 const result=await generateBriefing({feed:FEED,...WINDOW,prior:[prior],articles:[article('a','A retrospective of the November 11 explosion.')]},port,MODELS,{noveltyGuard:true,noveltyPolicy:'occurrence-aware-v1',promptVersion:4,prepare:{minChars:1}});
 expect(result.items).toHaveLength(0);expect(result.dropped[0]).toMatchObject({carry:false});expect(result.dropped[0].reason).toContain(prior.id);expect(result.dropped[0].reason).toContain('Retrospective');expect(result.usage.calls).toBe(2);
});

it('passes the frozen prose contract through repair and rechecks the same sources',async()=>{
 let verifies=0;const seen:any[]=[];
 const port={complete:async(r:any)=>{seen.push(r);let out:any;
 if(r.system.startsWith('You are the editor'))out={items:[{headline:draft.headline,body:'',sources:['S1'],relation:'new',updates:null,importance:2}]};
 else if(r.system.startsWith('You assess'))out={results:[{i:0,redundant:false,delta:'Distinct report',priorIds:[],sameOccurrence:''}]};
 else if(r.system.startsWith('You are a meticulous'))out={results:[{i:0,verdict:++verifies===1?'fix':'ok',issues:verifies===1?['Preserve attribution']:[]}]};
 else {expect(r.user).toContain('not permission to remove an essential qualification');out={items:[{i:0,headline:'A correspondent reports an explosion in Qantara',body:''}]};}
 return{text:JSON.stringify(out)}}};
 const result=await generateBriefing({feed:FEED,...WINDOW,prior:[prior],articles:[article('a','A correspondent reports a new explosion in Qantara.')]},port,MODELS,{noveltyGuard:true,noveltyPolicy:'occurrence-aware-v1',promptVersion:4});
 expect(result.items[0].sourceIds).toEqual(['a']);expect(verifies).toBe(2);expect(seen).toHaveLength(5);
});

it('batches complete novelty evidence and preserves local-to-global draft ownership',async()=>{
 let noveltyCalls=0;
 const port={complete:async(r:any)=>{let out:any;
 if(r.system.startsWith('You are the editor'))out={items:[{headline:'Explosion reported in Qantara',body:'',sources:['S1'],relation:'new',updates:null,importance:1},{headline:'Old shelling report',body:'',sources:['S2'],relation:'new',updates:null,importance:2}]};
 else if(r.system.startsWith('You assess')){noveltyCalls++;const data=JSON.parse(r.user);expect(data.drafts).toHaveLength(1);expect(data.drafts[0].sources[0].text.length).toBeGreaterThan(40);const redundant=data.drafts[0].sources[0].id==='b';out={results:[{i:0,redundant,delta:redundant?'none':'Distinct explosion',priorIds:redundant?[prior.id]:[],sameOccurrence:redundant?'Same earlier shelling':''}]};}
 else out={results:[{i:0,verdict:'ok',issues:[]}]};return{text:JSON.stringify(out)}}};
 const result=await generateBriefing({feed:FEED,...WINDOW,prior:[prior],articles:[article('a','A correspondent reports a new explosion in Qantara.'),article('b','A retrospective repeats the earlier shelling report.')]},port,MODELS,{noveltyGuard:true,noveltyPolicy:'occurrence-aware-v1',promptVersion:4,maxVerifyChars:1,prepare:{nearDuplicate:1.01}});
 expect(noveltyCalls).toBe(2);expect(result.items.map(i=>i.sourceIds)).toEqual([['a']]);expect(result.dropped[0].sourceIds).toEqual(['b']);
});
