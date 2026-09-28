import {
  DEFAULT_SLICE_BUDGET,
  makeId,
  ModelGatewayError,
  type AcquisitionFailure,
  type ClosedLoopAcquisitionOutcome,
  type DeterministicAcquisitionPort,
  type ModelCapability,
  type ModelRoutingConfig
} from "@distilled/agent-runtime";
import {
  defaultNextBriefingAt,
  searchBriefingEditions,
  sanitizeEditionSectionForLanguage,
  sanitizeEvidenceText,
  selectEditionReferenceSections,
  synthesizeEditionNarrativeSummary,
  type BriefingEvidence,
  type BriefingConfig,
  type BriefingEdition
} from "@distilled/core";
import { Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { createSummaryAdapterFromEnv } from "./ai";
import {
  accountAuth,
  adminAuth,
  clearSessionCookie,
  createSession,
  getOrCreateVoterId,
  getVoterId,
  hashPassword,
  hashToken,
  normalizeEmail,
  normalizeUsername,
  randomToken,
  SESSION_COOKIE,
  setSessionCookie,
  verifyPassword,
  verifySession
} from "./auth";
import { publishManualBriefingEdition } from "./editions";
import { sendPasswordResetEmail, sendVerificationEmail } from "./mailer";
import { D1Repository } from "./repository";
import { runRetentionCleanup } from "./retention";
import { addSourceFromInput, refreshEnabledSources } from "./sources";
import type { AccountRecord, AccountRole, Env, ProcessingJobMessage, Repository } from "./types";
import { createWorkerPublicSourceAcquisitionService, createWorkerWebOperatorRuntimeHandler } from "./web-operator-runtime";
import { D1UpstreamResourceStore } from "./upstream-resource-store";
import { discoverAndPromotePublicSourceWorkflow } from "./public-source-discovery";
import { D1BrowserUseRunTelemetry } from "./browser-use-run-telemetry";
import { createWorkerXAcquisitionService } from "./authenticated-x-acquisition";
import { handleBoundedDecision,handleBoundedDecisionOutcome } from "./bounded-decision-provider";
import { D1AuthenticatedProfileRepository } from "./authenticated-profile-store";
import { provisionAuthenticatedProfile } from "./authenticated-profile-provisioning";
import { handleBridgePreflight,handleContainerPreflight,handleProviderDiagnostic } from "./bridge-preflight";
import { handlePublicBrowserAcquisition } from "./public-browser-acquisition";

type Variables = {
  repo: Repository;
  account?: AccountRecord;
};

const CANONICAL_HOST = "distilled.news";
const LEGACY_HOSTS = new Set(["lownoise.news", "www.lownoise.news"]);
const liveSmokeProviderEndpointsSchema = z.array(z.object({
  tag: z.string().trim().min(1),
  reportedIdentities: z.array(z.string().trim().min(1)).min(1)
}).strict()).min(2);

export interface AppOptions {
  repository?: Repository;
  bucket?: {
    put(key: string, value: string, options?: unknown): Promise<unknown>;
    delete(key: string): Promise<unknown>;
  };
  queue?: { send(message: ProcessingJobMessage): Promise<unknown> };
  fetcher?: typeof fetch;
  now?: () => Date;
}

const authInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  username: z.string().min(1).optional(),
  setupToken: z.string().optional(),
  turnstileToken: z.string().optional()
});

const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  turnstileToken: z.string().optional()
});

const tokenInputSchema = z.object({
  token: z.string().min(1)
});

const passwordResetRequestSchema = z.object({
  email: z.string().email(),
  turnstileToken: z.string().optional()
});

const passwordResetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8)
});

const accountUpdateSchema = z.object({
  username: z.string().min(1).optional(),
  currentPassword: z.string().min(1).optional(),
  newPassword: z.string().min(8).optional()
}).refine((input) => !input.newPassword || Boolean(input.currentPassword), {
  message: "current password is required",
  path: ["currentPassword"]
});

const adminAccountUpdateSchema = z.object({
  username: z.string().min(1).optional(),
  role: z.enum(["admin", "user"]).optional(),
  disabled: z.boolean().optional()
});

const adminBriefingUpdateSchema = z.object({
  paused: z.boolean().optional()
});

const FIXED_RETENTION_DAYS = 15;
const FIXED_BRIEFING_TIME_OF_DAY = "00:00";

const briefingCadenceSchema = z.preprocess(
  (value) => (value === "monthly" ? "weekly" : value),
  z.enum(["hourly", "daily", "weekly"])
);

const briefingInputSchema = z.object({
  id: z.string().min(1).default(() => `briefing_${crypto.randomUUID()}`),
  slug: z.string().min(1).default("personal"),
  title: z.string().min(1).default("Personal Briefing"),
  stars: z.number().int().min(0).default(0),
  interestProfile: z.string().min(1),
  styleInstruction: z.string().optional(),
  publicFeedEnabled: z.boolean().default(true),
  paused: z.boolean().default(false),
  language: z.enum(["en", "ar", "fr"]).default("en"),
  intensity: z.enum(["low", "medium", "high"]).default("medium"),
  briefingCadence: briefingCadenceSchema.default("hourly"),
  briefingTimeOfDay: z.string().regex(/^\d{1,2}:\d{2}$/).default("00:00"),
  briefingTimezone: z.string().min(1).default("UTC"),
  nextBriefingAt: z.string().optional(),
  retentionDays: z.number().int().min(1).max(90).default(FIXED_RETENTION_DAYS)
});

const sourceInputSchema = z.union([
  z.object({
    briefingId: z.string().min(1),
    url: z.string().min(1),
    input: z.string().min(1).optional()
  }),
  z.object({
    briefingId: z.string().min(1),
    input: z.string().min(1)
  }),
  z.object({
    briefingId: z.string().min(1),
    sourceId: z.string().min(1),
    enabled: z.boolean()
  })
]);

const healthInputSchema = z.object({
  briefingId: z.string().min(1).optional()
});
const livePublicAcquisitionSmokeSchema = z.object({
  evaluationId:z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
  sourceUrl: z.string().url().max(2_048),
  ownerAccountId: z.string().min(1).max(128),
  startTime: z.string().datetime({ offset: true }),
  endTime: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$/),
  limits: z.object({
    maxItems: z.number().int().min(1).max(30),
    maxPages: z.number().int().min(1).max(5),
    maxScrolls: z.number().int().min(1).max(5),
    maxPhysicalAttempts: z.number().int().min(1).max(30),
    maxExecutionMs: z.number().int().min(1_000).max(90_000)
  }).strict().optional()
}).strict();
const xAcquisitionSchema=z.object({
  authenticatedProfileId:z.string().startsWith("authenticated_profile_").max(100),
  ownerAccountId:z.string().startsWith("account_").max(128),
  sourceUrl:z.string().url().max(2048),
  startTime:z.string().datetime({offset:true}),endTime:z.string().datetime({offset:true}),
  idempotencyKey:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$/),
  limits:z.object({maxItems:z.number().int().min(1).max(30),maxPages:z.number().int().min(1).max(5),maxScrolls:z.number().int().min(1).max(5),maxPhysicalAttempts:z.number().int().min(1).max(30),maxExecutionMs:z.number().int().min(1000).max(90000)}).strict().optional()
}).strict();

const feedStarInputSchema = z.object({
  starred: z.boolean()
});

function buildManifestPayload(input: {
  title: string;
  description: string;
  startUrl: string;
  id: string;
}) {
  return {
    id: input.id,
    name: input.title,
    short_name: input.title,
    description: input.description,
    display: "standalone",
    orientation: "portrait",
    scope: "/",
    start_url: input.startUrl,
    background_color: "#faf8f1",
    theme_color: "#faf8f1",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png"
      }
    ]
  };
}

