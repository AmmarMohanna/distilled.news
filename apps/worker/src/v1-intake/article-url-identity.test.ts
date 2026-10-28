import{it,expect}from'vitest';import{sameArticleUrl}from'./article-url-identity';
const url='https://publisher.example/news/report';
it.each(['traffic_source=rss','utm_source=rss&utm_medium=feed','fbclid=tracking','gclid=tracking'])('ignores known tracking query %s',query=>{expect(sameArticleUrl(url+'?'+query,url)).toBe(true)});
it('preserves meaningful parameters while removing tracking',()=>{expect(sameArticleUrl(url+'?edition=ar&traffic_source=rss',url+'?edition=ar')).toBe(true);expect(sameArticleUrl(url+'?edition=ar&traffic_source=rss',url+'?edition=en')).toBe(false)});
it.each([url+'?id=another','https://other.example/news/report','http://publisher.example/news/report','https://user:secret@publisher.example/news/report','https://publisher.example/news/another'])('rejects different identities: %s',other=>{expect(sameArticleUrl(url,other)).toBe(false)});
it('accepts existing trailing-slash and fragment aliases without broad query removal',()=>{expect(sameArticleUrl(url+'/#entry',url)).toBe(true);expect(sameArticleUrl(url+'?source=article-2',url)).toBe(false)});
it('accepts the observed NEJM attribution without discarding arbitrary referrer values',()=>{
 const paper='https://www.nejm.org/doi/full/10.1056/NEJMp2213814';
 expect(sameArticleUrl(paper,paper+'?referrer=https%3A%2F%2Fwww.google.com%2F')).toBe(true);
 expect(sameArticleUrl(paper,paper+'?referrer=another-article')).toBe(false);
 expect(sameArticleUrl(url,url+'?referrer=https%3A%2F%2Fwww.google.com%2F')).toBe(false);
});
