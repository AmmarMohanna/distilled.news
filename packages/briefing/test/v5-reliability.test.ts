import {describe,expect,it} from 'vitest';
import {generateBriefing} from '../src/engine';
import {occurrenceNovelty} from '../src/novelty';
import {UsageMeter} from '../src/model';
import {frenchQualificationIssues} from '../src/qualification-scope';
import {selectWithinReaderBudget} from '../src/reader-budget-selection';
import type {BriefingModels,PriorItem} from '../src/types';
import {FEED,FUND,GENESIS,MODELS,WINDOW,article,scripted} from './helpers';

const models:BriefingModels={...MODELS,generation:{
  model:'candidate',provider:'test',price:{prompt:1,completion:1},contextTokens:200_000,
  maxOutputTokens:6500,prompt:'v5-source-first-v5',
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

  it('drops a whole lower-priority story after consolidation and verifies the intact lead',async()=>{
    const low={...draft,headline:'A separate research report',body:'More detail about that report. '.repeat(32),
      sources:['S2'],importance:3 as const};
    const {port,calls}=scripted({edit:[{items:[draft]},{items:[low]}],
      consolidate:[{items:[{...draft,from:[0],importance:3},{...low,from:[1]}],cut:[]}],verify:[ok]});
    const result=await generateBriefing({...start,articles:[article('a-lead',FUND),article('b-later',GENESIS)]},
      port,models,{maxEditorChars:10,editorSelectionPolicy:'preserve-selected-developments-v1'});
    expect(result.status).toBe('published');
    expect(result.items).toEqual([expect.objectContaining({body:draft.body,importance:1,sourceIds:['a-lead']})]);
    expect(result.omitted).toContainEqual(expect.objectContaining({sourceIds:['b-later'],reason:expect.stringContaining('Excluded whole')}));
    expect(calls.map(call=>call.stage)).toEqual(['edit','edit','consolidate','verify']);
    expect(calls.at(-1)?.request.user).toContain(draft.body);
    expect(calls.at(-1)?.request.user).not.toContain(low.headline);
  });

  it('holds when the minimum lead set cannot fit and counts multilingual prose',()=>{
    const ar={headline:'وزير المالية',body:'انخفض السعر ١٬٠٠٠ ليرة.',importance:1 as const};
    const fr={headline:'L’Union l’approuve.',body:'L’Union l’approuve.',importance:1 as const};
    expect(selectWithinReaderBudget('ar',[ar],5)).toEqual({fits:false,requiredWords:6});
    expect(selectWithinReaderBudget('fr',[fr],2)).toEqual({fits:true,retained:[fr],excluded:[]});
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
});
