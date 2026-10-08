import {it,expect} from 'vitest';
import {changedCommunicatedSpans} from './correction-materiality';
const span=(text:string,field:'title'|'body'='body')=>({field,text});
const doc=(body:string,title?:string)=>({title,body});
it('an unchanged communicated claim is not changed by added independent reporting',()=>{
 const changes=changedCommunicatedSpans([span('Company A raised $90 million.')],doc('Company A raised $90 million.'),doc('Company A raised $90 million. Company A also appointed a new CEO.'));
 expect(changes).toEqual([]);
});
it('a changed amount in a communicated claim is detected',()=>{
 const changes=changedCommunicatedSpans([span('Company A raised $90 million.')],doc('Company A raised $90 million.'),doc('Company A raised $120 million.'));
 expect(changes).toHaveLength(1);expect(changes[0].counterparts).toEqual(['Company A raised $120 million.']);
});
it('typography and sentence-final punctuation are not changes',()=>{
 expect(changedCommunicatedSpans([span('The minister said “yes”.')],doc('The minister said “yes”.'),doc('The minister said "yes"'))).toEqual([]);
});
it('only the materially changed claim in a multi-claim source is reported',()=>{
 const previous=doc('Company A raised $90 million. Company B hired 40 engineers. The vote is on Friday.');
 const current=doc('Company A raised $90 million. Company B hired 60 engineers. The vote is on Friday.');
 const changes=changedCommunicatedSpans([span('Company A raised $90 million.'),span('Company B hired 40 engineers.'),span('The vote is on Friday.')],previous,current);
 expect(changes.map(c=>c.span.text)).toEqual(['Company B hired 40 engineers.']);
});
it('a communicated claim negated or removed is reported, never silently kept',()=>{
 expect(changedCommunicatedSpans([span('Parliament approved the reform.')],doc('Parliament approved the reform.'),doc('Parliament did not approve the reform.'))).toHaveLength(1);
 expect(changedCommunicatedSpans([span('Parliament approved the reform.')],doc('Parliament approved the reform.'),doc('Unrelated reporting.'))).toHaveLength(1);
});
it('a title-only communicated claim is matched across fields',()=>{
 expect(changedCommunicatedSpans([span('Company A raises $90 million','title')],{title:'Company A raises $90 million',body:'Details.'},{title:'Company A raises $90 million',body:'Details. More.'})).toEqual([]);
});
it.each([
 ['Company A competes with Instinct, Muse and Bee.','Company A competes with Instinct, Muse, and Bee.'],
 ['Company A competes with Instinct, Muse, and Bee.','Company A competes with Instinct, Muse and Bee.'],
 ['In 2024, Company A competes with Instinct, Muse, or Bee.','In 2024, Company A competes with Instinct, Muse or Bee.'],
 ['The panel included Ana Silva, Li Wei, and Omar Haddad.','The panel included Ana Silva, Li Wei and Omar Haddad.'],
])('enumeration punctuation alone is not a change: %s | %s',(a,b)=>{
 expect(changedCommunicatedSpans([span(a)],doc(a),doc(b))).toEqual([]);
});
it.each([
 ['appositive closed by the comma','Company A competes with Instinct, the maker of Muse, and Bee.','Company A competes with Instinct, the maker of Muse and Bee.'],
 ['two items: the comma separates clauses','Company A hired Smith, and Jones resigned.','Company A hired Smith and Jones resigned.'],
 ['lowercase single-word items can be appositions','Company A met Smith, president, and Jones.','Company A met Smith, president and Jones.'],
 ['membership changes with the comma','Company A competes with Instinct, Muse, and Bee.','Company A competes with Instinct, Muse and Bee and Cora.'],
 ['an item is replaced','Company A competes with Instinct, Muse, and Bee.','Company A competes with Instinct, Muse, and Cora.'],
 ['negation added','Company A competes with Instinct, Muse, and Bee.','Company A does not compete with Instinct, Muse and Bee.'],
 ['substantive comma change','Company A, which competes with Instinct, grew.','Company A which competes with Instinct, grew.'],
])('substantive or ambiguous punctuation stays a change: %s',(_,a,b)=>{
 expect(changedCommunicatedSpans([span(a)],doc(a),doc(b))).toHaveLength(1);
});
