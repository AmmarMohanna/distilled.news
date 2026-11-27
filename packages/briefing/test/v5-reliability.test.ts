import {describe,expect,it} from 'vitest';
import {generateBriefing} from '../src/engine';
import {occurrenceNovelty} from '../src/novelty';
import {UsageMeter} from '../src/model';
import {frenchQualificationIssues} from '../src/qualification-scope';
import {headlineWordCount} from '../src/prompts';
import type {BriefingModels,PriorItem} from '../src/types';
import {FEED,FUND,GENESIS,MODELS,WINDOW,article,scripted} from './helpers';

const models:BriefingModels={...MODELS,generation:{
  model:'candidate',provider:'test',price:{prompt:1,completion:1},contextTokens:200_000,
  maxOutputTokens:6500,prompt:'v5-source-first-v6',
}};
const past:PriorItem={id:'edition/stories/a-durable-history-id',at:WINDOW.windowStart,
  headline:'Past school incident',body:'The ministry reported an incident at the school.'};
const start={...WINDOW,feed:FEED};
const draft={headline:'Funding announced',body:'Subject to shareholder approval, the grant will fund research.',
  sources:['S1'],importance:1 as const,relation:'new',updates:null};
const ok={results:[{i:0,verdict:'ok',issues:[]}]};

