import {z} from 'zod';
import {HandoffError} from '@distilled/contracts';
import {semanticGroupSchema,storylineDirectiveSchema,slotKinds,validateConstruction,type SemanticConstruction} from './semantic-state';
import type {ClaimMention} from './claims';
import {validateEventMatch,type EventMatchInput,type EventMatchDecision} from './matchers';
export const constructionSchema=z.object({groups:z.array(semanticGroupSchema.extend({storylineState:storylineDirectiveSchema.optional()})).min(1).max(6),backgroundMentionIds:z.array(z.string()).max(32),originDependencyLabel:z.string().min(1).max(120).nullable().optional(),confidence:z.number().min(0).max(1)}).strict();
const string={type:'string'},nullable={type:['string','null']},ids={type:'array',minItems:1,maxItems:32,items:string};
const object=(properties:Record<string,unknown>)=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
export const constructionWireSchema=object({confidence:{type:'number',minimum:0,maximum:1},originDependencyLabel:nullable,groups:{type:'array',minItems:1,maxItems:6,items:object({claimMentionIds:ids,eventId:nullable,storylineId:nullable,structuralRelation:{type:'string',enum:['SAME_EVENT','NEW_EVENT_EXISTING_STORYLINE','NEW_STORYLINE','DEFER']},epistemicEffects:{type:'array',maxItems:7,items:{type:'string',enum:['CORROBORATES','ADDS_DETAIL','CHANGES_STATE','CHANGES_CERTAINTY','CONTRADICTS','CORRECTS','RETRACTS']}},entities:{type:'array',maxItems:8,items:object({canonicalLabel:string,aliases:{type:'array',minItems:1,maxItems:8,items:string},claimMentionIds:ids})},storylineState:object({lifecycle:{type:'string',enum:['ACTIVE','WATCHING','DORMANT','CLOSED']},openQuestionMentionIds:{type:'array',maxItems:12,items:string},expectedNextDate:{anyOf:[{type:'null'},object({claimMentionId:string,text:string})]}}),slots:{type:'array',maxItems:12,items:object({kind:{type:'string',enum:slotKinds},claimMentionId:string,entityLabel:nullable,value:string,asOf:nullable})}})},backgroundMentionIds:{type:'array',maxItems:32,items:string}});
export function parseConstruction(raw:unknown,mentions:ClaimMention[],input:EventMatchInput,provenance:EventMatchDecision['provenance']):SemanticConstruction {
 const parsed=constructionSchema.parse(raw),value=validateConstruction({...parsed,provenance},mentions);
 if(!value.groups.some(g=>g.claimMentionIds.some(id=>mentions.find(m=>m.id===id)?.reportingRole!=='BACKGROUND_RECAP')))throw new HandoffError('SCOPE_DENIED');
 for(const group of value.groups)validateEventMatch({structuralRelation:group.structuralRelation,eventId:group.eventId??undefined,storylineId:group.storylineId??undefined,epistemicEffects:group.epistemicEffects,confidence:1,provenance},input);
 // Background is a reporting-role label, never authorization to drop an
 // attributed quantity, uncertainty or negated outcome from semantic grouping.
 for(const id of value.backgroundMentionIds){const m=mentions.find(m=>m.id===id)!;if(m.quantities.length||m.certainty.hedges.length||m.qualifiers.length||m.attribution)throw new HandoffError('SCOPE_DENIED')}
 return value;
}
