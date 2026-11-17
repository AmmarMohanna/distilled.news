import{it,expect}from'vitest';import{sameArticleUrl}from'./article-url-identity';
const url='https://publisher.example/news/report';
const uefa='https://www.uefa.com/womenschampionsleague/news/02a9-21a9b14a50b6-6f4a52d748c0-1000--old-headline/';
it('accepts a UEFA headline change only for the identical full CMS article identity',()=>{
 expect(sameArticleUrl(uefa,uefa.replace('old-headline','updated-headline'))).toBe(true);
 expect(sameArticleUrl(uefa,uefa.replace('womenschampionsleague','news-media').replace('old-headline','updated-headline'))).toBe(true);
 expect(sameArticleUrl(uefa,uefa.replace('womenschampionsleague','news-media').replace('21a9b14a50b6','21a9b14a50b7'))).toBe(false);
 for(const other of [uefa.replace('21a9b14a50b6','21a9b14a50b7'),uefa.replace('womenschampionsleague','uefachampionsleague'),uefa.replace('www.uefa.com','other.example'),uefa.replace('https:','http:'),uefa+'?edition=another'])expect(sameArticleUrl(uefa,other)).toBe(false);
 expect(sameArticleUrl('https://www.uefa.com/news/old-headline','https://www.uefa.com/news/updated-headline')).toBe(false);
});
it.each(['traffic_source=rss','utm_source=rss&utm_medium=feed','at_medium=RSS&at_campaign=rss','fbclid=tracking','gclid=tracking'])('ignores known tracking query %s',query=>{expect(sameArticleUrl(url+'?'+query,url)).toBe(true)});
it('preserves meaningful parameters while removing tracking',()=>{expect(sameArticleUrl(url+'?edition=ar&traffic_source=rss',url+'?edition=ar')).toBe(true);expect(sameArticleUrl(url+'?edition=ar&traffic_source=rss',url+'?edition=en')).toBe(false)});
it.each([url+'?id=another','https://other.example/news/report','http://publisher.example/news/report','https://user:secret@publisher.example/news/report','https://publisher.example/news/another'])('rejects different identities: %s',other=>{expect(sameArticleUrl(url,other)).toBe(false)});
it('accepts existing trailing-slash and fragment aliases without broad query removal',()=>{expect(sameArticleUrl(url+'/#entry',url)).toBe(true);expect(sameArticleUrl(url+'?source=article-2',url)).toBe(false)});
it('accepts the observed NEJM attribution without discarding arbitrary referrer values',()=>{
 const paper='https://www.nejm.org/doi/full/10.1056/NEJMp2213814';
 expect(sameArticleUrl(paper,paper+'?referrer=https%3A%2F%2Fwww.google.com%2F')).toBe(true);
 expect(sameArticleUrl(paper,paper+'?referrer=another-article')).toBe(false);
 expect(sameArticleUrl(url,url+'?referrer=https%3A%2F%2Fwww.google.com%2F')).toBe(false);
});
it('accepts publisher RSS attribution on the same article without hiding another article identity',()=>{
 const article='https://www.bbc.com/arabic/articles/c9m2j8pry2ndo';
 expect(sameArticleUrl(article+'?at_medium=RSS&at_campaign=rss',article)).toBe(true);
 expect(sameArticleUrl(article,article+'?at_medium=RSS&at_campaign=rss')).toBe(true);
 expect(sameArticleUrl(article+'?at_medium=other&at_campaign=another&at_link_type=web',article)).toBe(true);
 expect(sameArticleUrl('https://www.bbc.co.uk/news/articles/c9m2j8pry2ndo?at_medium=newsletter','https://www.bbc.co.uk/news/articles/c9m2j8pry2ndo')).toBe(true);
 expect(sameArticleUrl('https://publisher.example/news/report?at_medium=RSS&at_campaign=feed',url)).toBe(true);
 expect(sameArticleUrl('https://publisher.example/news/report?at_medium=RSS&edition=ar',url+'?edition=ar')).toBe(true);
 for(const other of [article.replace('c9m2j8pry2ndo','c9m2j8pry2ndp'),article+'?article=other',article+'?id=other',article.replace('www.bbc.com','other.example')+'?at_medium=RSS&at_campaign=rss'])expect(sameArticleUrl(article+'?at_medium=RSS&at_campaign=rss',other)).toBe(false);
});

it('compares percent escape casing without decoding separators or folding path text',()=>{
 expect(sameArticleUrl('https://publisher.example/%d9%85','https://publisher.example/%D9%85')).toBe(true);
 expect(sameArticleUrl('https://publisher.example/a%2fb','https://publisher.example/a/b')).toBe(false);
 expect(sameArticleUrl('https://publisher.example/Story','https://publisher.example/story')).toBe(false);
 expect(sameArticleUrl('https://publisher.example/story?id=A','https://publisher.example/story?id=a')).toBe(false);
});
