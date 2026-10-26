import {expect,it} from 'vitest';
import {editorUser,verifyUser} from '../src/prompts';
import {prepareArticles} from '../src/prepare';
import {article,FEED,WINDOW} from './helpers';

it('presents a V3 prior story once instead of repeating all its headline/body text',()=>{
 const full='Reported warning\nOfficials say the road may close after inspection; it has not closed.';
 const prior=[{id:'edition:story',at:'2026-10-23T10:00:00Z',headline:full,body:full}];
 const before=JSON.stringify(prior);const {prepared}=prepareArticles([article('new','Officials gave a separate safety update with no change to the road warning.')]);
 for(const user of [editorUser({feed:FEED,...WINDOW,prior,articles:prepared}),verifyUser({windowEnd:WINDOW.windowEnd,prior,sources:prepared,items:[]})]){
  expect(user.split(full)).toHaveLength(2);
  expect(user).toContain('[edition:story] 2026-10-23');
  expect(user).toContain('may close after inspection; it has not closed');
 }
 expect(JSON.stringify(prior)).toBe(before);
});
it('preserves additional published claims while avoiding the repeated first claim',()=>{
 const first='Launch planned\nThe project remains subject to approval.';
 const body=first+'\nThe authority also corrected the previously reported deadline.';
 const user=editorUser({feed:FEED,...WINDOW,articles:[],prior:[{id:'multi',at:WINDOW.windowStart,headline:first,body}]});
 expect(user.split(first)).toHaveLength(2);
 expect(user).toContain('The authority also corrected the previously reported deadline.');
});
it('keeps distinct legacy titles and bodies unchanged',()=>{
 const user=editorUser({feed:FEED,...WINDOW,articles:[],prior:[{id:'legacy',at:WINDOW.windowStart,headline:'Power supply',body:'The ministry plans a temporary outage.'}]});
 expect(user).toContain('Power supply: The ministry plans a temporary outage.');
});
