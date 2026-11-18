import {expect,it} from 'vitest';
import {sourcePublisherKey,sourceIsAlreadyAdded} from './source-publisher-key';
it('matches publisher URLs to their existing RSS and www variants',()=>{
 expect(sourcePublisherKey('rss: https://www.publisher.example/feed.xml')).toBe(sourcePublisherKey('https://publisher.example/'));
 expect(sourcePublisherKey('http://publisher.example/news/')).toBe('publisher.example');
});
it('hides the exact followed profile without hiding different pages or query identities on the same website',()=>{
 const selected=['https://www.aub.edu.lb/pages/profile.aspx?MemberId=am288'];
 expect(sourceIsAlreadyAdded('https://aub.edu.lb/pages/profile.aspx?MemberId=am288&utm_source=search#research',selected)).toBe(true);
 expect(sourceIsAlreadyAdded('https://aub.edu.lb/pages/profile.aspx?MemberId=another',selected)).toBe(false);
 expect(sourceIsAlreadyAdded('https://aub.edu.lb/research/project',selected)).toBe(false);
 expect(sourceIsAlreadyAdded('https://aub.edu.lb/',selected)).toBe(false);
 expect(sourceIsAlreadyAdded('https://aub.edu.lb/research/project',['rss: https://www.aub.edu.lb/rss'])).toBe(true);
});
it('keeps different social accounts distinct and does not turn topics into publishers',()=>{
 expect(sourcePublisherKey('https://x.com/one/')).not.toBe(sourcePublisherKey('https://x.com/two'));
 expect(sourcePublisherKey('news: Georges Khabbaz')).not.toBe('news.google.com');
});