export function createApp(options: AppOptions = {}) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();

  app.onError((error, c) => {
    if (error instanceof z.ZodError) {
      return c.json({ error: error.issues[0]?.message ?? "invalid request" }, 400);
    }
    console.error(error);
    if (error instanceof ModelGatewayError) {
      const retryable=["deadline_exceeded","provider_http_failure","malformed_response","transport_failure"].includes(error.failureClass);
      return c.json({error:"model_gateway_failure",failureClass:error.failureClass},retryable?503:502);
    }
    return c.json({ error: "internal server error" }, 500);
  });

  const repoFor = (c: { env: Env }): Repository => options.repository ?? new D1Repository(c.env.DB);
  const bucketFor = (c: { env: Env }) => options.bucket ?? c.env.RAW_ARCHIVE;
  const queueFor = (c: { env: Env }) => options.queue ?? c.env.PROCESSING_QUEUE;
  const fetcher = options.fetcher ?? fetch;
  const nowFor = options.now ?? (() => new Date());

  app.use("*", async (c, next) => {
    const url = new URL(c.req.url);
    if (url.hostname === `www.${CANONICAL_HOST}` || LEGACY_HOSTS.has(url.hostname) || (url.hostname === CANONICAL_HOST && url.protocol === "http:")) {
      url.protocol = "https:";
      url.hostname = CANONICAL_HOST;
      return c.redirect(url.toString(), 301);
    }
    return next();
  });

  app.all("/v1/agent-runs/process", async (c) => {
    const handler = createWorkerWebOperatorRuntimeHandler(c.env);
    return handler(c.req.raw);
  });
  app.post("/v1/authenticated-profiles", async (c) => provisionAuthenticatedProfile(c.req.raw,c.env));
  app.post("/v1/authenticated-profiles/bridge-preflight", async (c) => handleBridgePreflight(c.req.raw,c.env));
  app.post("/v1/authenticated-profiles/container-preflight", async (c) => handleContainerPreflight(c.req.raw,c.env));
  app.post("/v1/public-browser/acquisition", async (c) => handlePublicBrowserAcquisition(c.req.raw,c.env));
  app.post("/v1/bounded-decisions",async(c)=>handleBoundedDecision(c.req.raw,c.env));
  app.post("/v1/bounded-decisions/outcome",async(c)=>handleBoundedDecisionOutcome(c.req.raw,c.env));
  app.on(["GET","POST"], "/v1/authenticated-profiles/provider-diagnostic", async (c) => handleProviderDiagnostic(c.req.raw,c.env));

  // Public, read-only fixture for bounded production acquisition validation.
  // It exists only while the protected smoke flag is temporarily enabled.
  app.on("GET",["/v1/live-smoke/browser-use-fixture","/v1/live-smoke/browser-use-fixture/listing/:evaluationId"], (c) => {
    if (c.env.DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE !== "true") return c.text("not found",404);
    return c.html(`<!doctype html><html><head><title>Browser acquisition fixture</title></head><body><main><h1>Fixture news</h1><div id="stories"></div><div style="height:5000px"></div></main><script>
      let count=0; addEventListener('scroll',()=>{count++; if(count>2)return; const id=count===1?'a':'b';
        const link=document.createElement('a'); link.href=['/v1','/live-smoke','/browser-use-fixture','/article/',id].join('');
        link.textContent='Fixture article '+id; document.getElementById('stories').append(link);
      });
    </script></body></html>`,200,{"cache-control":"no-store"});
  });
  app.get("/v1/live-smoke/browser-use-fixture/article/:id", (c) => {
    if (c.env.DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE !== "true") return c.text("not found",404);
    const id=c.req.param("id"); if(id!=="a"&&id!=="b")return c.text("not found",404);
    const canonical=new URL(c.req.url).origin+`/v1/live-smoke/browser-use-fixture/article/${id}`;
    const published=id==="a"?"2026-09-24T12:00:00Z":"2026-09-25T12:00:00Z";
    const body=`Verified fixture article ${id} contains independently observable publication metadata and substantive read-only reporting. Its complete body is long enough to satisfy the same trusted content threshold used for real publishers, so the benchmark measures discovery rather than incomplete-content rejection.`;
    const metadata=JSON.stringify({"@context":"https://schema.org","@type":"NewsArticle",headline:`Fixture article ${id}`,datePublished:published,mainEntityOfPage:canonical,articleBody:body});
    return c.html(`<!doctype html><html><head><title>Fixture article ${id}</title><link rel="canonical" href="${canonical}"><meta property="article:published_time" content="${published}"><script type="application/ld+json">${metadata}</script></head><body><article><h1>Fixture article ${id}</h1><time datetime="${published}">${published}</time><p>${body}</p></article></body></html>`,200,{"cache-control":"no-store"});
  });

  app.post("/v1/live-smoke/public-acquisition", async (c) => {
    if (c.env.DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE !== "true") return c.json({ error: "not found" }, 404);
    if (!isRuntimeAuthorized(c)) return c.json({ error: "unauthorized" }, 401);
    const input = livePublicAcquisitionSmokeSchema.parse(await c.req.json().catch(() => ({})));
    const now = nowFor();
    const source = new URL(input.sourceUrl);
    if (source.protocol !== "https:" || source.username || source.password || Date.parse(input.startTime) >= Date.parse(input.endTime) || Date.parse(input.startTime) >= now.getTime()) return c.json({ error: "invalid_source_window" }, 400);
    const window = { startTime: new Date(input.startTime).toISOString(), endTime: new Date(input.endTime).toISOString() };
    const owner = await repoFor(c).getAccountById(input.ownerAccountId);
    if (!owner || owner.disabledAt) return c.json({ error: "owner_not_found" }, 404);
    const resource = await new D1UpstreamResourceStore(c.env.DB).resolveOrCreate({ tenantId: owner.id, canonicalSourceUrl: source.href, resourceLocator:input.evaluationId?`discovery-evaluation:${input.evaluationId}`:undefined,now: now.toISOString() });
    const limits = input.limits ?? { maxItems: 10, maxPages: 3, maxScrolls: 3, maxPhysicalAttempts: 16, maxExecutionMs: 60_000 };
    const runId = makeId("public_source_run", resource.id, input.idempotencyKey);
    const service = createWorkerPublicSourceAcquisitionService(c.env, { tenantId: owner.id, ownerId: owner.id, resourceId: resource.id, runId, sourceUrl: source.href, fetcher, webOperator: (request) => discoverAndPromotePublicSourceWorkflow(c.env, { request, tenantId: owner.id, ownerId: owner.id, resourceId: resource.id, runId, idempotencyKey: input.idempotencyKey }) });
    let outcome: Awaited<ReturnType<typeof service.acquire>>;
    try { outcome = await service.acquire({ tenantId: owner.id, ownerId: owner.id, resourceId: resource.id, source: { canonicalSourceUrl: source.href }, window, limits, authentication: "PUBLIC", acquisitionAsOf: now.toISOString() }); }
    catch (error) { await new D1BrowserUseRunTelemetry(c.env.DB).completeAcquisition(runId,"STRUCTURAL_FAILURE"); throw error; }
    await new D1BrowserUseRunTelemetry(c.env.DB).completeAcquisition(runId, outcome.status === "SUCCESS" ? "SUCCESS" : outcome.stopReason === "CHALLENGE_REQUIRED" ? "CHALLENGE_REQUIRED" : outcome.stopReason === "POLICY_DENIED" ? "POLICY_DENIED" : "STRUCTURAL_FAILURE");
    const discoveryTelemetry=outcome.webOperatorCalls===0?null:await new D1BrowserUseRunTelemetry(c.env.DB).get(`${runId}_browser_use`);
    return c.json({ browserUseDiscoveryRuns:discoveryTelemetry?.browserUseDiscoveryRuns??0,jevCalls:discoveryTelemetry?.jevCalls??0,decisionFallbacks:discoveryTelemetry?.decisionFallbacks??0,status: outcome.status, stages: outcome.stages, stopReason: outcome.stopReason, upstreamResourceId: resource.id, activeWorkflow: outcome.activeWorkflow, candidateWorkflow: outcome.candidateWorkflow, webOperatorCalls: outcome.webOperatorCalls, webOperatorRunId: outcome.webOperatorRunId, discoveryModelCalls: outcome.discoveryModelCalls, discoveryBrowserOperations: outcome.discoveryBrowserOperations, requestedWindow: outcome.result?.requestedWindow ?? outcome.request.window, effectiveWindow: outcome.result?.effectiveWindow, acquisitionAsOf: outcome.result?.acquisitionAsOf ?? outcome.request.acquisitionAsOf, coverage: outcome.result?.coverage, continuation: outcome.result?.continuation, items: outcome.result?.items.map((item) => ({ canonicalItemUrl: item.canonicalItemUrl, sourceItemId: item.sourceItemId, title: item.title, publishedAt: item.publishedAt, contentLength: item.text?.length, originalSourceReference: item.originalSourceReference })), committedHighWater: outcome.committedHighWater });
  });

  app.post("/v1/live-smoke/public-acquisition/submit", async (c) => {
    if (c.env.DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE !== "true") return c.json({error:"not found"},404);
    if (!isRuntimeAuthorized(c)) return c.json({error:"unauthorized"},401);
    const input = livePublicAcquisitionSmokeSchema.safeParse(await c.req.json().catch(()=>null));
    if (!input.success) return c.json({error:"invalid_request"},400);
    const source = new URL(input.data.sourceUrl);
    if (source.protocol!=="https:" || source.username || source.password || source.search || source.hash || Date.parse(input.data.startTime)>=Date.parse(input.data.endTime)) return c.json({error:"invalid_source_window"},400);
    const owner=await repoFor(c).getAccountById(input.data.ownerAccountId);
    if (!owner || owner.disabledAt) return c.json({error:"owner_not_found"},404);
    const requestId=makeId("public_acquisition_request",owner.id,source.href,input.data.idempotencyKey);
    const inserted=await c.env.DB.prepare(`INSERT OR IGNORE INTO public_acquisition_requests
      (request_id,idempotency_key,owner_account_id,request_json,state,created_at) VALUES (?,?,?,?,'pending',?)`)
      .bind(requestId,input.data.idempotencyKey,owner.id,JSON.stringify({...input.data,sourceUrl:source.href}),nowFor().toISOString()).run();
    if (Number(inserted.meta.changes)===1) {
      await c.env.WEB_OPERATOR_QUEUE.send({type:"public_acquisition_request",requestId});
      await c.env.DB.prepare("UPDATE public_acquisition_requests SET state='queued' WHERE request_id=? AND state='pending'").bind(requestId).run();
    }
    const state=await c.env.DB.prepare("SELECT state FROM public_acquisition_requests WHERE request_id=?").bind(requestId).first<{state:string}>();
    return c.json({requestId,state:state?.state??"pending"},202);
  });

  app.get("/v1/live-smoke/public-acquisition/requests/:requestId", async (c) => {
    if (c.env.DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE !== "true") return c.json({error:"not found"},404);
    if (!isRuntimeAuthorized(c)) return c.json({error:"unauthorized"},401);
    const requestId=c.req.param("requestId");
    if (!/^public_acquisition_request_[a-f0-9]{32}$/.test(requestId)) return c.json({error:"invalid_request_id"},400);
    const row=await c.env.DB.prepare("SELECT request_id,state,outcome,result_json,failure_class,created_at,started_at,completed_at FROM public_acquisition_requests WHERE request_id=?")
      .bind(requestId).first<{request_id:string;state:string;outcome:string|null;result_json:string|null;failure_class:string|null;created_at:string;started_at:string|null;completed_at:string|null}>();
    if (!row) return c.json({error:"not found"},404);
    return c.json({requestId:row.request_id,state:row.state,outcome:row.outcome,result:row.result_json?JSON.parse(row.result_json):null,failureClass:row.failure_class,createdAt:row.created_at,startedAt:row.started_at,completedAt:row.completed_at});
  });

  app.get("/v1/live-smoke/browser-use-runs/:runId", async (c) => {
    if (c.env.DISTILLED_LIVE_PUBLIC_ACQUISITION_SMOKE !== "true") return c.json({ error: "not found" }, 404);
    if (!isRuntimeAuthorized(c)) return c.json({ error: "unauthorized" }, 401);
    const runId = c.req.param("runId");
    if (!/^(?:public_source_run|x_source_run)_[a-f0-9]{32}_browser_use$/.test(runId)) return c.json({ error: "invalid_run_id" }, 400);
    const row = await new D1BrowserUseRunTelemetry(c.env.DB).get(runId);
    return row ? c.json(row) : c.json({ error: "not found" }, 404);
  });
  app.get("/v1/browser-use-runs/:runId",async(c)=>{
    if(!isRuntimeAuthorized(c))return c.json({error:"unauthorized"},401);
    const runId=c.req.param("runId");
    if(!/^(?:public_source_run|x_source_run)_[a-f0-9]{32}_browser_use$/.test(runId))return c.json({error:"invalid_run_id"},400);
    const row=await new D1BrowserUseRunTelemetry(c.env.DB).get(runId);
    return row?c.json(row):c.json({error:"not found"},404);
  });

  app.post("/v1/authenticated-sources/x/acquisition",async(c)=>{
    if(!isRuntimeAuthorized(c))return c.json({error:"unauthorized"},401);
    const parsed=xAcquisitionSchema.safeParse(await c.req.json().catch(()=>null));
    if(!parsed.success)return c.json({error:"invalid_request"},400);
    const input=parsed.data,source=new URL(input.sourceUrl),now=nowFor();
    if(source.origin!=="https://x.com"||!/^\/[A-Za-z0-9_]{1,15}\/?$/.test(source.pathname)||source.search||source.hash||Date.parse(input.startTime)>=Date.parse(input.endTime)||Date.parse(input.startTime)>=now.getTime())return c.json({error:"invalid_x_source_window"},400);
    const owner=await repoFor(c).getAccountById(input.ownerAccountId);
    if(!owner||owner.disabledAt)return c.json({error:"owner_not_found"},404);
    const profile=await new D1AuthenticatedProfileRepository(c.env.DB).getSiteProfile(input.authenticatedProfileId);
    if(!profile||profile.tenantId!==owner.id||profile.ownerId!==owner.id||profile.siteFamily!=="x")return c.json({error:"profile_not_found"},404);
    const canonical=`https://x.com/${source.pathname.split("/").filter(Boolean)[0]}`;
    const resource=await new D1UpstreamResourceStore(c.env.DB).resolveOrCreate({tenantId:owner.id,canonicalSourceUrl:canonical,sourceFamily:"x",now:now.toISOString()});
    const runId=makeId("x_source_run",resource.id,input.idempotencyKey);
    const service=createWorkerXAcquisitionService(c.env,{tenantId:owner.id,ownerId:owner.id,profileId:input.authenticatedProfileId,resourceId:resource.id,runId,idempotencyKey:input.idempotencyKey});
    const limits=input.limits??{maxItems:10,maxPages:3,maxScrolls:3,maxPhysicalAttempts:16,maxExecutionMs:90000};
    let outcome:Awaited<ReturnType<typeof service.acquire>>;
    try{outcome=await service.acquire({tenantId:owner.id,ownerId:owner.id,resourceId:resource.id,source:{sourceFamily:"x",canonicalSourceUrl:canonical},window:{startTime:new Date(input.startTime).toISOString(),endTime:new Date(input.endTime).toISOString()},limits,authentication:"AUTH_REQUIRED",acquisitionAsOf:now.toISOString()})}
    catch{await new D1BrowserUseRunTelemetry(c.env.DB).completeAcquisition(runId,"STRUCTURAL_FAILURE");return c.json({error:"x_acquisition_failed"},500)}
    await new D1BrowserUseRunTelemetry(c.env.DB).completeAcquisition(runId,outcome.status==="SUCCESS"?"SUCCESS":outcome.stopReason==="CHALLENGE_REQUIRED"?"CHALLENGE_REQUIRED":outcome.stopReason==="AUTH_REQUIRED"?"AUTH_REQUIRED":"STRUCTURAL_FAILURE");
    return c.json({status:outcome.status,stages:outcome.stages,stopReason:outcome.stopReason,upstreamResourceId:resource.id,activeWorkflow:outcome.activeWorkflow,candidateWorkflow:outcome.candidateWorkflow,webOperatorCalls:outcome.webOperatorCalls,discoveryModelCalls:outcome.discoveryModelCalls,discoveryBrowserOperations:outcome.discoveryBrowserOperations,coverage:outcome.result?.coverage,continuation:outcome.result?.continuation,items:outcome.result?.items.map(item=>({sourceItemId:item.sourceItemId,canonicalItemUrl:item.canonicalItemUrl,publishedAt:item.publishedAt,contentLength:item.text?.length})),committedHighWater:outcome.committedHighWater});
  });

  app.post("/v1/authenticated-sources/x/acquisition/submit",async(c)=>{
    if(!isRuntimeAuthorized(c))return c.json({error:"unauthorized"},401);
    const parsed=xAcquisitionSchema.safeParse(await c.req.json().catch(()=>null));
    if(!parsed.success)return c.json({error:"invalid_request"},400);
    const input=parsed.data,source=new URL(input.sourceUrl),now=nowFor();
    if(source.origin!=="https://x.com"||!/^\/[A-Za-z0-9_]{1,15}\/?$/.test(source.pathname)||source.search||source.hash||Date.parse(input.startTime)>=Date.parse(input.endTime)||Date.parse(input.startTime)>=now.getTime())return c.json({error:"invalid_x_source_window"},400);
    const owner=await repoFor(c).getAccountById(input.ownerAccountId);
    if(!owner||owner.disabledAt)return c.json({error:"owner_not_found"},404);
    const profile=await new D1AuthenticatedProfileRepository(c.env.DB).getSiteProfile(input.authenticatedProfileId);
    if(!profile||profile.tenantId!==owner.id||profile.ownerId!==owner.id||profile.siteFamily!=="x")return c.json({error:"profile_not_found"},404);
    const canonical=`https://x.com/${source.pathname.split("/").filter(Boolean)[0]}`;
    const requestId=makeId("authenticated_x_acquisition_request",owner.id,canonical,input.authenticatedProfileId,input.idempotencyKey);
    const inserted=await c.env.DB.prepare("INSERT OR IGNORE INTO authenticated_x_acquisition_requests(request_id,idempotency_key,owner_account_id,authenticated_profile_id,request_json,state,created_at) VALUES(?,?,?,?,?,'pending',?)")
      .bind(requestId,input.idempotencyKey,owner.id,input.authenticatedProfileId,JSON.stringify({...input,sourceUrl:canonical}),now.toISOString()).run();
    if(Number(inserted.meta.changes)===1){
      await c.env.WEB_OPERATOR_QUEUE.send({type:"authenticated_x_acquisition_request",requestId});
      await c.env.DB.prepare("UPDATE authenticated_x_acquisition_requests SET state='queued' WHERE request_id=? AND state='pending'").bind(requestId).run();
    }
    const state=await c.env.DB.prepare("SELECT state FROM authenticated_x_acquisition_requests WHERE request_id=?").bind(requestId).first<{state:string}>();
    return c.json({requestId,state:state?.state??"pending"},202);
  });
  app.get("/v1/authenticated-sources/x/acquisition/requests/:requestId",async(c)=>{
    if(!isRuntimeAuthorized(c))return c.json({error:"unauthorized"},401);
    const requestId=c.req.param("requestId");
    if(!/^authenticated_x_acquisition_request_[a-f0-9]{32}$/.test(requestId))return c.json({error:"invalid_request_id"},400);
    const row=await c.env.DB.prepare("SELECT request_id,state,outcome,result_json,failure_class,created_at,started_at,completed_at FROM authenticated_x_acquisition_requests WHERE request_id=?")
      .bind(requestId).first<{request_id:string;state:string;outcome:string|null;result_json:string|null;failure_class:string|null;created_at:string;started_at:string|null;completed_at:string|null}>();
    if(!row)return c.json({error:"not_found"},404);
    return c.json({requestId:row.request_id,state:row.state,outcome:row.outcome,result:row.result_json?JSON.parse(row.result_json):null,failureClass:row.failure_class,createdAt:row.created_at,startedAt:row.started_at,completedAt:row.completed_at});
  });

  app.get("/api/auth/session", async (c) => {
    const repo = repoFor(c);
    const setupRequired = (await repo.countAdmins()) === 0;
    const claims = await verifySession(getCookie(c, SESSION_COOKIE), c.env.ADMIN_SESSION_SECRET ?? "");
    const account = claims ? await repo.getAccountById(claims.sub) : null;
    const authenticated = Boolean(account && !account.disabledAt);
    return c.json({
      authenticated,
      setupRequired,
      account: authenticated ? publicAccount(account!) : undefined,
      turnstileSiteKey: c.env.TURNSTILE_SITE_KEY
    });
  });

  app.post("/api/auth/setup", async (c) => {
    const repo = repoFor(c);
    if ((await repo.countAdmins()) > 0) return c.json({ error: "setup is already complete" }, 400);
    const input = authInputSchema.parse(await c.req.json().catch(() => ({})));
    if (input.setupToken !== (c.env.ADMIN_SETUP_TOKEN ?? c.env.ADMIN_SESSION_SECRET)) {
      return c.json({ error: "invalid setup token" }, 401);
    }
    if (!c.env.ADMIN_SESSION_SECRET) return c.json({ error: "ADMIN_SESSION_SECRET is not configured" }, 500);

    let account: AccountRecord;
    try {
      account = await createAccountOrError(repo, {
        email: input.email,
        username: input.username ?? "owner",
        password: input.password,
        role: "admin",
        verified: true
      });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "could not create account" }, 409);
    }
    await repo.ensureDefaultBriefing(account);
    setSessionCookie(c, await createSession(c.env.ADMIN_SESSION_SECRET, account));
    return c.json({ account: publicAccount(account) });
  });

  app.post("/api/auth/register", async (c) => {
    const repo = repoFor(c);
    const input = authInputSchema.parse(await c.req.json().catch(() => ({})));
    const email = normalizeEmail(input.email);
    await assertRateLimit(repo, `register:${email}`, "register", 5, 60 * 60 * 1000);
    if (!(await verifyTurnstileIfConfigured(c, input.turnstileToken))) return c.json({ error: "verification failed" }, 400);

    let account: AccountRecord;
    try {
      account = await createAccountOrError(repo, {
        email,
        username: input.username ?? email.split("@")[0],
        password: input.password,
        role: "user",
        verified: false
      });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "could not create account" }, 409);
    }
    try {
      await sendVerificationToken(repo, c.env, account);
    } catch (error) {
      logAuthEmailFailure("verification", account, c.env, error);
      await repo.deleteAccount(account.id);
      return c.json({ error: "could not send verification email" }, 502);
    }
    return c.json({ ok: true });
  });

  app.post("/api/auth/verify-email", async (c) => {
    const repo = repoFor(c);
    const input = tokenInputSchema.parse(await c.req.json().catch(() => ({})));
    const result = await consumeEmailVerificationTokenOrNull(repo, input.token, new Date());
    if (!result) return c.json({ error: "invalid or expired token" }, 400);
    const verified = result.account.emailVerifiedAt
      ? result.account
      : await repo.updateAccount({ id: result.account.id, emailVerifiedAt: new Date().toISOString() });
    if (!c.env.ADMIN_SESSION_SECRET) return c.json({ error: "ADMIN_SESSION_SECRET is not configured" }, 500);
    await repo.ensureDefaultBriefing(verified);
    if (result.newlyConsumed) setSessionCookie(c, await createSession(c.env.ADMIN_SESSION_SECRET, verified));
    return c.json({ account: publicAccount(verified) });
  });

  app.post("/api/auth/login", async (c) => {
    const repo = repoFor(c);
    const input = loginInputSchema.parse(await c.req.json().catch(() => ({})));
    const email = normalizeEmail(input.email);
    await assertRateLimit(repo, `login:${email}`, "login", 10, 15 * 60 * 1000);
    if (!(await verifyTurnstileIfConfigured(c, input.turnstileToken))) return c.json({ error: "verification failed" }, 400);
    if (!c.env.ADMIN_SESSION_SECRET) return c.json({ error: "ADMIN_SESSION_SECRET is not configured" }, 500);

    const account = await repo.getAccountByEmail(email);
    if (!account || account.disabledAt || !(await verifyPassword(input.password, account.passwordHash))) {
      return c.json({ error: "invalid email or password" }, 401);
    }
    if (!account.emailVerifiedAt) return c.json({ error: "verify your email before logging in" }, 403);
    setSessionCookie(c, await createSession(c.env.ADMIN_SESSION_SECRET, account));
    return c.json({ account: publicAccount(account) });
  });

  app.post("/api/auth/logout", async (c) => {
    clearSessionCookie(c);
    return c.json({ ok: true });
  });

  app.post("/api/auth/password/forgot", async (c) => {
    const repo = repoFor(c);
    const input = passwordResetRequestSchema.parse(await c.req.json().catch(() => ({})));
    const email = normalizeEmail(input.email);
    await assertRateLimit(repo, `forgot:${email}`, "password_reset_request", 5, 60 * 60 * 1000);
    if (!(await verifyTurnstileIfConfigured(c, input.turnstileToken))) return c.json({ ok: true });
    const account = await repo.getAccountByEmail(email);
    if (account && account.emailVerifiedAt && !account.disabledAt) {
      try {
        await sendPasswordResetToken(repo, c.env, account);
      } catch (error) {
        logAuthEmailFailure("password reset", account, c.env, error);
      }
    }
    return c.json({ ok: true });
  });

  app.post("/api/auth/password/reset", async (c) => {
    const repo = repoFor(c);
    const input = passwordResetSchema.parse(await c.req.json().catch(() => ({})));
    const account = await consumeTokenOrNull(repo, input.token, "password_reset", new Date());
    if (!account) return c.json({ error: "invalid or expired token" }, 400);
    await repo.updateAccount({ id: account.id, passwordHash: await hashPassword(input.password) });
    return c.json({ ok: true });
  });

  app.use("/api/me/*", accountAuth(repoFor));
  app.use("/api/admin/*", adminAuth(repoFor));

  app.get("/api/me/account", async (c) => {
    return c.json({ account: publicAccount(c.get("account")!) });
  });

  app.patch("/api/me/account", async (c) => {
    const repo = c.get("repo");
    const account = c.get("account")!;
    const input = accountUpdateSchema.parse(await c.req.json().catch(() => ({})));
    const username = input.username ? normalizeUsername(input.username) : undefined;
    try {
      if (username) await assertUsernameAvailable(repo, username, account.id);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "username is already taken" }, 409);
    }
    let passwordHash: string | undefined;
    if (input.newPassword) {
      const accountWithPassword = await repo.getAccountByEmail(account.email);
      if (!accountWithPassword || !(await verifyPassword(input.currentPassword ?? "", accountWithPassword.passwordHash))) {
        return c.json({ error: "invalid current password" }, 401);
      }
      passwordHash = await hashPassword(input.newPassword);
    }
    const updated = await repo.updateAccount({ id: account.id, username, passwordHash });
    return c.json({ account: publicAccount(updated), briefings: await repo.listBriefings(updated.id) });
  });

  app.get("/api/me/briefings", async (c) => {
    const repo = c.get("repo");
    const account = c.get("account")!;
    if ((await repo.listBriefings(account.id)).length === 0) await repo.ensureDefaultBriefing(account);
    return c.json({ briefings: await repo.listBriefings(account.id) });
  });

  app.post("/api/me/briefings", async (c) => {
    const repo = c.get("repo");
    const account = c.get("account")!;
    const input = briefingInputSchema.parse(await c.req.json());
    const existing = await repo.getBriefingById(input.id);
    if (existing && existing.ownerAccountId !== account.id) return c.json({ error: "briefing not found" }, 404);
    const slug = normalizeUsername(input.slug || input.title);
    const existingSlug = await repo.getBriefingBySlug(account.id, slug);
    if (existingSlug && existingSlug.id !== input.id) return c.json({ error: "feed slug is already used" }, 409);
    const briefingCadence = input.briefingCadence;
    const briefingTimeOfDay = FIXED_BRIEFING_TIME_OF_DAY;
    const scheduleChanged = !existing ||
      existing.briefingCadence !== briefingCadence ||
      existing.briefingTimeOfDay !== briefingTimeOfDay ||
      existing.briefingTimezone !== input.briefingTimezone;
    const nextBriefingAt = scheduleChanged
      ? defaultNextBriefingAt({
          cadence: briefingCadence,
          timeOfDay: briefingTimeOfDay,
          timezone: input.briefingTimezone
        })
      : input.nextBriefingAt ?? existing.nextBriefingAt;
    const briefing = await repo.upsertBriefing({
      ...input,
      ownerAccountId: account.id,
      ownerUsername: account.username,
      slug,
      stars: existing?.stars ?? input.stars,
      publicFeedEnabled: true,
      intensity: input.intensity,
      briefingCadence,
      briefingTimeOfDay,
      nextBriefingAt,
      retentionDays: FIXED_RETENTION_DAYS
    });
    return c.json({ briefing });
  });

  app.delete("/api/me/briefings/:briefingId", async (c) => {
    const repo = c.get("repo");
    const account = c.get("account")!;
    const briefings = await repo.listBriefings(account.id);
    if (briefings.length <= 1) return c.json({ error: "keep at least one feed" }, 400);
    const briefing = await getOwnedBriefing(repo, account, c.req.param("briefingId"));
    if (!briefing) return c.json({ error: "briefing not found" }, 404);
    await repo.deleteBriefing(briefing.id);
    return c.json({ briefings: await repo.listBriefings(account.id) });
  });

  app.get("/api/me/sources", async (c) => {
    const repo = c.get("repo");
    const briefing = await getOwnedBriefing(repo, c.get("account")!, c.req.query("briefingId"));
    if (!briefing) return c.json({ error: "briefing not found" }, 404);
    return c.json({ sources: await repo.listSources(briefing.id) });
  });

  app.post("/api/me/sources", async (c) => {
    const repo = c.get("repo");
    const parsed = sourceInputSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Enter a source URL, source query, or source toggle." }, 400);
    const body = parsed.data;
    const briefing = await getOwnedBriefing(repo, c.get("account")!, body.briefingId);
    if (!briefing) return c.json({ error: "briefing not found" }, 404);

    if ("url" in body || "input" in body) {
      let result;
      try {
        result = await addSourceFromInput({
          briefing,
          sourceInput: ("input" in body ? body.input : undefined) ?? ("url" in body ? body.url : ""),
          repo,
          bucket: bucketFor(c),
          queue: queueFor(c),
          env: c.env,
          fetcher
        });
      } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : "Could not add source" }, 400);
      }
      return c.json({
        sources: await repo.listSources(briefing.id),
        result,
        health: await repo.getHealth(briefing.id)
      });
    }

    const source = await repo.getSource(body.sourceId);
    if (!source || source.briefingId !== briefing.id) return c.json({ error: "source not found" }, 404);
    await repo.setSourceEnabled(body.sourceId, body.enabled);
    return c.json({
      sources: await repo.listSources(briefing.id),
      health: await repo.getHealth(briefing.id)
    });
  });

  app.post("/api/me/sources/refresh", async (c) => {
    const repo = c.get("repo");
    const parsed = healthInputSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "briefing not found" }, 400);
    const briefing = await getOwnedBriefing(repo, c.get("account")!, parsed.data.briefingId);
    if (!briefing) return c.json({ error: "briefing not found" }, 404);
    const results = await refreshEnabledSources({
      briefing,
      repo,
      bucket: bucketFor(c),
      queue: queueFor(c),
      env: c.env,
      fetcher,
      force: true
    });
    return c.json({
      sources: await repo.listSources(briefing.id),
      results,
      health: await repo.getHealth(briefing.id)
    });
  });

  app.delete("/api/me/sources/:sourceId", async (c) => {
    const repo = c.get("repo");
    const briefing = await getOwnedBriefing(repo, c.get("account")!, c.req.query("briefingId"));
    if (!briefing) return c.json({ error: "briefing not found" }, 404);
    const source = await repo.getSource(c.req.param("sourceId"));
    if (!source || source.briefingId !== briefing.id) return c.json({ error: "source not found" }, 404);
    await repo.deleteSource(source.id);
    return c.json({
      sources: await repo.listSources(briefing.id),
      health: await repo.getHealth(briefing.id)
    });
  });

  app.get("/api/me/health", async (c) => {
    const repo = c.get("repo");
    const briefing = await getOwnedBriefing(repo, c.get("account")!, c.req.query("briefingId"));
    if (!briefing) return c.json({ error: "briefing not found" }, 404);
    return c.json({ health: await repo.getHealth(briefing.id) });
  });

  app.post("/api/me/processing/retry", async (c) => {
    const repo = c.get("repo");
    const parsed = healthInputSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "briefing not found" }, 400);
    const briefing = await getOwnedBriefing(repo, c.get("account")!, parsed.data.briefingId);
    if (!briefing) return c.json({ error: "briefing not found" }, 404);
    const retried = await retryProcessingJobs(repo, queueFor(c), briefing.id);
    return c.json({ retried, health: await repo.getHealth(briefing.id) });
  });

  app.get("/api/admin/accounts", async (c) => {
    const repo = c.get("repo");
    return c.json({ accounts: await repo.listAccounts() });
  });

  app.patch("/api/admin/accounts/:accountId", async (c) => {
    const repo = c.get("repo");
    const target = await repo.getAccountById(c.req.param("accountId"));
    if (!target) return c.json({ error: "account not found" }, 404);
    const input = adminAccountUpdateSchema.parse(await c.req.json().catch(() => ({})));
    const username = input.username ? normalizeUsername(input.username) : undefined;
    try {
      if (username) await assertUsernameAvailable(repo, username, target.id);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "username is already taken" }, 409);
    }
    if (target.role === "admin" && (input.disabled === true || input.role === "user") && (await repo.countAdmins()) <= 1) {
      return c.json({ error: "keep at least one admin" }, 400);
    }
    const account = await repo.updateAccount({
      id: target.id,
      username,
      role: input.role,
      disabled: input.disabled
    });
    return c.json({ account: publicAccount(account), accounts: await repo.listAccounts() });
  });

  app.delete("/api/admin/accounts/:accountId", async (c) => {
    const repo = c.get("repo");
    const target = await repo.getAccountById(c.req.param("accountId"));
    if (!target) return c.json({ error: "account not found" }, 404);
    if (target.id === c.get("account")!.id) return c.json({ error: "cannot delete the signed-in admin" }, 400);
    if (target.role === "admin" && !target.disabledAt && (await repo.countAdmins()) <= 1) {
      return c.json({ error: "keep at least one admin" }, 400);
    }
    await repo.deleteAccount(target.id);
    return c.json({ accounts: await repo.listAccounts(), briefings: await repo.listBriefings() });
  });

  app.get("/api/admin/briefings", async (c) => {
    return c.json({ briefings: await c.get("repo").listBriefings() });
  });

  app.patch("/api/admin/briefings/:briefingId", async (c) => {
    const repo = c.get("repo");
    const briefing = await repo.getBriefingById(c.req.param("briefingId"));
    if (!briefing) return c.json({ error: "briefing not found" }, 404);
    const input = adminBriefingUpdateSchema.parse(await c.req.json().catch(() => ({})));
    const updated = input.paused === undefined
      ? briefing
      : await repo.upsertBriefing({ ...briefing, paused: input.paused });
    return c.json({
      briefing: updated,
      briefings: await repo.listBriefings(),
      accounts: await repo.listAccounts()
    });
  });

  app.delete("/api/admin/briefings/:briefingId", async (c) => {
    const repo = c.get("repo");
    const briefing = await repo.getBriefingById(c.req.param("briefingId"));
    if (!briefing) return c.json({ error: "briefing not found" }, 404);
    await repo.deleteBriefing(briefing.id);
    return c.json({ briefings: await repo.listBriefings(), accounts: await repo.listAccounts() });
  });

  app.get("/api/explore/feeds", async (c) => {
    const repo = repoFor(c);
    const feeds = await repo.listExploreBriefings(10);
    return c.json({ feeds: feeds.map(publicBriefing) });
  });

  app.get("/api/feed/:username/:briefingSlug", async (c) => {
    const resolved = await resolvePublicFeed(c);
    if (resolved instanceof Response) return resolved;
    const { repo, briefing } = resolved;
    const voterId = await getVoterId(c);
    const editions = (await repo.listBriefingEditions(briefing.id, true))
      .filter((edition) => isPublicEditionVisible(edition, briefing.language));
    return c.json({
      briefing: publicBriefing(briefing),
      editions: editions.map((edition) => publicEdition(edition, briefing, false)),
      viewerHasStarred: voterId ? await repo.hasBriefingStar(briefing.id, voterId) : false
    });
  });

  app.get("/api/feed/:username/:briefingSlug/editions/:editionId", async (c) => {
    const resolved = await resolvePublicFeed(c);
    if (resolved instanceof Response) return resolved;
    const { repo, briefing } = resolved;
    const edition = await repo.getBriefingEdition(briefing.id, c.req.param("editionId"));
    if (!edition) return c.json({ error: "edition not found" }, 404);
    if (!isPublicEditionVisible(edition, briefing.language)) return c.json({ error: "edition not found" }, 404);
    return c.json({ edition: publicEdition(edition, briefing, true) });
  });

  app.get("/api/feed/:username/:briefingSlug/items/:itemId/evidence", async (c) => {
    const resolved = await resolvePublicFeed(c);
    if (resolved instanceof Response) return resolved;
    const { repo, briefing } = resolved;
    const evidence = await repo.getFeedItemEvidence(briefing.id, c.req.param("itemId"));
    return c.json({ evidence: evidence.map((entry) => publicEvidence(entry, briefing.language)) });
  });

  app.get("/api/feed/:username/:briefingSlug/search", async (c) => {
    const resolved = await resolvePublicFeed(c);
    if (resolved instanceof Response) return resolved;
    const { repo, briefing } = resolved;
    const editions = (await repo.listBriefingEditions(briefing.id, true, new Date(), 100))
      .filter((edition) => isPublicEditionVisible(edition, briefing.language));
    return c.json({
      editions: searchBriefingEditions(
        editions,
        c.req.query("q") ?? ""
      ).map((edition) => publicEdition(edition, briefing, true))
    });
  });

  app.post("/api/feed/:username/:briefingSlug/request-summary", async (c) => {
    const resolved = await resolvePublicFeed(c);
    if (resolved instanceof Response) return resolved;
    const { repo, briefing } = resolved;
    if (briefing.paused) return c.json({ error: "feed is paused" }, 409);

    try {
      await assertRateLimit(
        repo,
        await manualSummaryRateLimitKey(c, briefing.id),
        "manual_summary",
        6,
        60 * 60 * 1000
      );
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "too many attempts") throw error;
      return c.json({ error: "too many summary requests" }, 429);
    }

    const edition = await publishManualBriefingEdition({
      repo,
      briefing,
      now: nowFor(),
      summaryAdapter: createSummaryAdapterFromEnv(c.env, repo)
    });
    return c.json({
      edition: edition ? publicEdition(edition, briefing, false) : null,
      message: edition ? "new brief published" : "no new accepted updates"
    });
  });

  app.post("/api/feed/:username/:briefingSlug/star", async (c) => {
    const resolved = await resolvePublicFeed(c);
    if (resolved instanceof Response) return resolved;
    const { repo, briefing } = resolved;

    const input = feedStarInputSchema.parse(await c.req.json().catch(() => ({})));
    const voterId = await getOrCreateVoterId(c);
    if (!voterId) return c.json({ error: "voting is not configured" }, 500);

    const stars = await repo.setBriefingStar(briefing.id, voterId, input.starred);
    return c.json({ stars, viewerHasStarred: input.starred });
  });

  app.get("/api/feed/:briefingSlug", (c) => c.json({ error: "not found" }, 404));
  app.get("/api/feed/:briefingSlug/search", (c) => c.json({ error: "not found" }, 404));
  app.post("/api/feed/:briefingSlug/star", (c) => c.json({ error: "not found" }, 404));

  app.get("/manifest.webmanifest", async (c) => {
    const repo = repoFor(c);
    const username = c.req.query("user")?.trim();
    const feedSlug = c.req.query("feed")?.trim();

    let manifest = buildManifestPayload({
      id: "/",
      title: "Distilled.news",
      description: "A quiet personal news briefing.",
      startUrl: "/"
    });

    if (username && feedSlug) {
      const resolved = await repo.resolveUsernameAlias(username);
      const briefing = resolved ? await repo.getBriefingBySlug(resolved.account.id, feedSlug) : null;
      if (resolved && briefing) {
        manifest = buildManifestPayload({
          id: `/${resolved.account.username}/${briefing.slug}/`,
          title: briefing.title,
          description: "Published briefing items only.",
          startUrl: `/${resolved.account.username}/${briefing.slug}/`
        });
      }
    }

    return new Response(JSON.stringify(manifest), {
      headers: {
        "content-type": "application/manifest+json; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  });

  app.post("/api/internal/retention/run", async (c) => {
    const secret = c.env.INTERNAL_MAINTENANCE_SECRET?.trim();
    const provided = c.req.header("x-distilled-internal")?.trim();
    if (!secret || !provided || provided !== secret) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const repo = repoFor(c);
    return c.json(await runRetentionCleanup(repo, bucketFor(c), new Date()));
  });

  app.all("/api/*", (c) => c.json({ error: "not found" }, 404));
  app.all("/telegram/*", (c) => c.json({ error: "not found" }, 404));
  app.get("/feed/*", (c) => c.text("not found", 404));
  app.get("/demo", (c) => c.redirect("/", 302));

  app.all("*", async (c) => {
    const routeRedirect = await maybeRedirectUsernameRoute(c, repoFor(c));
    if (routeRedirect) return routeRedirect;
    if (c.env.ASSETS) {
      const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
      if (assetResponse.status !== 404 || c.req.method !== "GET") return assetResponse;

      const accept = c.req.header("accept") ?? "";
      const requestPath = new URL(c.req.url).pathname;
      const hasFileExtension = /\/[^/]+\.[^/]+$/.test(requestPath);
      if (hasFileExtension && !accept.includes("text/html")) return assetResponse;

      const indexUrl = new URL(c.req.url);
      indexUrl.pathname = "/";
      indexUrl.search = "";
      return c.env.ASSETS.fetch(new Request(indexUrl, c.req.raw));
    }
    return c.text("Distilled.news Worker is running. Build apps/web to serve the UI.", 200);
  });

  async function resolvePublicFeed(c: Context<{ Bindings: Env; Variables: Variables }>) {
    const repo = repoFor(c);
    const username = c.req.param("username") ?? "";
    const briefingSlug = c.req.param("briefingSlug") ?? "";
    const resolved = await repo.resolveUsernameAlias(username);
    if (!resolved) return c.json({ error: "feed not found" }, 404);
    if (resolved.account.disabledAt) return c.json({ error: "feed not found" }, 404);
    if (!resolved.alias.isCurrent || username !== resolved.account.username) {
      const url = new URL(c.req.url);
      url.pathname = url.pathname.replace(`/api/feed/${username}/`, `/api/feed/${resolved.account.username}/`);
      return c.redirect(url.toString(), 301);
    }
    const briefing = await repo.getBriefingBySlug(resolved.account.id, briefingSlug);
    if (!briefing) return c.json({ error: "feed not found" }, 404);
    return { repo, account: resolved.account, briefing };
  }

  return app;
}

async function createAccountOrError(
  repo: Repository,
  input: {
    email: string;
    username: string;
    password: string;
    role: AccountRole;
    verified: boolean;
  }
): Promise<AccountRecord> {
  const email = normalizeEmail(input.email);
  const username = normalizeUsername(input.username);
  if (await repo.getAccountByEmail(email)) throw new Error("email is already registered");
  await assertUsernameAvailable(repo, username);
  return repo.createAccount({
    email,
    username,
    role: input.role,
    passwordHash: await hashPassword(input.password),
    emailVerifiedAt: input.verified ? new Date().toISOString() : undefined
  });
}

async function sendVerificationToken(repo: Repository, env: Env, account: AccountRecord): Promise<void> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await repo.createAuthToken({
    accountId: account.id,
    purpose: "email_verification",
    tokenHash: await hashToken(token),
    expiresAt
  });
  await sendVerificationEmail(env, account, token);
}

async function sendPasswordResetToken(repo: Repository, env: Env, account: AccountRecord): Promise<void> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await repo.createAuthToken({
    accountId: account.id,
    purpose: "password_reset",
    tokenHash: await hashToken(token),
    expiresAt
  });
  await sendPasswordResetEmail(env, account, token);
}

async function consumeToken(
  repo: Repository,
  token: string,
  purpose: "email_verification" | "password_reset",
  now: Date
): Promise<AccountRecord> {
  const record = await repo.getAuthToken(await hashToken(token), purpose);
  if (!record || record.consumedAt || new Date(record.expiresAt).getTime() <= now.getTime()) {
    throw new Error("invalid or expired token");
  }
  const account = await repo.getAccountById(record.accountId);
  if (!account || account.disabledAt) throw new Error("invalid or expired token");
  await repo.consumeAuthToken(record.id, now);
  return account;
}

async function consumeEmailVerificationTokenOrNull(
  repo: Repository,
  token: string,
  now: Date
): Promise<{ account: AccountRecord; newlyConsumed: boolean } | null> {
  const record = await repo.getAuthToken(await hashToken(token), "email_verification");
  if (!record || new Date(record.expiresAt).getTime() <= now.getTime()) return null;
  const account = await repo.getAccountById(record.accountId);
  if (!account || account.disabledAt) return null;
  if (record.consumedAt) return account.emailVerifiedAt ? { account, newlyConsumed: false } : null;
  await repo.consumeAuthToken(record.id, now);
  return { account, newlyConsumed: true };
}

async function consumeTokenOrNull(
  repo: Repository,
  token: string,
  purpose: "email_verification" | "password_reset",
  now: Date
): Promise<AccountRecord | null> {
  try {
    return await consumeToken(repo, token, purpose, now);
  } catch {
    return null;
  }
}

async function assertUsernameAvailable(repo: Repository, username: string, accountId?: string): Promise<void> {
  const resolved = await repo.resolveUsernameAlias(username);
  if (resolved && resolved.account.id !== accountId) throw new Error("username is already taken");
}

async function assertRateLimit(
  repo: Repository,
  key: string,
  action: string,
  limit: number,
  windowMs: number
): Promise<void> {
  const since = new Date(Date.now() - windowMs).toISOString();
  if ((await repo.countRecentAuthAttempts({ key, action, since })) >= limit) {
    throw new Error("too many attempts");
  }
  await repo.recordAuthAttempt({ key, action });
}

async function manualSummaryRateLimitKey(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  briefingId: string
): Promise<string> {
  const voterId = await getOrCreateVoterId(c);
  if (voterId) return `summary:${briefingId}:voter:${voterId}`;
  const ip = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return `summary:${briefingId}:ip:${ip}`;
}

async function verifyTurnstileIfConfigured(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  token: string | undefined
): Promise<boolean> {
  if (!c.env.TURNSTILE_SECRET_KEY) return true;
  if (!token) return false;
  const body = new FormData();
  body.set("secret", c.env.TURNSTILE_SECRET_KEY);
  body.set("response", token);
  body.set("remoteip", c.req.header("cf-connecting-ip") ?? "");
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body
  });
  const payload = (await response.json()) as { success?: boolean };
  return Boolean(payload.success);
}

