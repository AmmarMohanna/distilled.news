import {beforeEach,expect,it,vi} from 'vitest';
import {createApp} from './app';
import {InMemoryRepository} from './repository';
import {createSession} from './auth';
import type {Env} from './types';
import type {BriefingConfig,BriefingEdition} from '@distilled/core';
import {generateUnreadSummary} from './unread-summary';
vi.mock('./unread-summary',async original=>({...await original<typeof import('./unread-summary')>(),generateUnreadSummary:vi.fn(async()=>({status:'ready',summary:'A short summary.'}))}));
let repo:InMemoryRepository,app:ReturnType<typeof createApp>,config:Env,cookie:string,feed:BriefingConfig;
beforeEach(async()=>{vi.mocked(generateUnreadSummary).mockClear();repo=new InMemoryRepository();const owner=await repo.createAccount({email:'owner@example.invalid',username:'owner',role:'user',passwordHash:'test',emailVerifiedAt:new Date().toISOString()});feed={...await repo.ensureDefaultBriefing(owner),publicFeedEnabled:true};await repo.upsertBriefing(feed);cookie='dn_session='+await createSession('test-secret',owner);app=createApp({repository:repo});config={ADMIN_SESSION_SECRET:'test-secret',BRIEFING_ENGINE:'v3',UNREAD_SUMMARY_ENABLED:'true',OPENROUTER_API_KEY:'test',DB:{}} as Env;});
const post=(data:unknown={readIds:[]},headers:Record<string,string>={cookie})=>app.request('/api/feed/owner/personal/unread-summary',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(data)},config);
it('requires a signed-in verified reader',async()=>{expect((await post({readIds:[]},{})).status).toBe(401);expect(generateUnreadSummary).not.toHaveBeenCalled();});
it('keeps private feeds owner-only',async()=>{await repo.upsertBriefing({...feed,publicFeedEnabled:false});expect((await post({readIds:[]},{})).status).toBe(404);expect(generateUnreadSummary).not.toHaveBeenCalled();});
it('rejects cross-origin and client-provided source prose',async()=>{expect((await post({readIds:[]},{cookie,origin:'https://other.example'})).status).toBe(403);expect((await post({readIds:[],text:'invented news'})).status).toBe(400);expect(generateUnreadSummary).not.toHaveBeenCalled();});
it('derives evidence from published server editions, excludes already-read and non-published text',async()=>{
 const base={briefingId:feed.id,cadence:'daily',windowStart:new Date(Date.now()-3600000).toISOString(),windowEnd:new Date().toISOString(),publishedAt:new Date().toISOString(),title:'News',summary:'Published news',sections:[{id:'s',title:'A proposal',summary:'Officials proposed a change, not yet approved.',evidence:[]}]} as unknown as BriefingEdition;
 await repo.saveBriefingEdition({...base,id:'one',status:'published'});
 await repo.saveBriefingEdition({...base,id:'empty',status:'empty',windowStart:'2026-10-20T00:00:00Z',windowEnd:'2026-10-20T01:00:00Z'});await post();
 expect(vi.mocked(generateUnreadSummary).mock.calls[0][0].input.briefings.map(item=>item.id)).toEqual(['one']);expect(vi.mocked(generateUnreadSummary).mock.calls[0][0].input.briefings[0].text).toContain('not yet approved');
 vi.mocked(generateUnreadSummary).mockClear();await post({readIds:['one']});expect(vi.mocked(generateUnreadSummary).mock.calls[0][0].input.briefings).toEqual([]);
});
it('leaves manual publication retired',async()=>{expect((await app.request('/api/feed/owner/personal/request-summary',{method:'POST'},config)).status).toBe(410);expect(generateUnreadSummary).not.toHaveBeenCalled();});

it('does not expose the unqualified feature unless explicitly enabled',async()=>{config.UNREAD_SUMMARY_ENABLED=undefined;expect((await post()).status).toBe(503);expect(generateUnreadSummary).not.toHaveBeenCalled();});
it('does not allow an unverified account to incur summary costs',async()=>{const reader=await repo.createAccount({email:'reader@example.invalid',username:'reader',role:'user',passwordHash:'test'});const unverified='dn_session='+await createSession('test-secret',reader);expect((await post({readIds:[]},{cookie:unverified})).status).toBe(401);expect(generateUnreadSummary).not.toHaveBeenCalled();});

it('returns a retryable pending response for pre-inference provider capacity waits',async()=>{
 vi.mocked(generateUnreadSummary).mockResolvedValueOnce({status:'pending'});const response=await post();expect(response.status).toBe(202);expect(await response.json()).toEqual({status:'pending'});
});
