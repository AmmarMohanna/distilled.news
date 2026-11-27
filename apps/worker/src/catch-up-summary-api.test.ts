import {beforeEach,expect,it,vi} from 'vitest';
import {createApp} from './app';
import {InMemoryRepository} from './repository';
import {createSession} from './auth';
import type {Env} from './types';
import type {BriefingConfig,BriefingEdition} from '@distilled/core';
import {generateCatchUpSummary,CatchUpSummaryQuotaError,CatchUpSummaryError} from './catch-up-summary';
vi.mock('./catch-up-summary',async original=>({...await original<typeof import('./catch-up-summary')>(),generateCatchUpSummary:vi.fn(async()=>({status:'ready',summary:'A short summary.'}))}));
let repo:InMemoryRepository,app:ReturnType<typeof createApp>,config:Env,cookie:string,feed:BriefingConfig;
beforeEach(async()=>{vi.mocked(generateCatchUpSummary).mockClear();repo=new InMemoryRepository();const owner=await repo.createAccount({email:'owner@example.invalid',username:'owner',role:'user',passwordHash:'test',emailVerifiedAt:new Date().toISOString()});feed={...await repo.ensureDefaultBriefing(owner),publicFeedEnabled:true,updateIntervalMinutes:1440};await repo.upsertBriefing(feed);cookie='dn_session='+await createSession('test-secret',owner);app=createApp({repository:repo});config={ADMIN_SESSION_SECRET:'test-secret',BRIEFING_ENGINE:'v3',CATCH_UP_ENABLED:'true',OPENROUTER_API_KEY:'test',DB:{}} as Env;});
const post=(data:unknown={},headers:Record<string,string>={cookie})=>app.request('/api/feed/owner/personal/catch-up',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(data)},config);
it('requires a signed-in verified reader',async()=>{expect((await post({},{})).status).toBe(401);expect(generateCatchUpSummary).not.toHaveBeenCalled();});
it('keeps private feeds owner-only',async()=>{await repo.upsertBriefing({...feed,publicFeedEnabled:false});expect((await post({},{})).status).toBe(404);expect(generateCatchUpSummary).not.toHaveBeenCalled();expect((await post()).status).toBe(200);});
it('rejects cross-origin requests and client-provided evidence',async()=>{expect((await post({},{cookie,origin:'https://other.example'})).status).toBe(403);expect((await post({text:'invented news'})).status).toBe(400);expect((await post({readIds:['one']})).status).toBe(400);expect(generateCatchUpSummary).not.toHaveBeenCalled();});
it('selects sparse daily history from published server editions alone',async()=>{
 const at=new Date(Date.now()-46*3600000).toISOString();
 const base={briefingId:feed.id,cadence:'daily',windowStart:new Date(Date.now()-70*3600000).toISOString(),windowEnd:at,publishedAt:at,title:'News',summary:'Published news',sections:[{id:'s',title:'A proposal',summary:'Officials proposed a change, not yet approved.',evidence:[]}]} as unknown as BriefingEdition;
 await repo.saveBriefingEdition({...base,id:'one',status:'published'});
 await repo.saveBriefingEdition({...base,id:'empty',status:'empty',windowStart:'2026-10-20T00:00:00Z',windowEnd:'2026-10-20T01:00:00Z'});await post();
 expect(vi.mocked(generateCatchUpSummary).mock.calls[0][0].input.briefings.map(item=>item.id)).toEqual(['one']);expect(vi.mocked(generateCatchUpSummary).mock.calls[0][0].input.briefings[0].stories[0].summary).toContain('not yet approved');
});
it('leaves manual publication retired',async()=>{expect((await app.request('/api/feed/owner/personal/request-summary',{method:'POST'},config)).status).toBe(410);expect(generateCatchUpSummary).not.toHaveBeenCalled();});

it('requires the new flag, even if the retired summarizer was configured',async()=>{config.CATCH_UP_ENABLED=undefined;config.UNREAD_SUMMARY_ENABLED='true';expect((await post()).status).toBe(503);expect(generateCatchUpSummary).not.toHaveBeenCalled();});
it('does not allow an unverified account to incur summary costs',async()=>{const reader=await repo.createAccount({email:'reader@example.invalid',username:'reader',role:'user',passwordHash:'test'});const unverified='dn_session='+await createSession('test-secret',reader);expect((await post({},{cookie:unverified})).status).toBe(401);expect(generateCatchUpSummary).not.toHaveBeenCalled();});

it('returns a retryable pending response for pre-inference provider capacity waits',async()=>{
 vi.mocked(generateCatchUpSummary).mockResolvedValueOnce({status:'pending'});const response=await post();expect(response.status).toBe(202);expect(await response.json()).toEqual({status:'pending'});
});

