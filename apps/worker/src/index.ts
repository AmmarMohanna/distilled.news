import { createApp } from "./app";
import {runConnectorMaintenance} from './connector-runtime';
import { dispatchV1Acquisitions, processV1Acquisition } from './v1-downstream-runtime';
import {dispatchV1Intelligence,processV1Briefing,processV1Reassessment,processV1Rematch} from './v1-intelligence/runtime';
import {HandoffError} from '@distilled/contracts';
import {drainNextProcessingJob} from "./processing-drain";
import { createEventReviewAdapterFromEnv, createSummaryAdapterFromEnv } from "./ai";
import { publishDueBriefingEditions } from "./editions";
import { processQueueMessage,ProcessingLeaseBusy } from "./processor";
import { D1Repository } from "./repository";
import { runRetentionCleanup } from "./retention";
import { enqueueDueSourceRefreshJobs, pollApifySourceRuns, refreshSourceById } from "./sources";
import type { AuthenticatedProfileBootstrapMessage,AuthenticatedSurfaceDiagnosticMessage,AuthenticatedXAcquisitionRequestMessage,DistilledQueueMessage, Env, OpenRouterModelDiagnosticMessage, ProcessingJobMessage, PublicAcquisitionRequestMessage, Repository, SourceRefreshJobMessage, WebOperatorLiveSmokeMessage, WebOperatorRunMessage } from "./types";
import { relayPendingWebOperatorOutbox } from "./web-operator-admission";
import { D1AgentRuntimeStore } from "./agent-runtime-store";
import { processLivePublicAcquisitionSmoke } from "./live-public-acquisition-smoke";
import { dispatchPendingPublicAcquisitionRequests, processPublicAcquisitionRequest } from "./public-acquisition-request";
import { dispatchPendingAuthenticatedXAcquisitionRequests,processAuthenticatedXAcquisitionRequest } from "./authenticated-x-acquisition-request";
import { expireAcquisitionDiagnostics } from "./acquisition-diagnostic-retention";
import {enqueueScheduledSourceAcquisitions} from "./scheduled-source-acquisition";
import { createWorkerWebOperatorRuntimeHandler } from "./web-operator-runtime";
import { dispatchPendingOpenRouterModelDiagnostics,processOpenRouterModelDiagnostic } from "./openrouter-model-diagnostic";
import { dispatchPendingAuthenticatedProfileBootstraps,processAuthenticatedProfileBootstrap } from "./authenticated-profile-bootstrap-trigger";
import { dispatchPendingAuthenticatedSurfaceDiagnostics,processAuthenticatedSurfaceDiagnostic } from "./authenticated-surface-diagnostic-trigger";

export {AuthenticatedBrowserContainer} from "./cloudflare-container-browser";

