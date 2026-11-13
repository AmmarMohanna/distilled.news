import {expect,it} from 'vitest';
import {sourceSearchSuggestions} from './source-search-suggestions';
it('uses only matching known publisher names as a local fallback',()=>{
 expect(sourceSearchSuggestions('aljadd')).toContain('Al Jadeed');
 expect(sourceSearchSuggestions('reu')).toContain('Reuters');
});
it('does not invent person names or description fragments as completions',()=>{
 expect(sourceSearchSuggestions('amm')).toEqual([]);
 expect(sourceSearchSuggestions('projects')).toEqual([]);
 expect(sourceSearchSuggestions('g')).toEqual([]);
});
