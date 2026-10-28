import {it,expect} from 'vitest';
import {createIntakeDatabase} from '../v1-intake/test-utils';
import {V1FeedStore} from './store';
it('joins publication status without returning withdrawn or unowned editions',async()=>{
 const ctx=await createIntakeDatabase();try{
 for(const id of ['feed','other'])await ctx.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind(id,JSON.stringify({revision:1})).run();
 const rows=[{id:'a',status:'PUBLISHED'},{id:'b',status:'WITHDRAWN'},{id:'c',status:undefined},{id:'d',status:'PUBLISHED',statusFeed:'other'}];
 for(const r of rows){await ctx.db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind('editions',r.id,'feed',JSON.stringify({id:r.id,windowEnd:'2026-01-01',stories:[],evidenceRevisionIds:[],padding:'x'.repeat(10000)})).run();if(r.status)await ctx.db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind('publication_status',r.id,r.statusFeed??'feed',JSON.stringify({id:r.id,status:r.status})).run();}
 const store=new V1FeedStore(ctx.db);const statuses=new Map((await store.list<{id:string;status:string}>('feed','publication_status')).map(s=>[s.id,s.status]));
 const all=await store.list<{id:string}>('feed','editions');const baseline=all.filter(e=>statuses.get(e.id)==='PUBLISHED');
 const selected=await store.publishedEditionHistory('feed');expect(selected).toEqual(baseline);expect(Buffer.byteLength(JSON.stringify(selected))).toBeLessThan(Buffer.byteLength(JSON.stringify(all))/3);expect(await store.publishedEditionHistory('other')).toEqual([]);
 }finally{await ctx.dispose()}
});

it('keeps old evidence identities but loads prose only within reader memory',async()=>{
 const ctx=await createIntakeDatabase();try{
 await ctx.db.prepare('INSERT INTO v1_feeds(id,json) VALUES(?,?)').bind('feed',JSON.stringify({revision:1})).run();
 const cutoff=Date.parse('2026-10-01T00:00:00Z');
 const dates=['2026-09-30T23:59:59.999Z','2026-10-01T00:00:00Z','invalid'];
 for(let i=0;i<dates.length;i++){const id=String(i),row={id,createdAt:dates[i],windowEnd:'2026-09-01',evidenceRevisionIds:['e'+i],stories:[{candidateId:id,claims:[{text:'Grounded published text '+i}]}]};await ctx.db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind('editions',id,'feed',JSON.stringify(row)).run();await ctx.db.prepare('INSERT INTO v1_feed_documents VALUES(?,?,?,?)').bind('publication_status',id,'feed',JSON.stringify({status:'PUBLISHED'})).run();}
 const rows=await new V1FeedStore(ctx.db).publicationPreparationHistory('feed',cutoff);
 expect(rows.map(r=>r.evidenceRevisionIds)).toEqual([['e0'],['e1'],['e2']]);expect(rows[0].stories).toEqual([]);expect(rows[1].stories[0].claims[0].text).toContain('1');expect(rows[2].stories[0].claims[0].text).toContain('2');
 }finally{await ctx.dispose()}
});