const app = createApp();
const MAX_QUEUE_ATTEMPTS = 5;
const STALE_PROCESSING_JOB_REQUEUE_AGE_MS = 10 * 60 * 1000;
const STALE_PROCESSING_JOB_REQUEUE_LIMIT = 25;
const SLOW_QUEUE_JOB_MS = 10_000;

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduledMaintenance(env));
  },
  async queue(batch: MessageBatch<DistilledQueueMessage | WebOperatorRunMessage>, env: Env): Promise<void> {
    const repo = new D1Repository(env.DB);
    const agentStore = new D1AgentRuntimeStore(env.DB);
    const summaryAdapter = createSummaryAdapterFromEnv(env, repo);
    const reviewAdapter = createEventReviewAdapterFromEnv(env, repo);
    for (const message of batch.messages) {
      const startedAt = Date.now();
      const bodyType = queueBodyType(message.body);
      const bodyId = queueBodyId(message.body);
      let completedProcessing=false;
      try {
        if (isRecord(message.body) && message.body.type==='v1_acquisition' && typeof message.body.jobId==='string') await processV1Acquisition(env,message.body.jobId);
        else if(isRecord(message.body) && message.body.type==='v1_rematch' && typeof message.body.feedId==='string' && typeof message.body.requestId==='string') await processV1Rematch(env,message.body.feedId,message.body.requestId);
        else if(isRecord(message.body) && message.body.type==='v1_reassess' && typeof message.body.jobId==='string') await processV1Reassessment(env,message.body.jobId);
        else if(isRecord(message.body) && message.body.type==='v1_briefing') await processV1Briefing(env,message.body as import('./v1-intelligence/runtime').V1BriefingMessage);
        else if (isWebOperatorRunMessage(message.body)) await processWebOperatorRunMessage(env,message.body);
        else if (isWebOperatorLiveSmokeMessage(message.body)) {
          await processLivePublicAcquisitionSmoke(env, message.body, async (request) => app.fetch(request, env));
        }
        else if (isPublicAcquisitionRequestMessage(message.body)) await processPublicAcquisitionRequest(env,message.body,async request=>app.fetch(request,env));
        else if (isAuthenticatedXAcquisitionRequestMessage(message.body)) await processAuthenticatedXAcquisitionRequest(env,message.body,async request=>app.fetch(request,env));
        else if (isOpenRouterModelDiagnosticMessage(message.body)) await processOpenRouterModelDiagnostic(env,message.body);
        else if(isAuthenticatedProfileBootstrapMessage(message.body))await processAuthenticatedProfileBootstrap(env,message.body);
        else if(isAuthenticatedSurfaceDiagnosticMessage(message.body))await processAuthenticatedSurfaceDiagnostic(env,message.body);
        else completedProcessing=await processDistilledQueueMessage(repo, env, message.body, summaryAdapter, reviewAdapter);
        if(completedProcessing&&isProcessingJobMessage(message.body)){
          await drainNextProcessingJob(repo,env.PROCESSING_QUEUE,message.body.briefingId,completedProcessing);
        }
        const durationMs = Date.now() - startedAt;
        if (durationMs >= SLOW_QUEUE_JOB_MS) {
          console.warn("Slow queue job completed", {
            messageId: message.id,
            attempts: message.attempts,
            bodyType,
            bodyId,
            durationMs
          });
        }
        message.ack();
      } catch (error) {
        if(isRecord(message.body) && typeof message.body.type==='string' && message.body.type.startsWith('v1_')) {
          if(error instanceof HandoffError && error.code!=='TEMPORARY_UNAVAILABLE') message.ack();
          else if(message.attempts<MAX_QUEUE_ATTEMPTS) message.retry({delaySeconds:retryDelaySeconds(message.attempts)});
          else message.ack();
          console.warn('V1 queue work deferred or terminal',{bodyType,code:error instanceof HandoffError?error.code:'TEMPORARY_UNAVAILABLE'});continue;
        }
        // Contention is not a failed attempt. The completed job drains the next
        // durable job; the existing stale-job relay recovers a crashed leader.
        if(error instanceof ProcessingLeaseBusy){message.ack();continue}
        const errorMessage = error instanceof Error ? error.message : String(error);
        const shouldQuarantine = shouldQuarantineQueueFailure(error, message.attempts);
        await recordQueueFailure(repo,agentStore,message.body,errorMessage,shouldQuarantine);
        console.error(shouldQuarantine ? "Quarantined queue job" : "Retrying queue job", {
          messageId: message.id,
          attempts: message.attempts,
          bodyType,
          bodyId,
          durationMs: Date.now() - startedAt,
          permanent: isPermanentQueueError(error),
          quarantined: shouldQuarantine,
          error: errorMessage
        });
        if (shouldQuarantine) {
          message.ack();
        } else {
          message.retry({ delaySeconds: retryDelaySeconds(message.attempts) });
        }
      }
    }
  }
};

async function processDistilledQueueMessage(
  repo: Repository,
  env: Env,
  body: unknown,
  summaryAdapter: ReturnType<typeof createSummaryAdapterFromEnv>,
  reviewAdapter: ReturnType<typeof createEventReviewAdapterFromEnv>
): Promise<boolean> {
  if (isSourceRefreshJobMessage(body)) {
    const briefing = await repo.getBriefingById(body.briefingId);
    if (!briefing) throw new PermanentQueueError("Briefing not found.");
    await refreshSourceById({
      briefing,
      sourceId: body.sourceId,
      repo,
      bucket: env.RAW_ARCHIVE,
      queue: env.PROCESSING_QUEUE,
      env,
      now: new Date(),
      force: body.force
    });
    return false;
  }

  if (isProcessingJobMessage(body)) {
    return Boolean(await processQueueMessage(repo, body, new Date(), summaryAdapter, reviewAdapter));
  }

  throw new PermanentQueueError("Invalid queue message.");
}

async function recordQueueFailure(
  repo: Repository,
  agentStore:D1AgentRuntimeStore,
  body: unknown,
  error: string,
  quarantined: boolean
): Promise<void> {
  const message = quarantined ? `Quarantined after repeated queue failures: ${error}` : error;
  if (isProcessingJobMessage(body)) {
    await repo.failProcessingJob(body.jobId, message);
    return;
  }
  if (isSourceRefreshJobMessage(body)) {
    await repo.updateSourceState({ sourceId: body.sourceId, lastError: sourceFailureMessage(error, quarantined) });
    if (quarantined) await repo.setSourceEnabled(body.sourceId, false);
    return;
  }
  if (quarantined && isWebOperatorRunMessage(body)) {
    await agentStore.failRunDelivery(body.runId,message);
  }
}

