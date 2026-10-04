import {expect,it} from 'vitest';
import {boundShortlist} from './shortlist';
it('protected state, certainty, contradiction, correction, retraction and obligation bypass ordinary caps',()=>{
 const candidates=[{targetVersionId:'ordinary-a',priority:.9,protectedReasons:[]},{targetVersionId:'ordinary-b',priority:.8,protectedReasons:[]},...['CHANGES_STATE','CHANGES_CERTAINTY','CONTRADICTS','CORRECTS','RETRACTS','CORRECTION_OBLIGATION'].map((reason,i)=>({targetVersionId:`protected-${i}`,priority:.1,protectedReasons:[reason]}))];
 const result=boundShortlist(candidates,1);expect(result.selected).toHaveLength(7);expect(result.overflow.map(c=>c.targetVersionId)).toEqual(['ordinary-b']);
});
