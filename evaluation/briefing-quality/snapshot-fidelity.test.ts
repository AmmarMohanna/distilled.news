import {expect,it} from 'vitest';
import {snapshot,type Published} from './worker/src/source';
import {presentProductEditions,type PublishedProductEditionRecord} from '../../apps/worker/src/product-feeds';

// V3 persists headline + newline + body in a claim. Use the real product
// presenter as the reader-side comparator, including multi-claim stories.
it.each(['en','ar','fr'] as const)('preserves full reader prose and citation sets for %s',async language=>{
 const headlines={en:'France proposes training bases and teams',ar:'\u0641\u0631\u0646\u0633\u0627 \u062a\u0642\u062a\u0631\u062d \u0642\u0648\u0627\u0639\u062f \u0648\u0641\u0631\u0642 \u062a\u062f\u0631\u064a\u0628',fr:'La France propose des bases et des \u00e9quipes de formation'};
 const bodies={en:'The proposal remains outside a UN mandate; no deployment commitment is confirmed.',ar:'\u0644\u0645 \u064a\u062a\u0623\u0643\u062f \u0623\u064a \u0627\u0644\u062a\u0632\u0627\u0645 \u0628\u0627\u0644\u0646\u0634\u0631.',fr:'La proposition reste hors mandat de l\u2019ONU ; aucun engagement de d\u00e9ploiement n\u2019est confirm\u00e9.'};
 if(language==='ar')expect(headlines[language]).toMatch(/[\u0600-\u06ff]/u);
 const row:Published={id:'edition',feed_id:'feed',language,published_at:'2026-11-17T14:30:00Z',window_end:'2026-11-17T14:25:00Z'};
 const articles=[{id:'A',source:'first',text:headlines[language]+' '+bodies[language]},{id:'B',source:'second',text:'The ministry revised 25 road contracts, saving over $6.4 million.'}];
 const edition={id:row.id,feedId:row.feed_id,engine:'v3',language,windowStart:'2026-11-17T13:55:00Z',windowEnd:row.window_end,createdAt:row.published_at,stories:[{candidateId:'training',claims:[{id:'training:text',text:headlines[language]+'\n'+bodies[language],support:[{evidenceRevisionId:'A',quote:articles[0].text}]}]},{candidateId:'roads',claims:[{id:'roads:headline',text:'Road contracts revised',support:[{evidenceRevisionId:'B',quote:articles[1].text}]},{id:'roads:body',text:articles[1].text,support:[{evidenceRevisionId:'B',quote:articles[1].text}]}]}]};
 const frozen={id:row.id,feedId:row.feed_id,input:{feed:{interest:'Public affairs',language},articles,prior:[],windowStart:edition.windowStart,windowEnd:edition.windowEnd}};
 const docs=[['editions',edition],['v3_window_inputs',frozen],['publication_status',{status:'PUBLISHED',publishedAt:row.published_at}]].map(([kind,value])=>({id:row.id,feed_id:row.feed_id,kind,json:JSON.stringify(value)}));
 const prepare=(sql:string)=>({bind:()=>({all:async()=>({results:sql.includes('v1_revisions')?articles.map(a=>({json:JSON.stringify({...a,feedId:row.feed_id,body:a.text,contentCompleteness:'COMPLETE'})})):docs}),first:async()=>({json:JSON.stringify({status:'PUBLISHED'})})})});
 const c=await snapshot({prepare} as unknown as D1Database,row,'test','2026-11-17T14:40:00Z');
 const citations=articles.map(a=>({evidenceRevisionId:a.id,publisherId:a.source,title:undefined,url:'https://example.com/'+a.id,publishedAt:undefined}));
 const published={...edition,title:'Public affairs',publishedAt:row.published_at,citations} satisfies PublishedProductEditionRecord;
 const feed={id:row.feed_id,briefingCadence:'30M'} as Parameters<typeof presentProductEditions>[0];
 const reader=presentProductEditions(feed,[published])[0];
 const normalize=(text:string)=>text.replace(/\s+/gu,' ').trim();
 expect(c.items).toHaveLength(reader.sections.length);
 for(const [index,item]of c.items.entries()){
  const section=reader.sections[index];
  expect(normalize(item.headline+' '+item.body)).toBe(normalize(section.title+' '+section.summary));
  expect(new Set(item.sourceIds)).toEqual(new Set(section.evidence.map(e=>e.messageId)));
 }
 expect(c.items[0].body).toContain(headlines[language]);expect(c.items[0].body).toContain(bodies[language]);
 expect(c.items[1].body).toContain('25 road contracts');expect(c.items[1].sourceIds).toEqual(['B']);
});
