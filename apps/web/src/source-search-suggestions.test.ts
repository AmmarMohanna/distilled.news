import {expect,it} from 'vitest';
import {sourceSearchSuggestions} from './source-search-suggestions';
it('completes the feed subject, recent searches and publisher aliases locally',()=>{
 expect(sourceSearchSuggestions('geo','Georges Khabbaz')).toContain('Georges Khabbaz');
 expect(sourceSearchSuggestions('aljadd','Ammar Mohanna')).toContain('Al Jadeed');
 expect(sourceSearchSuggestions('georges i','People',['Georges interview'])).toContain('Georges interview');
});
it('completes phrases from interests and bounds and deduplicates suggestions',()=>{
 expect(sourceSearchSuggestions('theater pro','Georges Khabbaz',[],'Films, theater productions and interviews.')).toContain('theater productions and interviews');
 expect(sourceSearchSuggestions('Geo','Georges Khabbaz',['Georges Khabbaz'])).toEqual(['Georges Khabbaz']);
 expect(sourceSearchSuggestions('g','Georges Khabbaz')).toEqual([]);
});
