import {expect,it,vi} from 'vitest';
import {searchSourceCandidates} from './source-search';
import {sourceSearchCacheQuery} from './source-search-topic';
import type {Env} from './types';
vi.mock('./agentops-assessment',()=>({campaignAssessmentFetcher:(_env:Env,_owner:string,fetcher:typeof fetch)=>fetcher}));
const categories=[
 {title:'Economy and Finance',description:'Economy, finance and international trade',first:'Economy growth strengthens exports',second:'Finance markets fund new businesses',extra:'International trade expands'},
 {title:'Science and Technology',description:'Science, technology and research',first:'Science research discovers a new material',second:'Technology products gain new capabilities',extra:'Research reveals new findings'},
 {title:'Économie et Finance',description:'Économie, finance et commerce international',first:'La croissance de l’économie renforce les exportations',second:'La finance soutient les entreprises',extra:'Le commerce international progresse'},
 {title:'Sciences et Technologies',description:'Sciences, technologies et recherche',first:'La science progresse grâce à une nouvelle découverte',second:'Une technologie améliore les produits',extra:'La recherche apporte de nouveaux résultats'},
 {title:'الاقتصاد والتمويل',description:'الاقتصاد والتمويل والتجارة الدولية',first:'نمو الاقتصاد يعزز الصادرات',second:'تمويل المشروعات يدعم الشركات',extra:'التجارة الدولية تتوسع'},
 {title:'العلوم والتكنولوجيا',description:'العلوم والتكنولوجيا والبحوث',first:'العلوم تكشف مادة جديدة',second:'تكنولوجيا جديدة تحسن المنتجات',extra:'البحوث تقدم نتائج جديدة'},
 {title:'العلوم والتقنية',description:'العلوم والتقنية والبحوث',first:'تقدم العلوم يتيح اكتشافات جديدة',second:'التقنية تحسن المنتجات',extra:'البحوث تقدم نتائج جديدة'}
];
it.each(categories)('sends individual interests in $title to the model without an exact-title prefilter',async topic=>{
 for(const headline of [topic.first,topic.second,topic.extra]){
  const modelCalls:Record<string,unknown>[]=[];
  const feed='https://techcrunch.com/feed/';
  const fetcher=vi.fn<typeof fetch>(async(input,init)=>{
   if(String(input)==='https://openrouter.ai/api/v1/chat/completions'){
    const request=JSON.parse(init!.body as string),data=JSON.parse(request.messages[1].content);
    modelCalls.push(data);
    expect(data.feed).toEqual({title:topic.title,description:topic.description});
    expect(data.query).toBe('TechCrunch');
    expect(data.results.map((item:{title:string})=>item.title)).toEqual([headline,'A football match opens a stadium']);
    expect(request.messages[0].content).toContain('alternative interests');
    return Response.json({choices:[{message:{content:JSON.stringify({results:[{id:0,alignment:'YES'},{id:1,alignment:'NO'}]})}}]});
   }
   if(String(input)===feed)return new Response(`<rss><channel><item><guid>yes</guid><title>${headline}</title><description>${headline}</description><link>https://techcrunch.com/yes</link></item><item><guid>no</guid><title>A football match opens a stadium</title><link>https://techcrunch.com/no</link></item></channel></rss>`);
   return new Response('',{status:403});
  });
  const found=await searchSourceCandidates({SOURCE_RECOMMENDATIONS_WEB_SEARCH:'true',OPENROUTER_API_KEY:'test'} as Env,'TechCrunch',fetcher,undefined,{owner:'owner',origin:'https://app.example'},topic);
  expect(found.results.map(row=>row.title)).toEqual([headline]);
  expect(found.unavailable).toBe(false);
  expect(modelCalls).toHaveLength(1);
 }
});
it('keeps full context in cache identities',()=>{
 const topic={title:'Economy and Finance',description:'Economy, finance and international trade'};
 expect(sourceSearchCacheQuery('markets',topic)).not.toBe(sourceSearchCacheQuery('markets',{...topic,description:'Only public finance'}));
});
it.each([
 {title:'Ministry of Finance',description:'Decisions by the Ministry of Finance',matching:'The Ministry of Finance announces a decision',unrelated:'Finance markets rise'},
 {title:'Sciences Po',description:'Actualités et recherches de Sciences Po',matching:'Sciences Po publie une étude',unrelated:'Les sciences progressent'},
 {title:'وزارة العلوم والتكنولوجيا',description:'أخبار وزارة العلوم والتكنولوجيا',matching:'وزارة العلوم والتكنولوجيا تعلن قراراً',unrelated:'تقدم العلوم يتيح اكتشافات جديدة'}
])('retains only model-supported named subjects for $title',async topic=>{
 let calls=0;
 const fetcher:typeof fetch=async(input,init)=>{
  if(String(input)==='https://openrouter.ai/api/v1/chat/completions'){
   calls++;
   const request=JSON.parse(init!.body as string),data=JSON.parse(request.messages[1].content);
   expect(data.feed).toEqual({title:topic.title,description:topic.description});
   expect(data.results.map((row:{title:string})=>row.title)).toEqual([topic.matching,topic.unrelated]);
   expect(request.messages[0].content).toContain('person, institution or required geography');
   return Response.json({choices:[{message:{content:JSON.stringify({results:[{id:0,alignment:'YES'},{id:1,alignment:'NO'}]})}}]});
  }
  if(String(input).startsWith('https://news.google.com/'))return new Response('<rss><channel>'+[topic.matching,topic.unrelated].map((title,id)=>`<item><guid>${id}</guid><title>${title}</title><link>https://news.google.com/rss/articles/${id}</link><source url="https://publisher.example">Publisher</source></item>`).join('')+'</channel></rss>');
  return new Response('Public reporting. '.repeat(20));
 };
 const found=await searchSourceCandidates({SOURCE_RECOMMENDATIONS_WEB_SEARCH:'true',OPENROUTER_API_KEY:'test'} as Env,topic.title,fetcher,undefined,{owner:'owner',origin:'https://app.example'},topic);
 expect(found.results.map(row=>row.title)).toEqual([topic.matching]);
 expect(calls).toBe(1);
});
