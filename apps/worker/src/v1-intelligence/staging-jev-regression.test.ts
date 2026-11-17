import {expect,it} from 'vitest';
import fixture from './fixtures/staging-jev-effect.json';
import {parseSemanticAnswers} from './semantic-provider';
const questions={effect:{kind:'CHOICE' as const,instructions:'Effect',criteria:Object.fromEntries(['CORROBORATES','ADDS_DETAIL','CHANGES_STATE','CHANGES_CERTAINTY','CONTRADICTS','CORRECTS','RETRACTS'].map(s=>[s,s]))},forward:{kind:'BOOLEAN' as const,instructions:'Entails'},reverse:{kind:'BOOLEAN' as const,instructions:'Entails'},novelty:{kind:'SCORE' as const,instructions:'Novelty',levels:['none','small detail','material change','major consequence']}};
it('accepts the real replayed staging envelope and derives ordinal novelty from normalized probabilities',()=>{
 const a=parseSemanticAnswers(fixture.envelope.answers,questions);
 expect(a.effect).toMatchObject({kind:'CHOICE',choice:'CORROBORATES'});
 expect(a.novelty.kind).toBe('SCORE');expect((a.novelty as {value:number}).value).toBeCloseTo(.01/3,12);
});
it('accepts only rounding-consistent ordinal scores, including independently rounded probability mass',()=>{
 const raw=structuredClone(fixture.envelope.answers);raw.novelty.score=.02; // Mean .01: feasible within the provider two-decimal rounding intervals.
 expect((parseSemanticAnswers(raw,questions).novelty as {value:number}).value).toBeCloseTo(.01/3,12);
 raw.novelty.score=.5;expect(()=>parseSemanticAnswers(raw,questions)).toThrow();
 raw.novelty.score=.05;raw.novelty.probabilities['0']=.8;expect(()=>parseSemanticAnswers(raw,questions)).toThrow();
});
it('still rejects unknown answers, incomplete level support, out-of-range values and contradictions at high precision',()=>{
 const raw:any=structuredClone(fixture.envelope.answers);raw.forward.noul=1.01;expect(()=>parseSemanticAnswers(raw,questions)).toThrow();
 raw.forward.noul=.94;delete raw.novelty.probabilities['3'];expect(()=>parseSemanticAnswers(raw,questions)).toThrow();
 const ordinal={n:{kind:'SCORE' as const,instructions:'n',levels:['low','high']}};
 expect(()=>parseSemanticAnswers({n:{type:'score',score:.3333,confidence:.9,probabilities:{'0':.7,'1':.3}}},ordinal)).toThrow();
});

