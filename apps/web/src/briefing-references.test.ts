import {expect,it} from 'vitest';
import {briefingReferences} from './briefing-references';
import type {BriefingEdition,BriefingEvidence} from '@distilled/core';
const evidence=(url:string,id:string):BriefingEvidence=>({messageId:id,sourceId:'bbc',sourceTitle:'BBC',sourceType:'channel',sourceUrl:url,postedAt:'2026-11-18T07:15:33Z',text:'Retained evidence',links:[url],media:[]});
it('numbers one BBC article once across retained revisions without merging different BBC articles or changing inputs',()=>{
 const edition={sections:[{evidence:[evidence('https://www.bbc.co.uk/news/articles/first?at_medium=RSS&at_campaign=rss','one'),evidence('https://www.bbc.co.uk/news/articles/first','two'),evidence('https://www.bbc.co.uk/news/articles/second','three')]},{evidence:[evidence('https://other.example/report','four')]}]} as Pick<BriefingEdition,'sections'>;
 const before=JSON.stringify(edition),references=briefingReferences(edition);
 expect(references.map(row=>({number:row.number,indexes:row.evidenceIndexes}))).toEqual([{number:1,indexes:[0,1]},{number:2,indexes:[2]},{number:3,indexes:[0]}]);
 expect(JSON.stringify(edition)).toBe(before);
});
it('keeps meaningful query identities, unknown feed-only identities and independent social messages distinct',()=>{
 const entries=[evidence('https://publisher.example/report?id=1','a'),evidence('https://publisher.example/report?id=2','b'),evidence('https://publisher.example/rss','c'),evidence('https://publisher.example/rss','d'),{...evidence('https://publisher.example/report?id=1','post-one'),sourceKind:'x_profile' as const},{...evidence('https://publisher.example/report?id=1','post-two'),sourceKind:'x_profile' as const}];
 expect(briefingReferences({sections:[{title:'',summary:'',evidence:entries}]})).toHaveLength(6);
});
it('uses retained social post identities rather than a shared external article link',()=>{
 const entries=[{...evidence('https://publisher.example/article','one'),sourceKind:'x_profile' as const,sourceUrl:'https://x.com/author/status/123'},{...evidence('https://publisher.example/article','revision-two'),sourceKind:'x_profile' as const,sourceUrl:'https://x.com/author/status/123'},{...evidence('https://publisher.example/article','different-post'),sourceKind:'x_profile' as const,sourceUrl:'https://x.com/author/status/456'}];
 expect(briefingReferences({sections:[{title:'',summary:'',evidence:entries}]}).map(row=>row.evidenceIndexes)).toEqual([[0,1],[2]]);
});
it('does not merge different primary homepages because a secondary link happens to be shared',()=>{
 const entries=[{...evidence('https://one.example/','one'),links:['https://one.example/','https://shared.example/context']},{...evidence('https://two.example/','two'),links:['https://two.example/','https://shared.example/context']}];
 expect(briefingReferences({sections:[{title:'',summary:'',evidence:entries}]})).toHaveLength(2);
});
