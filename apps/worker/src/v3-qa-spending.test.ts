import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {createIntakeDatabase} from './v1-intake/test-utils';
import {V1FeedStore} from './v1-intelligence/store';
import {feedFixture} from './v1-intelligence/test-utils';
import {authorizeModelSpending} from './v1-intelligence/model-spending';
import {qaAccountedFetch} from './v3-qa-spending';
let account:Awaited<ReturnType<typeof createIntakeDatabase>>,data:Awaited<ReturnType<typeof createIntakeDatabase>>;
const scope='v3-overnight-unit-test',body=JSON.stringify({model:'openai/gpt-4.1',messages:[{role:'user',content:'retained source'}],max_tokens:1000});
beforeEach(async()=>{account=await createIntakeDatabase({modelSpending:false});data=await createIntakeDatabase({modelSpending:false});await new V1FeedStore(data.db).registerFeed(feedFixture);await authorizeModelSpending(account.db,{id:'qa-test-grant',accountId:'openrouter-distilled-news-staging',modelIds:['openai/gpt-4.1'],validFrom:'2000-01-01T00:00:00Z',validUntil:'2100-01-01T00:00:00Z',maxExposureUsd:20,maxConcurrentOperations:3})});
afterEach(async()=>{await account.dispose();await data.dispose()});
it('keeps provider account reservations in the account DB and responses in isolated data; replays without a second paid call',async()=>{
 const provider=vi.fn(async()=>Response.json({id:'gen-qa-test',choices:[{message:{content:'{}'}}],usage:{cost:.001,prompt_tokens:20,completion_tokens:5}}));
 const transport=qaAccountedFetch(account.db,data.db,scope,'feed-1','2026-10-20T00:00:00Z',3,'2100-01-01T00:00:00Z',provider as typeof fetch);
 const first=await transport('https://openrouter.ai/api/v1/chat/completions',{method:'POST',body});expect(await first.json()).toMatchObject({usage:{cost:.001}});
 await transport('https://openrouter.ai/api/v1/chat/completions',{method:'POST',body});expect(provider).toHaveBeenCalledTimes(1);
 expect(await account.db.prepare('SELECT COUNT(*) n FROM v1_model_spending_settlements WHERE reported=1').first()).toEqual({n:1});
 expect(await data.db.prepare("SELECT COUNT(*) n FROM v1_feed_documents WHERE kind='v3_qa_provider_responses'").first()).toEqual({n:1});
 expect(await account.db.prepare("SELECT COUNT(*) n FROM v1_feed_documents WHERE kind='v3_qa_provider_responses'").first()).toEqual({n:0});
},30000);
it('refuses worst-case exposure above the task phase cap before contacting the provider',async()=>{
 const provider=vi.fn(),transport=qaAccountedFetch(account.db,data.db,scope,'feed-1','2026-10-20T00:00:00Z',.005,'2100-01-01T00:00:00Z',provider);
 await expect(transport('https://openrouter.ai/api/v1/chat/completions',{method:'POST',body})).rejects.toThrow();expect(provider).not.toHaveBeenCalled();expect(await account.db.prepare('SELECT COUNT(*) n FROM v1_model_spending_reservations').first()).toEqual({n:0});
},30000);
it('does not resend an uncertain operation and retains its reservation',async()=>{
 const provider=vi.fn(async()=>{throw Error('network lost')}),transport=qaAccountedFetch(account.db,data.db,scope,'feed-1','2026-10-20T00:00:00Z',3,'2100-01-01T00:00:00Z',provider as typeof fetch);
 await expect(transport('https://openrouter.ai/api/v1/chat/completions',{method:'POST',body})).rejects.toThrow();await expect(transport('https://openrouter.ai/api/v1/chat/completions',{method:'POST',body})).rejects.toThrow('QA_UNSETTLED_OR_UNRECOVERED_OPERATION');expect(provider).toHaveBeenCalledTimes(1);
 expect(await account.db.prepare('SELECT COUNT(*) n FROM v1_model_spending_reservations').first()).toEqual({n:1});expect(await account.db.prepare('SELECT COUNT(*) n FROM v1_model_spending_settlements').first()).toEqual({n:0});
},30000);
