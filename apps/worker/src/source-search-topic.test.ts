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
it.each([
 {title:'Economy',description:'Economy, finance and international trade',article:'International trade grows as companies invest'},
 {title:'Économie',description:'Économie, entreprises, finance et commerce international',article:'Le commerce mondial en progression'},
 {title:'اقتصاد',description:'الاقتصاد والشركات والتجارة',article:'نمو التجارة واستثمارات الشركات'}
])('keeps the full stated interests when the short broad title is $title',context=>{
 const topic=topicSearchGate(context)!;expect(topic.matches(context.article)).toBe(true);expect(topic.matches('A football match and new stadium')).toBe(false);
});
it('does not strip Arabic letters from an exact named subject',()=>{
 const topic=topicSearchGate({title:'وليد مهنا',description:'أخبار وليد مهنا'})!;
 expect(topic.matches('وليد مهنا يعلن مشروعاً')).toBe(true);expect(topic.matches('ليد مهنا يعلن مشروعاً')).toBe(false);
});
it('does not broaden a named geography into every political story',()=>{
 const topic=topicSearchGate({title:'France',description:'Politics and elections in France'})!;
 expect(topic.matches('France holds elections')).toBe(true);expect(topic.matches('Politics and elections in another country')).toBe(false);
});
