import {HandoffError,type ConnectorHandoffResponse} from '@distilled/contracts';
import {D1ProviderSourceRepository,sourceSqlFromD1,type SourceFetchRequest} from '@distilled/connectors';
import {authorizeConnectorSource} from './connector-runtime';
import {acceptV1Handoff} from './v1-downstream-runtime';
import {canonicalJson} from './v1-intake/canonical';
import type {Env} from './types';

/** Authenticated QA repair only: revalidate a saved snapshot against current
 * approval and intake policy. Never execute a provider or advance its cursor. */
export async function recoverQaProviderBatch(env:Env,current:SourceFetchRequest,providerId:string,batchKey:string):Promise<ConnectorHandoffResponse> {
 const repository=new D1ProviderSourceRepository(sourceSqlFromD1(env.DB));
 const batch=await repository.loadProviderBatch(current.scope,batchKey);
 if(!batch||batch.providerId!==providerId||canonicalJson(batch.originalRequest.scope)!==canonicalJson(current.scope)||
   canonicalJson(batch.originalRequest.source)!==canonicalJson(current.source)||
   canonicalJson(batch.originalRequest.requestedBounds)!==canonicalJson(current.requestedBounds)||
   batch.originalRequest.limit!==current.limit||!await authorizeConnectorSource(env,current))throw new HandoffError('SCOPE_DENIED');
 // Original observation/handoff identities stay immutable. Current restrictions
 // and current revision fences still apply when intake re-evaluates the data.
 const response=await acceptV1Handoff(env,batch.request,current.configurationRevision);
 await repository.saveProviderReceipts(batch,response);
 return response;
}
