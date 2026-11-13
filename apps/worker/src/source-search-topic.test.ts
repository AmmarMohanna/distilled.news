import {expect,it} from 'vitest';
import {topicSearchGate,sourceSearchCacheQuery} from './source-search-topic';
it('requires both parts of a named feed subject instead of accepting broad AI overlap',()=>{
 const topic=topicSearchGate({title:'Ammar Mohanna',description:'Latest news and projects related to Ammar Mohanna. AI-powered summaries.'})!;
 expect(topic.matches('Ammar Mohanna presents a project')).toBe(true);
 expect(topic.matches('AI workforce trends at AUB')).toBe(false);
 expect(topic.matches('Ammar discusses AI')).toBe(false);
});
it('uses interest terms when a generic feed title is not the subject',()=>{
 const topic=topicSearchGate({title:'My feed',description:'Artificial intelligence and machine learning research'})!;
 expect(topic.matches('New artificial intelligence model')).toBe(true);
 expect(topic.matches('Local traffic incident')).toBe(false);
 expect(sourceSearchCacheQuery('AI',{title:'Ammar',description:'One topic'})).not.toBe(sourceSearchCacheQuery('AI',{title:'Georges',description:'Another topic'}));
});