it.each([['SUMMARY_TOO_LONG',422],['SUMMARY_INVALID_OUTPUT',422],['SUMMARY_OUTCOME_UNKNOWN',503],['SUMMARY_PROVIDER_REFUSED',503]] as const)('returns a specific safe error for %s',async(code,status)=>{
 vi.mocked(generateCatchUpSummary).mockRejectedValueOnce(new CatchUpSummaryError(code));const response=await post();expect(response.status).toBe(status);const body=await response.json() as {code:string;error:string};expect(body.code).toBe(code);expect(body.error).not.toContain('Try again shortly');
});

it('returns a retryable quota response without suggesting immediate model retries',async()=>{
 vi.mocked(generateCatchUpSummary).mockRejectedValueOnce(new CatchUpSummaryQuotaError());
 const response=await post();expect(response.status).toBe(429);expect(response.headers.get('Retry-After')).toBe('3600');
 expect(await response.json()).toMatchObject({code:'SUMMARY_QUOTA_EXCEEDED'});
});

const editionPath=(id:string)=>`/api/feed/owner/personal/editions/${id}`;
const openEdition=(id:string,headers:Record<string,string>={cookie})=>app.request(editionPath(id)+'/opened',{method:'POST',headers},config);
async function publish(id:string,hoursAgo:number,sections:BriefingEdition['sections']=[{title:'Port',summary:'The port has reopened.',evidence:[]}]){
 const at=new Date(Date.now()-hoursAgo*3600000).toISOString();
 await repo.saveBriefingEdition({id,briefingId:feed.id,cadence:'daily',status:'published',title:'News',summary:'News',sections,
   windowStart:at,windowEnd:at,publishedAt:at,createdAt:at,updatedAt:at});
}
const selected=()=>vi.mocked(generateCatchUpSummary).mock.lastCall![0].input.briefings;

it('reports oversized published prose before scheduling inference',async()=>{
 await publish('too-large',2,[{title:'Briefing',summary:'Complete published evidence. '.repeat(1000),evidence:[]}]);
 const response=await post();
 expect(response.status).toBe(422);
 expect(await response.json()).toMatchObject({code:'SUMMARY_INPUT_TOO_LONG'});
 expect(generateCatchUpSummary).not.toHaveBeenCalled();
});

it('uses account-wide opened history, with no effect from a detail GET or on another reader',async()=>{
 await publish('older',20);await publish('newer',2);
 expect((await app.request(editionPath('newer'),{headers:{cookie}},config)).status).toBe(200);
 await post();expect(selected().map(e=>e.id)).toEqual(['older','newer']);
 expect((await openEdition('newer')).status).toBe(204);
 expect((await openEdition('newer')).status).toBe(204);
 const owner=(await repo.getAccountByUsername('owner'))!;
 const otherSession='dn_session='+await createSession('test-secret',owner,new Date(Date.now()-1000));
 expect(otherSession).not.toBe(cookie);
 await post({},{cookie:otherSession});expect(selected().map(e=>e.id)).toEqual(['older']);
 const other=await repo.createAccount({email:'other@example.invalid',username:'other',role:'user',passwordHash:'test',emailVerifiedAt:new Date().toISOString()});
 await post({},{cookie:'dn_session='+await createSession('test-secret',other)});
 expect(selected().map(e=>e.id)).toEqual(['older','newer']);
 await openEdition('older');await post();expect(selected()).toEqual([]);
});

it('honors an opened correction without sending it or the stale story to the model',async()=>{
 const stale={storyId:'old-story',title:'Port',summary:'The port is closed.',evidence:[]};
 await publish('older',20,[stale,{storyId:'other',title:'Airport',summary:'Airport repairs are scheduled.',evidence:[]}]);
 await publish('repeat',18,[{...stale,storyId:'repeat-story'}]);
 await publish('correction',2,[{...stale,storyId:'correction-story',relation:'correction',updatesId:'old-story',summary:'Officials corrected their report: the port remains open.'}]);
 expect((await openEdition('correction')).status).toBe(204);
 await post();
 expect(selected().map(e=>[e.id,e.stories.map(s=>s.id)])).toEqual([['older',['other']]]);
});

it('does not record opens while disabled and protects private editions and mutations',async()=>{
 await publish('one',2);
 config.CATCH_UP_ENABLED=undefined;
 expect((await openEdition('one')).status).toBe(204);
 config.CATCH_UP_ENABLED='true';
 expect((await openEdition('one',{})).status).toBe(401);
 expect((await openEdition('one',{cookie,origin:'https://other.example'})).status).toBe(403);
 expect((await openEdition('missing')).status).toBe(404);
 await repo.upsertBriefing({...feed,publicFeedEnabled:false});
 const other=await repo.createAccount({email:'other@example.invalid',username:'other',role:'user',passwordHash:'test',emailVerifiedAt:new Date().toISOString()});
 expect((await openEdition('one',{cookie:'dn_session='+await createSession('test-secret',other)})).status).toBe(404);
 await post();expect(selected().map(e=>e.id)).toEqual(['one']);
});
