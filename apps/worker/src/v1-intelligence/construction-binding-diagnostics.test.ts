import {it,expect} from 'vitest';
import cases from './fixtures/construction-binding-20261013.json';
import {parseConstruction} from './semantic-construction';
it.each(cases)('retained operation $operationId reports the exact invariant without weakening rejection',c=>{
 const input={candidates:c.events.map(id=>({id})),storylineIds:c.storylines} as any;
 let rejected:any;try{parseConstruction(c.response,c.mentions as any,input,{scorer:'GPT',policyVersion:'retained'})}catch(e){rejected=e}
 expect(rejected?.code).toBe('SCOPE_DENIED');expect(rejected?.binding?.invariant).toBe(c.expectedInvariant);expect(rejected?.binding?.path).toBeInstanceOf(Array);
});