function sourceFailureMessage(error: string, quarantined: boolean): string {
  return quarantined ? `Paused after repeated source failures: ${error}` : error;
}

function isProcessingJobMessage(body: unknown): body is ProcessingJobMessage {
  if (!isRecord(body)) return false;
  return (!("type" in body) || body.type === undefined || body.type === "process_raw_message") &&
    typeof body.jobId === "string" &&
    typeof body.briefingId === "string" &&
    typeof body.rawMessageId === "string";
}

function isSourceRefreshJobMessage(body: unknown): body is SourceRefreshJobMessage {
  if (!isRecord(body)) return false;
  return body.type === "refresh_source" &&
    typeof body.briefingId === "string" &&
    typeof body.sourceId === "string";
}

function isWebOperatorRunMessage(body:unknown):body is WebOperatorRunMessage {
  return isRecord(body) && body.type==="web_operator_run" && typeof body.runId==="string";
}

function isWebOperatorLiveSmokeMessage(body: unknown): body is WebOperatorLiveSmokeMessage {
  return isRecord(body) && body.type === "live_public_acquisition_smoke" && typeof body.requestId === "string";
}
function isPublicAcquisitionRequestMessage(body:unknown):body is PublicAcquisitionRequestMessage{return isRecord(body)&&body.type==="public_acquisition_request"&&typeof body.requestId==="string"}
function isAuthenticatedXAcquisitionRequestMessage(body:unknown):body is AuthenticatedXAcquisitionRequestMessage{return isRecord(body)&&body.type==="authenticated_x_acquisition_request"&&typeof body.requestId==="string"}

function isOpenRouterModelDiagnosticMessage(body:unknown):body is OpenRouterModelDiagnosticMessage {
  return isRecord(body)&&body.type==="openrouter_model_diagnostic"&&typeof body.requestId==="string";
}
function isAuthenticatedProfileBootstrapMessage(body:unknown):body is AuthenticatedProfileBootstrapMessage{return isRecord(body)&&body.type==="authenticated_profile_bootstrap"&&typeof body.requestId==="string"}
function isAuthenticatedSurfaceDiagnosticMessage(body:unknown):body is AuthenticatedSurfaceDiagnosticMessage{return isRecord(body)&&body.type==="authenticated_surface_diagnostic"&&typeof body.requestId==="string"}

export async function processWebOperatorRunMessage(
  env: Env,
  message: WebOperatorRunMessage,
  runtimeHandler: (request: Request) => Promise<Response> = createWorkerWebOperatorRuntimeHandler(env)
) {
  if (!env.WEB_OPERATOR_RUNTIME_URL) throw new Error("WEB_OPERATOR_RUNTIME_URL is not configured");
  const headers=new Headers({"content-type":"application/json"});
  if (env.WEB_OPERATOR_RUNTIME_TOKEN) headers.set("authorization",`Bearer ${env.WEB_OPERATOR_RUNTIME_TOKEN}`);
  const response=await runtimeHandler(new Request(new URL("/v1/agent-runs/process",env.WEB_OPERATOR_RUNTIME_URL),{
    method:"POST",headers,body:JSON.stringify(message)
  }));
  if (!response.ok) throw new Error(`Web Operator runtime failed: ${response.status}`);
}

class PermanentQueueError extends Error {}

function isPermanentQueueError(error: unknown): boolean {
  if (error instanceof PermanentQueueError) return true;
  const message = error instanceof Error ? error.message : String(error);
  if (/(not found|missing|not configured|unsupported source provider|invalid queue message)/i.test(message)) return true;
  const status = message.match(/:\s*(\d{3})\b/)?.[1];
  if (!status) return false;
  const code = Number(status);
  return code >= 400 && code < 500 && ![408, 409, 425, 429].includes(code);
}

export function shouldQuarantineQueueFailure(error: unknown, attempts: number): boolean {
  return isPermanentQueueError(error) || attempts >= MAX_QUEUE_ATTEMPTS;
}

function retryDelaySeconds(attempts: number): number {
  return Math.min(300, Math.max(30, attempts * 60));
}

function queueBodyType(body: unknown): string {
  if (isRecord(body) && typeof body.type === "string") return body.type;
  return "process_raw_message";
}