async function getOwnedBriefing(
  repo: Repository,
  account: AccountRecord,
  briefingId?: string
): Promise<BriefingConfig | null> {
  if (!briefingId) return repo.ensureDefaultBriefing(account);
  const briefing = await repo.getBriefingById(briefingId);
  if (!briefing || briefing.ownerAccountId !== account.id) return null;
  return briefing;
}

async function retryProcessingJobs(
  repo: Repository,
  queue: { send(message: ProcessingJobMessage): Promise<unknown> },
  briefingId: string
): Promise<number> {
  const queuedStaleBefore = new Date(Date.now() - 5 * 60 * 1000).getTime();
  const retryableJobs = (await repo.listProcessingJobs({
    briefingId,
    states: ["failed", "queued"],
    limit: 50
  })).filter(
    (job) => job.state === "failed" || new Date(job.updatedAt).getTime() <= queuedStaleBefore
  );

  for (const job of retryableJobs) {
    await repo.requeueProcessingJob(job.id);
    await queue.send({
      jobId: job.id,
      briefingId: job.briefingId,
      rawMessageId: job.rawMessageId
    });
  }

  return retryableJobs.length;
}

function repoForContext(c: Context<{ Bindings: Env; Variables: Variables }>): Repository {
  return c.get("repo") ?? new D1Repository(c.env.DB);
}

