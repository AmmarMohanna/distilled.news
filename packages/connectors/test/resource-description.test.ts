import{it,expect}from'vitest';import{extractPublicHtml}from'../src';
const url='https://publisher.example/topics/outbreaks',description='Researchers describe emerging pathogens, their detection and the limits of existing surveillance. '.repeat(5);
it('retains a bound collection description as catalogue evidence without substituting article cards',()=>{
 const h='<h1>Outbreak collection</h1><script type="application/ld+json">'+JSON.stringify({'@type':'Collection','@id':url,about:description})+'</script><main><article><h2><a href="/other">Other paper</a></h2><p>Unrelated card</p></article></main>';
 const r=extractPublicHtml(h,url+'/magazine');expect(r).toMatchObject({pageKind:'catalogue',contentKind:'CATALOGUE',body:description});
 expect(extractPublicHtml(h,'https://publisher.example/topics/different/magazine').body).not.toBe(description);
});
it('retains only a video resource description, without claiming its transcript or unrelated footer prose',()=>{
 const h='<h1>Surveillance video</h1><main><div class="video-description"><div class="field__item">'+description+'</div></div><p>Player privacy notice</p></main><footer>Footer text</footer>';
 expect(extractPublicHtml(h,'https://publisher.example/video/surveillance')).toMatchObject({pageKind:'catalogue',contentKind:'CATALOGUE',body:description.trim()});
 expect(extractPublicHtml(h,'https://publisher.example/news/index').pageKind).not.toBe('catalogue');
});
it('retains a bound short video description and excludes unrelated video cards',()=>{
 const video='https://publisher.example/video/report',description='Health experts list five emerging infections and explain which symptoms should prompt medical assessment.';
 const h='<meta property="og:title" content="Health report"><h1></h1><script type="application/ld+json">'+JSON.stringify({'@type':'VideoObject',mainEntityOfPage:{'@id':video},name:'Health report',description})+'</script><main><p>'+('Unrelated video card. '.repeat(20))+'</p></main>';
 expect(extractPublicHtml(h,video)).toMatchObject({title:'Health report',pageKind:'catalogue',body:description});
 expect(extractPublicHtml(h,'https://publisher.example/video/another').body).not.toBe(description);
});
it('recognizes a subscription preview even when an article element is present',()=>{
 const h='<script type="application/ld+json">'+JSON.stringify({'@type':'NewsArticle',url,isAccessibleForFree:false})+'</script><article><h1>Report</h1><div class="paywall-content">Preview this article<p>A short public preview.</p></div></article>';
 expect(extractPublicHtml(h,url)).toMatchObject({accessRestricted:true});
});