describe('V5 reliability revision',()=>{
  it('constrains writer history links and rejects a current source ID without guessing the update',async()=>{
    const update={...draft,relation:'update',updates:'H1'};
    const source_decisions={S1:{decision:'selected',why:'supports the new response'}};
    const {port,calls}=scripted({edit:[
      {items:[{...update,updates:'S1'}],source_decisions},{items:[update],source_decisions},
    ],verify:[ok]});
    const result=await generateBriefing({...start,prior:[past],articles:[article('current',FUND)]},port,models,{
      editorAccountingPolicy:'complete-source-decisions-v3',now:()=>new Date(WINDOW.windowEnd),
    });
    expect(calls.map(call=>call.stage)).toEqual(['edit','edit','verify']);
    expect(JSON.stringify(calls[0].request.responseSchema)).toContain('"enum":[null,"H1"]');
    expect(calls[0].request.user).not.toContain(past.id);
    expect(result.items[0]).toMatchObject({updatesId:past.id,sourceIds:['current']});
  });

  it('makes a compact novelty schema and keeps relation consistency in the parser',async()=>{
    const prior=Array.from({length:20},(_,i)=>({...past,id:past.id.repeat(5)+i}));
    const invalid={i:0,relation:'update',redundant:true,delta:'none',priorIds:['H2'],sameOccurrence:'The same hearing'};
    const {port,calls}=scripted({repair:[{results:[invalid]},{results:[{...invalid,relation:'repeat'}]}]});
    const selected=[{headline:'New report',body:'A hearing is scheduled.',sources:[]}];
    const rows=await occurrenceNovelty(port,new UsageMeter(),MODELS.editor,selected,prior,WINDOW.windowEnd,true,'compact-history-v1');
    const schema=JSON.stringify(calls[0].request.responseSchema);
    expect(schema).toContain('"H20"');
    expect(schema).not.toContain('anyOf');
    expect(schema.length).toBeLessThan(700);
    expect(calls[0].request.user).not.toContain(prior[1].id);
    expect(calls).toHaveLength(2);
    expect(rows[0]).toMatchObject({priorIds:[prior[1].id],relation:'repeat'});
  });

  it('verifies both selected stories even when their headlines exceed the target',async()=>{
    const low={...draft,headline:'A separate research report '.repeat(32).trim(),body:'More detail about that report.',
      sources:['S2'],importance:3 as const};
    const {port,calls}=scripted({edit:[{items:[draft]},{items:[low]}],
      consolidate:[{items:[{...draft,from:[0],importance:3},{...low,from:[1]}],cut:[]}],verify:[{results:[...ok.results,{...ok.results[0],i:1}]}]});
    const result=await generateBriefing({...start,articles:[article('a-lead',FUND),article('b-later',GENESIS)]},
      port,models,{maxEditorChars:10,editorSelectionPolicy:'preserve-selected-developments-v1'});
    expect(result.status).toBe('published');
    expect(result.items.map(item=>item.body)).toEqual([draft.body,low.body]);
    expect(calls.map(call=>call.stage)).toEqual(['edit','edit','consolidate','verify']);
    expect(calls.at(-1)?.request.user).toContain(draft.body);
    expect(calls.at(-1)?.request.user).toContain(low.headline);
  });

  it('counts only headline words across languages',()=>{
    const ar={headline:'وزير المالية',body:'انخفض السعر ١٬٠٠٠ ليرة.',importance:1 as const};
    const fr={headline:'L’Union l’approuve.',body:'L’Union l’approuve.',importance:1 as const};
    expect(headlineWordCount('ar',[ar])).toBe(2);
    expect(headlineWordCount('fr',[fr])).toBe(2);
  });

  it('overrides a French false approval and verifies the actual corrected copy',async()=>{
    const source=article('budget',"Cette année, 710,1 millions d’euros ont été laissés disponibles sous les plafonds budgétaires. Le budget 2027 prévoit 199,7 milliards d’euros en engagements et attend un vote.");
    source.publishedAt='2026-11-23T10:40:00Z';
    const misleading={...draft,headline:'Le Conseil adopte le budget 2027',body:'Le Conseil a laissé 710,1 millions d’euros disponibles sous les plafonds du CFP.'};
    const corrected={i:0,headline:misleading.headline,body:'Le Conseil indique que 710,1 millions d’euros restent disponibles en 2026 sous les plafonds du CFP.',drop:false};
    const {port,calls}=scripted({edit:[{items:[misleading]}],verify:[ok,ok],repair:[{items:[corrected]}]});
    const result=await generateBriefing({...start,feed:{...FEED,language:'fr'},articles:[source]},port,models,{maxRepairs:1});
    expect(calls.map(call=>call.stage)).toEqual(['edit','verify','repair','verify']);
    expect(calls[2].request.user).toContain('V5_RESERVE_YEAR');
    expect(calls[3].request.user).toContain(corrected.body);
    expect(result.items[0].body).toBe(corrected.body);
  });

  it('distinguishes expected approval, the penalty denominator, and an unrelated percentage',()=>{
    const customs={ref:'S1',publishedAt:'2026-09-03T10:44:00Z',text:
      "Le Parlement européen devrait approuver le texte final dans le courant du mois de septembre. Un manquement grave expose l'entreprise à une amende de 6 % de la valeur de ses importations de l'année précédente."};
    const headline='Réforme douanière';
    const bad=frenchQualificationIssues({headline,body:
      'Le Parlement européen doit encore approuver le texte en septembre. Les amendes atteignent 6 % de la valeur annuelle des importations.'},[customs]);
    expect(bad.map(x=>x.split(':')[0])).toEqual(['V5_VOTE_TIMING','V5_PENALTY_BASE']);
    expect(frenchQualificationIssues({headline,body:
      "Le Parlement européen devrait approuver le texte en septembre. Les amendes peuvent atteindre 6 % de la valeur des importations de l'année précédente."},[customs])).toEqual([]);
    expect(frenchQualificationIssues({headline:'Accord provisoire SFDR',body:
      'Le seuil de 70 % concerne les produits catégorisés. Les règles seront applicables deux ans après publication.'},[customs])).toEqual([]);
  });

  it('retains exact writer text and source provenance when consolidation fails',async()=>{
    const second={...draft,headline:'Second funding decision',sources:['S2']};
    const malformed={items:[{...draft,from:[3]}]};
    const {port}=scripted({edit:[{items:[draft]},{items:[second]}],consolidate:[malformed,malformed]});
    const events:import('../src/types').BriefingReviewEvent[]=[];
    const result=await generateBriefing({...start,articles:[article('a-one',FUND),article('b-two',GENESIS)]},port,models,{
      maxEditorChars:10,reviewCheckpoint:async event=>{events.push(event);},
    });
    expect(result.status).toBe('rejected');
    expect(events).toContainEqual(expect.objectContaining({stage:'consolidate',failure:'INVALID_CONSOLIDATION_FROM'}));
    expect(events.filter(event=>event.stage==='writer').flatMap(event=>event.candidates)).toEqual([
      expect.objectContaining({headline:draft.headline,body:draft.body,sourceIds:['a-one']}),
      expect.objectContaining({headline:second.headline,body:second.body,sourceIds:['b-two']}),
    ]);
  });

  it('retains original text and the reason when novelty discards a candidate',async()=>{
    const {port}=scripted({edit:[{items:[draft]}],repair:[{results:[{
      i:0,relation:'repeat',redundant:true,priorIds:['H1'],sameOccurrence:'Same reported decision',delta:'none',
    }]}]});
    const events:import('../src/types').BriefingReviewEvent[]=[];
    const result=await generateBriefing({...start,prior:[past],articles:[article('current',FUND)]},port,models,{
      noveltyGuard:true,noveltyPolicy:'occurrence-aware-v1',editorSelectionPolicy:'preserve-selected-developments-v1',
      reviewCheckpoint:async event=>{events.push(event);},now:()=>new Date(WINDOW.windowEnd),
    });
    expect(result.items).toEqual([]);
    expect(events).toContainEqual(expect.objectContaining({stage:'novelty_excluded',
      candidates:[expect.objectContaining({body:draft.body,sourceIds:['current']})],
      reasons:[expect.objectContaining({reason:expect.stringContaining(past.id)})]}));
  });

  it.each([false,true])('compares source occurrences even when the headline repeats (same occurrence: %s)',async same=>{
    const halt={...draft,headline:'Trading halted',body:''};
    const decision=same?{relation:'repeat',redundant:true,priorIds:['H1'],sameOccurrence:'Both reports cover Monday',delta:'none'}
      :{relation:'new',redundant:false,priorIds:[],sameOccurrence:'',delta:'Another halt on Tuesday'};
    const {port,calls}=scripted({edit:[{items:[halt]}],repair:[{results:[{i:0,...decision}]}],verify:[ok]});
    const source=same?'The exchange confirmed the trading halt on Monday.':'The exchange halted trading again on Tuesday.';
    const result=await generateBriefing({...start,prior:[{...past,headline:halt.headline,body:''}],articles:[article('current',source+' '+FUND)]},port,models,{
      noveltyGuard:true,noveltyPolicy:'occurrence-aware-v1',editorSelectionPolicy:'preserve-selected-developments-v1',
      now:()=>new Date(WINDOW.windowEnd),
    });
    expect(calls.find(c=>c.stage==='repair')?.request.user).toContain(source);
    expect(result.status).toBe(same?'empty':'published');
  });

  it('publishes the entire verified body when the headlines fit',async()=>{
    const body='Subject to shareholder approval. '.repeat(45).trim();
    const {port,calls}=scripted({edit:[{items:[{...draft,body}]}],verify:[ok]});
    const result=await generateBriefing({...start,articles:[article('current',FUND)]},port,models,{});
    expect(result.status).toBe('published');
    expect(result.items[0].body).toBe(body);
    expect(calls.at(-1)?.request.user).toContain(body);
  });

  it('allows useful evidence-backed research synthesis without requiring an original experiment',async()=>{
    const {port,calls}=scripted({edit:[{items:[draft]}],verify:[ok]});
    await generateBriefing({...start,articles:[article('current',FUND)]},port,models,{researchSynthesisPolicy:'eligible-v1'});
    expect(calls[0].request.system).toContain('It does not need a new experiment, benchmark, or model release.');
    expect(calls[0].request.system).toContain('Exclude repetitive commentary and unsupported speculation.');
    expect(calls.map(call=>call.stage)).toEqual(['edit','verify']);
  });
});