function queueBodyId(body: unknown): string | undefined {
  if (isProcessingJobMessage(body)) return body.jobId;
  if (isSourceRefreshJobMessage(body)) return body.sourceId;
  if (isWebOperatorRunMessage(body)) return body.runId;
  if (isWebOperatorLiveSmokeMessage(body)) return body.requestId;
  if (isPublicAcquisitionRequestMessage(body)) return body.requestId;
  if (isAuthenticatedXAcquisitionRequestMessage(body)) return body.requestId;
  if (isOpenRouterModelDiagnosticMessage(body)) return body.requestId;
  if(isAuthenticatedProfileBootstrapMessage(body))return body.requestId;
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function runScheduledMaintenance(env: Env): Promise<void> {
  try {await runConnectorMaintenance(env)} catch {console.warn('Could not run connector maintenance')}
  try {await dispatchV1Acquisitions(env)} catch {console.warn('Could not dispatch v1 acquisition jobs')}
  try {await dispatchV1Intelligence(env)} catch {console.warn('Could not dispatch v1 intelligence jobs')}
  const repo = new D1Repository(env.DB);
  const now = new Date();
  if(env.SOURCE_LEGACY_POLLING_ENABLED!=='false')try{await enqueueScheduledSourceAcquisitions(env,now)}catch{console.warn("Could not enqueue scheduled source acquisition")}
  try {
    await dispatchPendingOpenRouterModelDiagnostics(env,now);
  } catch (error) {
    console.warn("Could not dispatch pending OpenRouter model diagnostic",error);
  }
  try{await dispatchPendingAuthenticatedProfileBootstraps(env,now)}catch(error){console.warn("Could not dispatch pending authenticated profile bootstrap",error)}
  try{await dispatchPendingAuthenticatedSurfaceDiagnostics(env,now)}catch(error){console.warn("Could not dispatch pending authenticated surface diagnostic",error)}
  try{await dispatchPendingPublicAcquisitionRequests(env)}catch(error){console.warn("Could not dispatch pending public acquisition requests",error)}
  try{await dispatchPendingAuthenticatedXAcquisitionRequests(env)}catch(error){console.warn("Could not dispatch pending authenticated X acquisition requests",error)}
  try{await expireAcquisitionDiagnostics(env.DB,now)}catch(error){console.warn("Could not expire acquisition diagnostics",error)}
  if (env.DISTILLED_WEB_OPERATOR_ENABLED === "true") {
    try { await relayPendingWebOperatorOutbox(env,undefined,25,now); }
    catch (error) { console.warn("Could not relay pending Web Operator runs",error); }
  }
  try {
    await runRetentionCleanup(repo, env.RAW_ARCHIVE, now);
  } catch (error) {
    console.warn("Could not run retention cleanup", error);
  }

  try {
    await publishDueBriefingEditions({
      repo,
      briefings: await repo.listBriefings(),
      now,
      summaryAdapter: createSummaryAdapterFromEnv(env, repo)
    });
  } catch (error) {
    console.error("Could not publish briefing editions", error);
  }

  try {
    await pollApifySourceRuns({
      repo,
      bucket: env.RAW_ARCHIVE,
      queue: env.PROCESSING_QUEUE,
      env,
      now
    });
  } catch (error) {
    console.warn("Could not poll Apify source runs", error);
  }

  try {
    const rescued = await rescueStaleProcessingJobs(repo, env.PROCESSING_QUEUE, now);
    if (rescued > 0) console.log("Requeued stale processing jobs", { rescued });
  } catch (error) {
    console.warn("Could not requeue stale processing jobs", error);
  }

  const briefings = await repo.listBriefings();
  let enqueued = 0;

  for (const briefing of briefings) {
    try {
      enqueued += await enqueueDueSourceRefreshJobs({
        env,
        briefing,
        repo,
        queue: env.PROCESSING_QUEUE,
        now
      });
    } catch (error) {
      console.warn(`Could not enqueue source refreshes for briefing ${briefing.id}`, error);
    }
  }
  if (enqueued > 0) console.log("Enqueued scheduled source refresh jobs", { enqueued });
}

async function rescueStaleProcessingJobs(
  repo: Repository,
  queue: { send(message: ProcessingJobMessage): Promise<unknown> },
  now: Date
): Promise<number> {
  const staleBefore = new Date(now.getTime() - STALE_PROCESSING_JOB_REQUEUE_AGE_MS).toISOString();
  const jobs = await repo.listProcessingJobs({
    states: ["queued"],
    updatedBefore: staleBefore,
    order: "oldest",
    limit: STALE_PROCESSING_JOB_REQUEUE_LIMIT
  });
  let rescued = 0;

  for (const job of jobs) {
    await queue.send({
      type: "process_raw_message",
      jobId: job.id,
      briefingId: job.briefingId,
      rawMessageId: job.rawMessageId
    });
    await repo.requeueProcessingJob(job.id, now);
    rescued += 1;
  }

  return rescued;
}
