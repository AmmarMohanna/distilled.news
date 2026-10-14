import {it,expect} from 'vitest';
import {editorialPlanWireSchemaFor} from './editorial-plan';
import type {ShortlistRecord} from './shortlist';
const candidate={targetType:'EVENT',targetVersionId:'v',stableTargetId:'e',evidenceRevisionIds:['r'],eventVersionIds:['v'],facts:[{id:'fact',text:"AI minister warns 'likely' UK's cyber defences will be breached.",evidenceRevisionIds:['r'],claimMentionIds:['m']}],flags:[],effects:['CHANGES_CERTAINTY'],protectedReasons:['CHANGES_CERTAINTY'],correctionObligationIds:[],priority:1};
const scope={candidates:[candidate],ledger:[],obligations:[]} as unknown as ShortlistRecord;
function decisions(state:ShortlistRecord){return editorialPlanWireSchemaFor(state as never).properties.stories.items.anyOf.flatMap(b=>b.properties.decision.enum)}
it('never offers suppression that protected-fact validation would reject; deferral remains available',()=>{expect(decisions(scope)).toContain('DEFER');expect(decisions(scope)).toContain('SELECT');expect(decisions(scope)).not.toContain('SUPPRESS')});
it('ordinary reader-unseen work retains editorial suppression',()=>{const s=structuredClone(scope);s.candidates[0].protectedReasons=[];expect(decisions(s)).toContain('SUPPRESS')});
it('fully communicated protected effects may be suppressed when no obligation remains',()=>{const s=structuredClone(scope);s.ledger=[{id:'prior',eventIds:['e'],storylineIds:[],claimFacts:[candidate.facts[0].text]}] as never;expect(decisions(s)).toContain('SUPPRESS')});
import {keyedEditorialPlanWireSchemaFor} from './editorial-plan';
import {expandedSchema} from './schema-test-utils';
it('keyed decisions cannot attach a foreign correction obligation from the global pool',()=>{const s=structuredClone(scope);s.obligations=[{id:'other-obligation'}] as never;const schema=expandedSchema(keyedEditorialPlanWireSchemaFor(s as never)) as any;for(const branch of schema.properties.stories.properties.v.anyOf)expect(branch.properties.correctionObligationIds.maxItems).toBe(0)});