function isRuntimeAuthorized(c: Context<{ Bindings: Env; Variables: Variables }>): boolean {
  const token = c.env.WEB_OPERATOR_RUNTIME_TOKEN?.trim();
  return Boolean(token) && c.req.header("authorization") === `Bearer ${token}`;
}

function requiredLiveSmokeEnv(env: Env, key: keyof Env): string {
  const value = env[key];
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${String(key)} is required for live public acquisition smoke`);
  return value.trim();
}

function liveSmokeModelCapability(
  model: string,
  provider: string,
  providerRouting:ModelCapability["providerRouting"],
  env: Env
): ModelCapability {
  return {
    modelRef: model,
    provider,
    toolCalling: true,
    vision: true,
    structuredOutput: true,
    reasoningClass: "fast",
    enabled: true,
    inputCostPerMillion: liveSmokeNumber(env.DISTILLED_LIVE_OPENROUTER_INPUT_COST_PER_MILLION, 0),
    outputCostPerMillion: liveSmokeNumber(env.DISTILLED_LIVE_OPENROUTER_OUTPUT_COST_PER_MILLION, 0),
    deployment: "api",
    externallyHosted: true,
    privacyEligibility: ["public"],
    retentionClass: "zero_data_retention",
    providerRouting
  };
}

function liveSmokeProviderRouting(env:Env):ModelCapability["providerRouting"] {
  const mode=env.DISTILLED_LIVE_OPENROUTER_PROVIDER_ROUTING?.trim()||"pinned";
  if (mode==="pinned") return undefined;
  if (mode!=="automatic_latency") {
    throw new Error("DISTILLED_LIVE_OPENROUTER_PROVIDER_ROUTING must be pinned or automatic_latency");
  }
  const raw=requiredLiveSmokeEnv(env,"DISTILLED_LIVE_OPENROUTER_PROVIDER_ENDPOINTS_JSON");
  const endpoints=liveSmokeProviderEndpointsSchema.parse(JSON.parse(raw));
  const normalizedTags=endpoints.map((endpoint)=>endpoint.tag.toLowerCase());
  if (new Set(normalizedTags).size!==normalizedTags.length) {
    throw new Error("DISTILLED_LIVE_OPENROUTER_PROVIDER_ENDPOINTS_JSON contains duplicate provider tags");
  }
  return {mode:"automatic",sort:"latency",allowFallbacks:true,endpoints};
}

function liveSmokeModelRouting(model: string): ModelRoutingConfig {
  return {
    mode: "api",
    apiGateway: "openrouter",
    selfHostedGateway: "openai_compatible",
    roles: {
      NAVIGATION_FAST: { primary: { deployment: "api", model }, fallbacks: [] },
      VISION_FAST: { primary: { deployment: "api", model }, fallbacks: [] }
    }
  };
}

function unavailableDeterministicAcquisition(method: DeterministicAcquisitionPort["method"]): DeterministicAcquisitionPort {
  return {
    method,
    async acquire() {
      return {
        state: "failed",
        failureClass: "source_unavailable",
        transient: false,
        details: { reason: "live smoke does not provide teammate-owned deterministic acquisition adapter" }
      };
    }
  };
}

function webOperatorRouteEvidence(now: Date): AcquisitionFailure[] {
  return [
    {
      method: "deterministic_browser_workflow",
      failureClass: "structural_site_change",
      occurredAt: new Date(now.getTime() - 2_000).toISOString()
    },
    {
      method: "deterministic_browser_workflow",
      failureClass: "extraction_mismatch",
      occurredAt: new Date(now.getTime() - 1_000).toISOString()
    }
  ];
}

function liveSmokeInteger(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`invalid live smoke integer limit: ${value}`);
  return parsed;
}

function liveSmokeNumber(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`invalid live smoke numeric limit: ${value}`);
  return parsed;
}

async function liveSmokeReport(
  db: D1Database,
  outcome: ClosedLoopAcquisitionOutcome,
  configuration: {
    browserBackend: string;
    llmMode: string;
    gateway: string;
    requestedModel: string;
    requestedProvider: string;
    startedAt: string;
  }
) {
  const run = "run" in outcome ? outcome.run : undefined;
  const acquiredContent = "acquiredContent" in outcome ? outcome.acquiredContent : undefined;
  const workflow = "workflow" in outcome ? outcome.workflow : undefined;
  const workflowFinalization = "workflowFinalization" in outcome ? outcome.workflowFinalization : undefined;
  const runId = run?.runId;
  const modelAttempts = runId ? await modelAttemptSummary(db, runId) : [];
  const observationSummary = runId ? await observationProvenanceSummary(db, runId) : { count: 0, latestObservationId: undefined };
  const toolCount = runId ? await countRows(db, "SELECT COUNT(*) AS count FROM agent_tool_calls WHERE run_id=?", runId) : 0;
  const completion = runId ? await latestCompletionOutcome(db, runId) : undefined;
  return {
    status: outcome.state,
    configuration: {
      actualBrowserBackend: configuration.browserBackend,
      actualLlmMode: configuration.llmMode,
      gateway: configuration.gateway,
      requestedModel: configuration.requestedModel,
      requestedProvider: configuration.requestedProvider
    },
    run: run ? { runId: run.runId, state: run.state, generation: run.generation } : undefined,
    workflow: workflow ? { id: workflow.id, state: workflow.state, version: workflow.version } : undefined,
    workflowFinalization,
    acquiredContent: acquiredContent ? {
      acceptanceId: acquiredContent.acceptanceId,
      canonicalUrl: acquiredContent.canonicalUrl,
      finalUrl: acquiredContent.finalUrl,
      contentHash: acquiredContent.contentHash,
      titleLength: acquiredContent.title.length,
      bodyLength: acquiredContent.body.length,
      observationId: acquiredContent.observationId
    } : undefined,
    completionVerifier: completion,
    provenance: observationSummary,
    metrics: {
      modelCalls: outcome.modelCalls,
      physicalModelAttempts: modelAttempts.length,
      inputTokens: modelAttempts.reduce((sum, attempt) => sum + attempt.inputTokens, 0),
      outputTokens: modelAttempts.reduce((sum, attempt) => sum + attempt.outputTokens, 0),
      costUsd: modelAttempts.reduce((sum, attempt) => sum + attempt.costUsd, 0),
      browserActions: toolCount,
      startedAt: configuration.startedAt,
      completedAt: new Date().toISOString()
    },
    modelAttempts
  };
}

async function modelAttemptSummary(db: D1Database, runId: string) {
  const result = await db.prepare(`SELECT a.requested_provider,a.actual_provider,a.requested_model,a.actual_model,
      a.requested_gateway,a.actual_gateway,a.requested_deployment,a.actual_deployment,a.state,
      a.input_tokens,a.output_tokens,a.cost_usd,a.latency_ms
    FROM agent_model_call_attempts a JOIN agent_model_calls c ON c.id=a.model_call_id
    WHERE c.run_id=? ORDER BY c.created_at ASC,a.attempt ASC`).bind(runId).all<Record<string, unknown>>();
  return result.results.map((row) => ({
    requestedProvider: String(row.requested_provider),
    actualProvider: row.actual_provider ? String(row.actual_provider) : undefined,
    requestedModel: String(row.requested_model),
    actualModel: row.actual_model ? String(row.actual_model) : undefined,
    requestedGateway: String(row.requested_gateway),
    actualGateway: row.actual_gateway ? String(row.actual_gateway) : undefined,
    requestedDeployment: String(row.requested_deployment),
    actualDeployment: row.actual_deployment ? String(row.actual_deployment) : undefined,
    state: String(row.state),
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
    costUsd: Number(row.cost_usd),
    latencyMs: Number(row.latency_ms)
  }));
}

async function observationProvenanceSummary(db: D1Database, runId: string) {
  const row = await db.prepare(`SELECT COUNT(*) AS count,
      MAX(json_extract(envelope_json,'$.id')) AS latest_observation_id,
      MAX(json_extract(envelope_json,'$.raw.hash')) AS latest_raw_hash,
      MAX(json_extract(envelope_json,'$.presented.hash')) AS latest_presented_hash
    FROM agent_observations WHERE run_id=?`).bind(runId).first<Record<string, unknown>>();
  return {
    count: Number(row?.count ?? 0),
    latestObservationId: row?.latest_observation_id ? String(row.latest_observation_id) : undefined,
    latestRawHashPresent: Boolean(row?.latest_raw_hash),
    latestPresentedHashPresent: Boolean(row?.latest_presented_hash)
  };
}

async function latestCompletionOutcome(db: D1Database, runId: string) {
  const row = await db.prepare(`SELECT acceptance_json FROM agent_completion_acceptances
    WHERE run_id=? ORDER BY decided_at DESC LIMIT 1`).bind(runId).first<Record<string, unknown>>();
  if (!row?.acceptance_json) return undefined;
  const parsed = JSON.parse(String(row.acceptance_json)) as { outcome?: unknown; deficits?: unknown };
  return {
    outcome: typeof parsed.outcome === "string" ? parsed.outcome : undefined,
    deficits: Array.isArray(parsed.deficits) ? parsed.deficits : []
  };
}

async function countRows(db: D1Database, query: string, value: string): Promise<number> {
  const row = await db.prepare(query).bind(value).first<Record<string, unknown>>();
  return Number(row?.count ?? 0);
}

function publicAccount(account: AccountRecord) {
  return {
    id: account.id,
    email: account.email,
    username: account.username,
    role: account.role,
    emailVerifiedAt: account.emailVerifiedAt,
    disabledAt: account.disabledAt
  };
}

function logAuthEmailFailure(kind: string, account: AccountRecord, env: Env, error: unknown): void {
  const details: Record<string, string | undefined> = {
    accountId: account.id,
    emailDomain: account.email.split("@").at(-1),
    senderDomain: emailDomainFromAddress(env.EMAIL_FROM),
    errorCode: errorProperty(error, "code"),
    error: error instanceof Error ? error.message : String(error)
  };
  for (const key of Object.keys(details)) {
    if (details[key] === undefined) delete details[key];
  }
  console.error(`Could not send ${kind} email`, details);
}

function emailDomainFromAddress(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const address = value.match(/<([^<>]+)>/)?.[1] ?? value;
  return address.trim().split("@").at(-1);
}

function errorProperty(error: unknown, key: string): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function publicBriefing(briefing: BriefingConfig): Omit<BriefingConfig, "interestProfile" | "styleInstruction"> {
  return {
    id: briefing.id,
    ownerAccountId: briefing.ownerAccountId,
    ownerUsername: briefing.ownerUsername,
    slug: briefing.slug,
    title: briefing.title,
    stars: briefing.stars,
    publicFeedEnabled: true,
    paused: briefing.paused,
    language: briefing.language,
    intensity: briefing.intensity,
    briefingCadence: briefing.briefingCadence,
    briefingTimeOfDay: briefing.briefingTimeOfDay,
    briefingTimezone: briefing.briefingTimezone,
    nextBriefingAt: briefing.nextBriefingAt,
    retentionDays: FIXED_RETENTION_DAYS
  };
}

function publicEdition(
  edition: BriefingEdition,
  briefing: Pick<BriefingConfig, "language">,
  includeSections: boolean
): BriefingEdition {
  const sections = publicEditionSections(edition, briefing.language);
  return {
    ...edition,
    summary: editionSummaryForLanguage(edition, briefing.language, sections),
    sections: includeSections ? sections : []
  };
}

function isPublicEditionVisible(edition: BriefingEdition, language: BriefingConfig["language"]): boolean {
  return edition.status === "published" && publicEditionSections(edition, language).length > 0;
}

function publicEditionSections(
  edition: BriefingEdition,
  language: BriefingConfig["language"]
): BriefingEdition["sections"] {
  const sections = edition.sections.map((section) => sanitizeEditionSectionForLanguage(section, language));
  return selectEditionReferenceSections(sections, edition.cadence, language, { strictLanguage: true })
    .map((section) => ({
      ...section,
      title: localizedPublicSectionTitle(section.title, language)
    }));
}

function publicEvidence(
  evidence: BriefingEvidence,
  language: BriefingConfig["language"]
): BriefingEvidence {
  return {
    ...evidence,
    text: sanitizeEvidenceText(evidence.text, language)
  };
}

function editionSummaryForLanguage(
  edition: BriefingEdition,
  language: BriefingConfig["language"],
  sections = publicEditionSections(edition, language)
): string {
  if (sections.length === 0) return synthesizeEditionNarrativeSummary([], edition.cadence, language);
  return synthesizeEditionNarrativeSummary(sections, edition.cadence, language);
}

function localizedPublicSectionTitle(title: string, language: BriefingConfig["language"]): string {
  if (language === "ar") {
    if (/[\u0600-\u06FF]/u.test(title)) return title;
    const normalized = title.trim().toLowerCase();
    if (normalized.includes("economy")) return "اقتصاد";
    if (normalized.includes("infrastructure")) return "بنية تحتية";
    if (normalized.includes("security")) return "أمن";
    if (normalized.includes("no update")) return "لا تحديثات";
    return "تحديث";
  }
  if (language === "fr") {
    const normalized = title.trim().toLowerCase();
    if (normalized.includes("economy")) return "Économie";
    if (normalized.includes("infrastructure")) return "Infrastructures";
    if (normalized.includes("security")) return "Sécurité";
    if (normalized.includes("no update")) return "Aucune mise à jour";
    if (normalized === "update") return "Mise à jour";
    return title || "Mise à jour";
  }
  return title;
}

async function maybeRedirectUsernameRoute(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  repo: Repository
): Promise<Response | null> {
  if (c.req.method !== "GET") return null;
  const path = new URL(c.req.url).pathname;
  const match = path.match(/^\/([^/.][^/]*)\/([^/]+)\/?$/);
  if (!match) return null;
  const [, username, slug] = match;
  const resolved = await repo.resolveUsernameAlias(username);
  if (!resolved || resolved.alias.isCurrent || resolved.account.username === username) return null;
  const briefing = await repo.getBriefingBySlug(resolved.account.id, slug);
  if (!briefing) return null;
  const url = new URL(c.req.url);
  url.pathname = `/${resolved.account.username}/${briefing.slug}/`;
  return c.redirect(url.toString(), 301);
}
