import {expect,it,vi} from 'vitest';
import {nationalLiveblog} from './national-liveblog';
const url='https://www.thenationalnews.com/news/mena/2026/10/28/live-report/',slug='oZjg32g';
const page=(canonical='/news/mena/2026/10/28/live-report/',id=slug)=>`<script>Fusion.globalContent=${JSON.stringify({canonical_url:canonical,content_elements:[{type:'custom_embed',subtype:'arena-api-inline',embed:{config:{embedId:id}}}]})};Fusion.globalContentConfig={};</script>`;
const post=(date='2026-10-28T14:00:00Z',body='Officials described the proposal and warned that approval remains conditional. '.repeat(4))=>({'@type':'BlogPosting',url:`https://www.thenationalnews.com/${slug}/?arena_mid=post-1`,publisher:{'@id':'https://www.thenationalnews.com/#organization'},datePublished:date,headline:'Latest reported development',articleBody:body});
const seo=(posts:unknown[],overrides={})=>`<script type="application/ld+json">${JSON.stringify({'@type':'LiveBlogPosting','@id':`https://www.thenationalnews.com/${slug}/#liveblog`,isAccessibleForFree:true,liveBlogUpdate:posts,...overrides})}</script>`;
it('reads only publisher-bound same-day liveblog updates, retaining timestamps and partial completeness',async()=>{
 const fetcher=vi.fn(async()=>new Response(seo([post(),post('2026-10-27T23:59:59Z','Old reporting must not be included')])));
 const result=await nationalLiveblog(page(),url,fetcher);
 expect(result).toMatchObject({contentCompleteness:'PARTIAL'});expect(result?.body).toContain('2026-10-28T14:00:00.000Z');expect(result?.body).not.toContain('Old reporting');
 expect(fetcher.mock.calls).toHaveLength(1);
});
it('never fetches an unbound embed, another host, or a hostile embed ID',async()=>{
 const fetcher=vi.fn();
 for(const [html,target] of [[page(),url.replace('thenationalnews.com','other.example')],[page('/different/'),url],[page(undefined,'../../private'),url]])expect(await nationalLiveblog(html,target,fetcher)).toBeUndefined();
 expect(fetcher).not.toHaveBeenCalled();
});
it('rejects restricted or foreign SEO identities and posts belonging to another publisher',async()=>{
 for(const payload of [seo([post()],{isAccessibleForFree:false}),seo([post()],{'@id':'https://other.example/#liveblog'}),seo([{...post(),publisher:{'@id':'https://other.example/'}}]),seo([{...post(),url:'https://other.example/post'}])])expect(await nationalLiveblog(page(),url,async()=>new Response(payload))).toBeUndefined();
});
it('fails rather than truncating evidence beyond the article body budget',async()=>{
 await expect(nationalLiveblog(page(),url,async()=>new Response(seo([post(undefined,'x'.repeat(500001))])))).rejects.toMatchObject({code:'BODY_BUDGET_EXCEEDED'});
});
