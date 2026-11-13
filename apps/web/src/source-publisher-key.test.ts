import {expect,it} from 'vitest';
import {sourcePublisherKey} from './source-publisher-key';
it('matches publisher URLs to their existing RSS and www variants',()=>{
 expect(sourcePublisherKey('rss: https://www.publisher.example/feed.xml')).toBe(sourcePublisherKey('https://publisher.example/'));
 expect(sourcePublisherKey('http://publisher.example/news/')).toBe('publisher.example');
});
it('keeps different social accounts distinct and does not turn topics into publishers',()=>{
 expect(sourcePublisherKey('https://x.com/one/')).not.toBe(sourcePublisherKey('https://x.com/two'));
 expect(sourcePublisherKey('news: Georges Khabbaz')).not.toBe('news.google.com');
});
