import {it,expect} from 'vitest';
import fixture from './fixtures/overnight-feed-fit.json';
import {validateEditorialPlan,editorialPlanWireSchemaFor} from './editorial-plan';
import {compactEditorialInput} from './editorial-transport';
import type {ShortlistRecord} from './shortlist';
import type {EditorialPlanBody} from './editorial-plan';
it('the persisted generic consumer-interest choice cannot SELECT an explicitly out-of-scope fact',()=>{
 const scope=fixture.shortlist as unknown as ShortlistRecord,proposal=structuredClone(fixture.proposal) as EditorialPlanBody;
 const story=proposal.stories.find(s=>s.targetVersionId===fixture.selectedTarget)!;
 story.feedFit='OUT_OF_SCOPE';expect(()=>validateEditorialPlan(proposal,scope)).toThrow();
 Object.assign(story,{decision:'SUPPRESS',treatment:'OMIT',mustIncludeFactIds:[],newUnderstandingFactIds:[],relevanceRationale:'No supported connection to this Feed interest; freshness and consumer impact alone do not establish relevance.'});
 expect(validateEditorialPlan(proposal,scope).stories.find(s=>s.targetVersionId===fixture.selectedTarget)).toMatchObject({decision:'SUPPRESS',deltaType:'NEW',feedFit:'OUT_OF_SCOPE'});
});
it('uncertain relevance retains a fair semantic chance and the real wire requests an auditable feed-fit judgment',()=>{
 const scope=fixture.shortlist as unknown as ShortlistRecord,proposal=structuredClone(fixture.proposal) as EditorialPlanBody;
 proposal.stories.find(s=>s.targetVersionId===fixture.selectedTarget)!.feedFit='UNCERTAIN';expect(validateEditorialPlan(proposal,scope)).toEqual(proposal);
 const schema=editorialPlanWireSchemaFor(compactEditorialInput(scope).state);
 expect(schema.properties.stories.items.anyOf.every(b=>b.required.includes('feedFit'))).toBe(true);
});
it('new comparative results require explicit Feed fit while immutable legacy proposals remain readable',()=>{
 const scope=fixture.shortlist as unknown as ShortlistRecord,proposal=structuredClone(fixture.proposal) as EditorialPlanBody;
 expect(validateEditorialPlan(proposal,scope)).toEqual(proposal);
 expect(()=>validateEditorialPlan(proposal,scope,{requireFeedFit:true})).toThrow('EDITORIAL_FEED_FIT_MISSING');
 for(const story of proposal.stories)story.feedFit='UNCERTAIN';
 expect(validateEditorialPlan(proposal,scope,{requireFeedFit:true})).toEqual(proposal);
});
