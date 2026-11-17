import {it,expect} from 'vitest';
import {parseUniqueModelJson,DuplicateModelKeyError} from './strict-model-json';
it('rejects duplicate and escaped-equivalent keys before last-value-wins parsing',()=>{
 for(const raw of ['{"dispositionByUnitId":{"C0":"G0","C0":"BACKGROUND"}}','{"dispositionByUnitId":{"C0":"G0","\\u00430":"BACKGROUND"}}']){
  try{parseUniqueModelJson(raw);throw Error('UNSAFE_ACCEPTANCE')}catch(e){expect(e).toBeInstanceOf(DuplicateModelKeyError);expect((e as DuplicateModelKeyError).mechanicalIssues[0]).toMatchObject({code:'DUPLICATE_JSON_KEY',pointer:'/dispositionByUnitId/C0'});expect((e as DuplicateModelKeyError).rawResponse).toBe(raw)}
 }
});
it('permits repeated keys in different objects, escaped quotes, arrays and literal text',()=>{
 const raw='{"groups":[{"id":"G0"},{"id":"G1"}],"text":"\\\"C0\\\": 2", "n":-1.2e3,"x":null,"y":true}';
 expect(parseUniqueModelJson(raw)).toEqual(JSON.parse(raw));
 expect(()=>parseUniqueModelJson('{"a":1,}')).toThrow();
});
