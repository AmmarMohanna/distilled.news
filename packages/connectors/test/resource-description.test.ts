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
