import {
  defaultNextBriefingAt,
  editionSummaryReferencesAreValid,
  searchBriefingEditions,
  sanitizeEditionSectionForLanguage,
  sanitizeEvidenceText,
  sectionSummaryMatchesFeedLanguage,
  selectEditionReferenceSections,
  synthesizeEditionNarrativeSummary,
  HOSTED_LEGAL_VERSIONS,
  personalNewsBriefing,
  type BriefingEvidence,
  type BriefingConfig,
  type BriefingEdition
} from "@distilled/core";
import { Context, Hono, type MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import {
  accountAuth,
  adminAuth,
  clearSessionCookie,
  createSession,
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
import { hostedLlmAccountLimits } from "./ai";
import {
  sendEmailDeliveryTest,
  sendPasswordResetEmail,
  sendRegistrationEmailReceipt,
  sendVerificationEmail
} from "./mailer";
import { runModelReadinessCanary } from "./modelReadiness";
import {
  createPublicEdgeCoordinator,
  type PublicEdgeCache
} from "./publicEdge";
import { D1Repository, QuotaExceededError } from "./repository";
import { runRetentionCleanup } from "./retention";
import { visibleNextBriefingAt } from "./editions";
import { addSourceFromInput, enqueueDueSourceRefreshJobs } from "./sources";
import { suggestSources } from "./sourceSuggestions";
import type {
  AccountRecord,
  AccountQuota,
  AccountRole,
  DistilledQueueMessage,
  Env,
  ExploreBriefingRecord,
  HealthStatus,
  ProcessingJobMessage,
  Repository,
  RuntimeProvider,
  SourceQuota
} from "./types";

type Variables = {
  repo: Repository;
  account?: AccountRecord;
};

type AppEnv = { Bindings: Env; Variables: Variables };

const CANONICAL_HOST = "distilled.news";
const LEGACY_HOSTS = new Set(["lownoise.news", "www.lownoise.news"]);
const MAX_JSON_MUTATION_BODY_BYTES = 64 * 1024;
const RESERVED_USERNAMES = new Set([
  "api",
  "admin",
  "auth",
  "demo",
  "explore",
  "feed",
  "manifest",
  "reset-password",
  "robots",
  "sitemap",
  "status",
  "telegram",
  "verify-email"
]);

export interface AppOptions {
  repository?: Repository;
  edgeCache?: PublicEdgeCache;
  bucket?: {
    put(key: string, value: string, options?: unknown): Promise<unknown>;
    delete(key: string | string[]): Promise<unknown>;
    get?(key: string): Promise<{ text(): Promise<string> } | null>;
  };
  queue?: { send(message: DistilledQueueMessage): Promise<unknown> };
  fetcher?: typeof fetch;
  now?: () => Date;
}

interface PublicFeedSnapshot {
  briefing: ReturnType<typeof publicBriefing>;
  editions: BriefingEdition[];
}

const emailSchema = z.string().trim().email().max(254);
const passwordSchema = z.string().min(8).max(256);
const usernameSchema = z.string().trim().min(1).max(80);
const opaqueTokenSchema = z.string().min(1).max(512);
const identifierSchema = z.string().min(1).max(128);

const authInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  username: usernameSchema.optional(),
  setupToken: opaqueTokenSchema.optional(),
  turnstileToken: z.string().min(1).max(4096).optional(),
  termsAccepted: z.literal(true).optional(),
  termsVersion: z.string().max(32).optional(),
  privacyVersion: z.string().max(32).optional(),
  acceptableUseVersion: z.string().max(32).optional()
});

const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
  turnstileToken: z.string().min(1).max(4096).optional()
});

const tokenInputSchema = z.object({
  token: opaqueTokenSchema
});

const passwordResetRequestSchema = z.object({
  email: emailSchema,
  turnstileToken: z.string().min(1).max(4096).optional()
});

const verificationResendSchema = z.object({
  email: emailSchema,
  turnstileToken: z.string().min(1).max(4096).optional()
});

const passwordResetSchema = z.object({
  token: opaqueTokenSchema,
  password: passwordSchema
});

const accountUpdateSchema = z.object({
  username: usernameSchema.optional(),
  currentPassword: z.string().min(1).max(256).optional(),
  newPassword: passwordSchema.optional()
}).refine((input) => !input.newPassword || Boolean(input.currentPassword), {
  message: "current password is required",
  path: ["currentPassword"]
});

const adminAccountUpdateSchema = z.object({
  username: usernameSchema.optional(),
  role: z.enum(["admin", "user"]).optional(),
  disabled: z.boolean().optional()
});

const adminBriefingUpdateSchema = z.object({
  paused: z.boolean().optional()
});

const FIXED_RETENTION_DAYS = 15;
const FIXED_BRIEFING_TIME_OF_DAY = "00:00";
const HOSTED_MAX_FEEDS = 2;
const HOSTED_MAX_HOURLY_FEEDS = 1;
const HOSTED_MAX_SOURCES_PER_FEED = 5;
const HOSTED_MAX_SOURCES_PER_ACCOUNT = 10;
const HOSTED_MAX_PAID_SOURCES_PER_ACCOUNT = 2;
const HOSTED_MAX_PAID_PROVIDER_ACCOUNTS = 4;
const HOSTED_MAX_GOOGLE_NEWS_SOURCES_PER_ACCOUNT = 1;
const HOSTED_MAX_X_SOURCES_PER_ACCOUNT = 1;
const LEGACY_PAID_COHORT_REVIEW_DIGEST =
  "53cd2818eae085885fc9e37991cdf8babd43ec4e296dc2605c06269a1860c0ae";
const LEGACY_CANARY_ACCOUNTS = [
  ["account_canary_ar_01", "canary-ar-01"],
  ["account_canary_ar_02", "canary-ar-02"],
  ["account_canary_ar_03", "canary-ar-03"],
  ["account_canary_ar_04", "canary-ar-04"],
  ["account_canary_en_01", "canary-en-01"],
  ["account_canary_en_02", "canary-en-02"],
  ["account_canary_en_03", "canary-en-03"],
  ["account_canary_en_04", "canary-en-04"],
  ["account_canary_en_05", "canary-en-05"],
  ["account_canary_fr_01", "canary-fr-01"],
  ["account_canary_fr_02", "canary-fr-02"],
  ["account_canary_fr_03", "canary-fr-03"]
] as const;
const LEGACY_PAID_SOURCE_RETIREMENT_MARKER =
  "retired during reviewed 2026-07-29 hosted paid-provider reconciliation";
const HOSTED_SUGGESTIONS_PER_ACCOUNT_PER_DAY = 5;
const HOSTED_SUGGESTIONS_PER_IP_PER_DAY = 20;
const HOSTED_REGISTRATIONS_PER_IP_PER_DAY = 3;
const HOSTED_REGISTRATIONS_PER_IP_PER_PENDING_LEASE = 2;
const HOSTED_REGISTRATIONS_PER_EMAIL_PER_DAY = 2;
const HOSTED_PENDING_ACCOUNT_LEASE_MS = 60 * 60 * 1000;
const HOSTED_PUBLIC_FEED_MISSES_PER_IP_PER_MINUTE = 120;
const HOSTED_PUBLIC_SEARCH_MISSES_PER_IP_PER_MINUTE = 30;
const DEFAULT_HOSTED_ACCOUNT_CAP = 50;
const DEFAULT_HOSTED_PENDING_ACCOUNT_CAP = 10;
const HOSTED_REFRESH_PER_FEED_WINDOW = 1;
const HOSTED_REFRESH_WINDOW_MS = 15 * 60 * 1000;
const REGISTRATION_EMAIL_RECEIPT_TTL_MS = 15 * 60 * 1000;
const HOSTED_REFRESH_PER_ACCOUNT_PER_DAY = 6;
const DAY_MS = 24 * 60 * 60 * 1000;
const DUMMY_LOGIN_PASSWORD_HASH =
  "pbkdf2-sha256:210000:ZGlzdGlsbGVkLWxvZ2luLWR1bW15LXNhbHQtdjE:logfclf6QUhuxEyLQ8Ap7CtYXgpdZ08No-ohjV4Z74o";

const briefingCadenceSchema = z.preprocess(
  (value) => (value === "monthly" ? "weekly" : value),
  z.enum(["hourly", "daily", "weekly"])
);

const briefingInputSchema = z.object({
  id: identifierSchema.default(() => `briefing_${crypto.randomUUID()}`),
  slug: z.string().trim().min(1).max(80).default("personal"),
  title: z.string().trim().min(1).max(160).default("Personal Briefing"),
  interestProfile: z.string().trim().min(1).max(2_000),
  styleInstruction: z.string().max(2_000).optional(),
  publicFeedEnabled: z.boolean().default(true),
  paused: z.boolean().default(false),
  language: z.enum(["en", "ar", "fr"]).default("en"),
  intensity: z.enum(["low", "medium", "high"]).default("medium"),
  briefingCadence: briefingCadenceSchema.default("hourly"),
  briefingTimeOfDay: z.string().regex(/^\d{1,2}:\d{2}$/).default("00:00"),
  briefingTimezone: z.string().trim().min(1).max(100).default("UTC"),
  retentionDays: z.number().int().min(1).max(90).default(FIXED_RETENTION_DAYS)
});

const sourceInputSchema = z.union([
  z.object({
    briefingId: identifierSchema,
    url: z.string().trim().min(1).max(4_096),
    input: z.string().trim().min(1).max(4_096).optional()
  }),
  z.object({
    briefingId: identifierSchema,
    input: z.string().trim().min(1).max(4_096)
  }),
  z.object({
    briefingId: identifierSchema,
    sourceId: identifierSchema,
    enabled: z.boolean()
  })
]);

const sourceSuggestionSchema = z.object({
  briefingId: identifierSchema,
  interestProfile: z.string().min(3).max(1000),
  language: z.enum(["en", "ar", "fr"])
});

const healthInputSchema = z.object({
  briefingId: identifierSchema.optional()
});

const feedStarInputSchema = z.object({
  starred: z.boolean()
});

const accountDeleteSchema = z.object({
  currentPassword: z.string().min(1).max(256)
});

const legalAcceptanceSchema = z.object({
  termsAccepted: z.literal(true),
  privacyAcknowledged: z.literal(true),
  termsVersion: z.literal(HOSTED_LEGAL_VERSIONS.terms),
  privacyVersion: z.literal(HOSTED_LEGAL_VERSIONS.privacy),
  acceptableUseVersion: z.literal(HOSTED_LEGAL_VERSIONS.acceptableUse)
}).strict();

const providerUpdateSchema = z.object({
  enabled: z.boolean()
});

const runtimeProviderSchema = z.enum([
  "rss",
  "telegram",
  "google_news",
  "x",
  "linkedin",
  "generic_apify",
  "brave"
]);

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
    if (error instanceof RateLimitError) {
      c.header("retry-after", String(error.retryAfterSeconds));
      return c.json({ error: "too many attempts" }, 429);
    }
    console.error(error);
    return c.json({ error: "internal server error" }, 500);
  });

  const repoFor = (c: { env: Env }): Repository => options.repository ?? new D1Repository(c.env.DB);
  const bucketFor = (c: { env: Env }) => options.bucket ?? c.env.RAW_ARCHIVE;
  const processingQueueFor = (c: { env: Env }) => options.queue ?? c.env.PROCESSING_QUEUE;
  const sourceQueueFor = (c: { env: Env }) => options.queue ?? c.env.SOURCE_QUEUE ?? c.env.PROCESSING_QUEUE;
  const fetcher = options.fetcher ?? fetch;
  const nowFor = options.now ?? (() => new Date());
  const publicEdge = options.edgeCache
    ? createPublicEdgeCoordinator(() => options.edgeCache)
    : createPublicEdgeCoordinator();
  const invalidatePublicEdge = async (
    c: Context<{ Bindings: Env; Variables: Variables }>,
    feeds: Array<{ username: string; slug: string }>,
    includeSitemap = false
  ): Promise<void> => {
    const origin = new URL(c.req.url).origin;
    const release = publicReleaseSha(c.env);
    const invalidations = [
      publicEdge.invalidate(new Request(new URL("/api/explore/feeds", origin)), {
        namespace: "explore",
        ttlSeconds: 30,
        release
      }),
      ...feeds.map(({ username, slug }) =>
        publicEdge.invalidate(
          new Request(new URL(
            `/api/feed/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`,
            origin
          )),
          {
            namespace: "feed",
            ttlSeconds: 30,
            release,
            keyParts: [username, slug]
          }
        )
      )
    ];
    if (includeSitemap) {
      const publicOrigin = publicWebOrigin(c.env.PUBLIC_WEB_BASE_URL, c.req.url);
      invalidations.push(publicEdge.invalidate(new Request(new URL("/sitemap.xml", origin)), {
        namespace: "sitemap",
        ttlSeconds: 300,
        release,
        keyParts: [publicOrigin]
      }));
    }
    await Promise.all(invalidations);
  };

  app.use("*", async (c, next) => {
    const url = new URL(c.req.url);
    if (isStagingEnvironment(c.env)) {
      c.header("x-robots-tag", "noindex, nofollow, noarchive");
    }
    if (url.hostname === `www.${CANONICAL_HOST}` || LEGACY_HOSTS.has(url.hostname) || (url.hostname === CANONICAL_HOST && url.protocol === "http:")) {
      url.protocol = "https:";
      url.hostname = CANONICAL_HOST;
      return c.redirect(url.toString(), 301);
    }
    if (isSensitiveProbePath(url.pathname)) return c.text("not found", 404);
    await next();
    c.header("content-security-policy", "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self'; img-src 'self' data: https:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests");
    c.header("cross-origin-opener-policy", "same-origin-allow-popups");
    c.header("cross-origin-resource-policy", "same-origin");
    c.header("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
    c.header("referrer-policy", "strict-origin-when-cross-origin");
    c.header("strict-transport-security", "max-age=31536000; includeSubDomains; preload");
    c.header("x-content-type-options", "nosniff");
    c.header("x-frame-options", "DENY");
    if (isStagingEnvironment(c.env)) {
      c.header("x-robots-tag", "noindex, nofollow, noarchive");
    }
    if (/^\/api\/(?:auth|me|admin|internal)(?:\/|$)/.test(url.pathname)) {
      c.header("cache-control", "no-store");
      c.header("vary", "Cookie");
    }
  });

  app.use("/api/*", async (c, next) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method) &&
      await requestBodyExceedsLimit(c.req.raw, MAX_JSON_MUTATION_BODY_BYTES)) {
      return c.json({ error: "request body is too large" }, 413);
    }
    if (["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method) &&
      !new URL(c.req.url).pathname.startsWith("/api/internal/") &&
      hasSessionCookie(c.req.header("cookie")) &&
      !isSameOriginRequest(c.req.raw)) {
      return c.json({ error: "invalid request origin" }, 403);
    }
    await next();
  });

  app.get("/robots.txt", (c) => c.text(isStagingEnvironment(c.env)
    ? "User-agent: *\nDisallow: /\n"
    : "User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\n", 200, {
    "cache-control": isStagingEnvironment(c.env) ? "no-store" : "public, max-age=86400",
    "content-type": "text/plain; charset=utf-8"
  }));

  app.get("/canary-fixture.xml", async (c) => {
    if (c.env.ENVIRONMENT?.trim().toLowerCase() !== "staging") return c.text("not found", 404);
    const now = nowFor();
    const hour = new Date(now);
    hour.setUTCMinutes(0, 0, 0);
    const source = (c.req.query("source") ?? "default").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "default";
    const rotationHours = parseCanaryFixtureRotationHours(c.req.query("rotating"));
    const rotating = rotationHours !== null;
    if (rotationHours) {
      hour.setUTCHours(Math.floor(hour.getUTCHours() / rotationHours) * rotationHours);
    }
    const fixtureTime = rotating ? hour : parseCanaryFixtureEpoch(c.req.query("epoch"));
    if (!fixtureTime) {
      return c.text("A valid UTC fixture epoch is required for a static staging fixture.", 400);
    }
    const checkpoint = fixtureTime.toISOString();
    const guid = `distilled-staging-${source}${rotating ? `-${fixtureTime.toISOString()}` : "-static"}`;
    const requestUrl = new URL(c.req.url);
    const linkUrl = new URL("/canary-fixture.xml", requestUrl.origin);
    linkUrl.searchParams.set("source", source);
    if (rotationHours) linkUrl.searchParams.set("rotating", String(rotationHours));
    else linkUrl.searchParams.set("epoch", String(fixtureTime.getTime()));
    const link = linkUrl.toString();
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Distilled.news staging canary ${escapeXml(source)}</title>
<link>${escapeXml(link)}</link>
<description>Clearly labelled synthetic staging feed for pipeline capacity validation.</description>
<item>
<guid isPermaLink="false">${escapeXml(guid)}</guid>
<title>Synthetic staging checkpoint distilledcanarycheckpoint ${escapeXml(source)} at ${escapeXml(checkpoint)}</title>
<description>This is synthetic test content, not real news. The distilledcanarycheckpoint marker at ${escapeXml(checkpoint)} for ${escapeXml(source)} validates collection, processing, and publication.</description>
<link>${escapeXml(link)}</link>
<pubDate>${fixtureTime.toUTCString()}</pubDate>
</item>
</channel></rss>`;
    const etag = `"sha256-${await sha256Hex(xml)}"`;
    const headers = {
      "cache-control": "public, max-age=60, must-revalidate",
      etag,
      "content-type": "application/rss+xml; charset=utf-8"
    };
    const ifNoneMatch = c.req.header("if-none-match");
    if (ifNoneMatch?.split(",").some((candidate) => candidate.trim() === etag)) {
      return new Response(null, { status: 304, headers });
    }
    return c.body(xml, 200, headers);
  });

  app.get("/api/status", async (c) => {
    return publicEdge.respond(c.req.raw, {
      namespace: "status",
      ttlSeconds: 15,
      release: publicReleaseSha(c.env)
    }, async () => {
      const repo = repoFor(c);
      const updatedAt = nowFor().toISOString();
      const serviceDefinitions: Array<{ id: "rss" | "telegram" | "google_news" | "x"; label: string }> = [
        { id: "rss", label: "RSS collection" },
        { id: "telegram", label: "Telegram collection" },
        { id: "google_news", label: "Google News collection" },
        { id: "x", label: "X collection" }
      ];
      try {
        const operations = await operationalReadiness(
          repo,
          nowFor(),
          isHostedEnvironment(c.env),
          modelSynthesisConfigured(c.env)
        );
        const services = await Promise.all(serviceDefinitions.map(async ({ id, label }) => {
          if (!(await runtimeProviderEnabledForApp(repo, c.env, id))) {
            return { id, label, status: "disabled" as const };
          }
          const health = await repo.getProviderHealthSummary(id, nowFor());
          if (health.enabledSources === 0) {
            return {
              id,
              label,
              status: "idle" as const,
              message: "Enabled, but no source has exercised this provider yet."
            };
          }
          const degraded = (
            health.freshSources < health.enabledSources ||
            health.degradedSources > 0 ||
            health.backoffSources > 0 ||
            health.recentFailedRuns > health.recentSucceededRuns ||
            health.recentDlq
          );
          return {
            id,
            label,
            status: degraded ? "degraded" as const : "operational" as const,
            message: degraded
              ? `${health.freshSources} of ${health.enabledSources} enabled sources are fresh; collection is recovering.`
              : undefined
          };
        }));
        const degraded = services.some((service) => service.status === "degraded") ||
          !operations.schedulerFresh ||
          operations.failingSubsystems.length > 0 ||
          operations.recentDlqCount > 0 ||
          operations.model.status === "degraded";
        const unverified = services.some((service) => service.status === "idle");
        return c.json({
          status: degraded
            ? "degraded" as const
            : unverified
              ? "unverified" as const
              : "operational" as const,
          updatedAt,
          releaseSha: publicReleaseSha(c.env),
          operations,
          services: [
            {
              id: "public_api" as const,
              label: "Public feeds and Explore",
              status: degraded ? "degraded" as const : "operational" as const,
              message: degraded ? "Some source updates are delayed." : undefined
            },
            ...services,
            {
              id: "model_synthesis" as const,
              label: "AI edition synthesis",
              status: operations.model.status,
              message: operations.model.status === "degraded"
                ? "Edition synthesis has no recent successful result or its latest result failed."
                : undefined
            }
          ]
        });
      } catch {
        return c.json({
          status: "degraded" as const,
          updatedAt,
          releaseSha: publicReleaseSha(c.env),
          services: [
            {
              id: "public_api" as const,
              label: "Public feeds and Explore",
              status: "degraded" as const,
              message: "Public feed freshness may be delayed."
            },
            ...serviceDefinitions.map(({ id, label }) => ({
              id,
              label,
              status: envProviderEnabled(c.env, id) ? "degraded" as const : "disabled" as const
            })),
            {
              id: "model_synthesis" as const,
              label: "AI edition synthesis",
              status: modelSynthesisConfigured(c.env) ? "degraded" as const : "disabled" as const
            }
          ]
        }, 200);
      }
    });
  });

  app.get("/api/capabilities", async (c) => {
    return publicEdge.respond(c.req.raw, {
      namespace: "capabilities",
      ttlSeconds: 15,
      release: publicReleaseSha(c.env)
    }, async () => {
      const repo = repoFor(c);
      const providers = {} as Record<RuntimeProvider, { enabled: boolean; available: boolean }>;
      for (const provider of runtimeProviderSchema.options) {
        const available = !(isHostedEnvironment(c.env) &&
          (provider === "linkedin" || provider === "generic_apify" || provider === "brave"));
        providers[provider] = {
          available,
          enabled: available && await runtimeProviderEnabledForApp(repo, c.env, provider)
        };
      }
      const hosted = isHostedEnvironment(c.env);
      const registration = hosted ? await hostedRegistrationCapacity(repo, c.env) : undefined;
      const claimedPaidProviderAccounts = hosted ? await repo.countPaidProviderSeats() : undefined;
      const paidProviderBeta = claimedPaidProviderAccounts === undefined ? undefined : {
        accountCap: HOSTED_MAX_PAID_PROVIDER_ACCOUNTS,
        claimedAccounts: claimedPaidProviderAccounts,
        remainingAccounts: Math.max(0, HOSTED_MAX_PAID_PROVIDER_ACCOUNTS - claimedPaidProviderAccounts),
        capacityReached: claimedPaidProviderAccounts >= HOSTED_MAX_PAID_PROVIDER_ACCOUNTS
      };
      return c.json({
        hosted,
        registrationMode: hosted
          ? registration?.enabled ? "open" : "closed"
          : c.env.REGISTRATION_MODE?.trim().toLowerCase() === "open" ? "open" : "closed",
        registration,
        paidProviderBeta,
        providers,
        limits: hosted ? {
          feedsPerAccount: HOSTED_MAX_FEEDS,
          hourlyFeedsPerAccount: HOSTED_MAX_HOURLY_FEEDS,
          sourcesPerFeed: HOSTED_MAX_SOURCES_PER_FEED,
          sourcesPerAccount: HOSTED_MAX_SOURCES_PER_ACCOUNT,
          paidSourcesPerAccount: HOSTED_MAX_PAID_SOURCES_PER_ACCOUNT,
          budgets: {
            collection: { dayUsd: 0.25, monthUsd: 5 },
            llm: hostedLlmAccountLimits(c.env)
          }
        } : undefined
      });
    });
  });

  app.get("/api/auth/session", async (c) => {
    const repo = repoFor(c);
    const setupRequired = (await repo.countAdmins()) === 0;
    const claims = await verifySession(getCookie(c, SESSION_COOKIE), c.env.ADMIN_SESSION_SECRET ?? "");
    const account = claims ? await repo.getAccountById(claims.sub) : null;
    const authenticated = Boolean(
      account &&
      !account.disabledAt &&
      account.sessionVersion === claims?.ver
    );
    return c.json({
      authenticated,
      setupRequired,
      account: authenticated ? publicAccount(account!) : undefined,
      legalAcceptance: authenticated
        ? hostedLegalAcceptanceState(account!, c.env)
        : undefined,
      turnstileSiteKey: c.env.TURNSTILE_SITE_KEY
    });
  });

  app.post("/api/auth/setup", async (c) => {
    const repo = repoFor(c);
    const input = authInputSchema.parse(await c.req.json().catch(() => ({})));
    if ((await repo.countAdmins()) > 0) return c.json({ error: "setup is already complete" }, 400);
    if (input.setupToken !== (c.env.ADMIN_SETUP_TOKEN ?? c.env.ADMIN_SESSION_SECRET)) {
      return c.json({ error: "invalid setup token" }, 401);
    }
    if (!c.env.ADMIN_SESSION_SECRET) return c.json({ error: "ADMIN_SESSION_SECRET is not configured" }, 500);

    let account: AccountRecord | null;
    try {
      const email = normalizeEmail(input.email);
      const username = normalizeUsername(input.username ?? "owner");
      assertValidUsername(username);
      await assertUsernameAvailable(repo, username);
      account = await repo.bootstrapAdmin({
        email,
        username,
        passwordHash: await hashPassword(input.password),
        emailVerifiedAt: nowFor().toISOString(),
        briefing: {
          ...personalNewsBriefing,
          ownerAccountId: "bootstrap",
          ownerUsername: username,
          nextBriefingAt: defaultNextBriefingAt({ now: nowFor() })
        }
      }, nowFor());
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "could not create account" }, 409);
    }
    if (!account) return c.json({ error: "setup is already complete" }, 409);
    await repo.setSetting("admin_setup_completed_at", nowFor().toISOString(), nowFor());
    setSessionCookie(c, await createSession(c.env.ADMIN_SESSION_SECRET, account));
    return c.json({ account: publicAccount(account) });
  });

  app.post("/api/auth/register", async (c) => {
    const repo = repoFor(c);
    const input = authInputSchema.parse(await c.req.json().catch(() => ({})));
    const email = normalizeEmail(input.email);
    if (isHostedEnvironment(c.env)) {
      if (
        input.termsAccepted !== true ||
        input.termsVersion !== HOSTED_LEGAL_VERSIONS.terms ||
        input.privacyVersion !== HOSTED_LEGAL_VERSIONS.privacy ||
        input.acceptableUseVersion !== HOSTED_LEGAL_VERSIONS.acceptableUse
      ) {
        return c.json({ error: "current terms and privacy acceptance is required" }, 400);
      }
      let registration = await hostedRegistrationCapacity(repo, c.env);
      if (registration.pendingCapacityReached) {
        await releaseExpiredHostedPendingSlots(repo, nowFor(), registration.pendingAccountCap);
        registration = await hostedRegistrationCapacity(repo, c.env);
      }
      if (!registration.enabled) {
        if (registration.pendingCapacityReached) {
          c.header("retry-after", String(Math.ceil(HOSTED_PENDING_ACCOUNT_LEASE_MS / 1000)));
          return c.json({ error: "registration is temporarily full; retry after pending slots expire" }, 429);
        }
        return c.json({ error: "registration is closed" }, 403);
      }
      await assertRateLimit(
        repo,
        `register-email:${email}`,
        "register_email",
        HOSTED_REGISTRATIONS_PER_EMAIL_PER_DAY,
        DAY_MS
      );
      await assertRateLimit(
        repo,
        `register-ip:${await clientIpRateKey(c, "register")}`,
        "register",
        HOSTED_REGISTRATIONS_PER_IP_PER_DAY,
        DAY_MS
      );
      await assertRateLimit(
        repo,
        `register-pending-lease-ip:${await clientIpRateKey(c, "register_pending_lease")}`,
        "register_pending_lease",
        HOSTED_REGISTRATIONS_PER_IP_PER_PENDING_LEASE,
        HOSTED_PENDING_ACCOUNT_LEASE_MS
      );
    } else {
      await assertRateLimit(repo, `register:${email}`, "register", 5, 60 * 60 * 1000);
      await assertRateLimit(repo, `register-ip:${await clientIpRateKey(c, "register")}`, "register", 20, 60 * 60 * 1000);
    }
    if (!(await verifyTurnstileIfConfigured(c, input.turnstileToken, fetcher))) return c.json({ error: "verification failed" }, 400);

    let account: AccountRecord;
    try {
      account = await createAccountOrError(repo, {
        email,
        username: input.username ?? email.split("@")[0],
        password: input.password,
        role: "user",
        verified: false,
        ...(input.termsAccepted === true ? {
          termsAcceptedAt: nowFor().toISOString(),
          termsVersion: HOSTED_LEGAL_VERSIONS.terms,
          privacyVersion: HOSTED_LEGAL_VERSIONS.privacy,
          acceptableUseVersion: HOSTED_LEGAL_VERSIONS.acceptableUse
        } : {})
      }, isHostedEnvironment(c.env) ? {
        maxAccounts: hostedAccountCap(c.env),
        maxPendingAccounts: hostedPendingAccountCap(c.env)
      } : undefined);
    } catch (error) {
      if (isHostedEnvironment(c.env)) {
        await hashPassword(input.password);
        return c.json({ ok: true });
      }
      return c.json({ error: error instanceof Error ? error.message : "could not create account" }, 409);
    }
    try {
      await sendVerificationToken(repo, c.env, account);
    } catch (error) {
      logAuthEmailFailure("verification", account, c.env, error);
      await repo.deleteAccount(account.id, nowFor(), { retireUsernames: false });
      if (isHostedEnvironment(c.env)) return c.json({ ok: true });
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

  app.post("/api/auth/verification/resend", async (c) => {
    const repo = repoFor(c);
    const input = verificationResendSchema.parse(await c.req.json().catch(() => ({})));
    const email = normalizeEmail(input.email);
    await assertRateLimit(repo, `verify-resend:${email}`, "verification_resend", 3, 60 * 60 * 1000);
    await assertRateLimit(repo, `verify-resend-ip:${await clientIpRateKey(c, "verification_resend")}`, "verification_resend", 15, 60 * 60 * 1000);
    if (!(await verifyTurnstileIfConfigured(c, input.turnstileToken, fetcher))) return c.json({ ok: true });
    const account = await repo.getAccountByEmail(email);
    if (account && !account.emailVerifiedAt && !account.disabledAt) {
      try { await sendVerificationToken(repo, c.env, account); }
      catch (error) { logAuthEmailFailure("verification resend", account, c.env, error); }
    }
    return c.json({ ok: true });
  });

  app.post("/api/auth/login", async (c) => {
    const repo = repoFor(c);
    const input = loginInputSchema.parse(await c.req.json().catch(() => ({})));
    const email = normalizeEmail(input.email);
    await assertRateLimit(repo, `login:${email}`, "login", 10, 15 * 60 * 1000);
    await assertRateLimit(repo, `login-ip:${await clientIpRateKey(c, "login")}`, "login", 50, 15 * 60 * 1000);
    if (!(await verifyTurnstileIfConfigured(c, input.turnstileToken, fetcher))) return c.json({ error: "verification failed" }, 400);
    if (!c.env.ADMIN_SESSION_SECRET) return c.json({ error: "ADMIN_SESSION_SECRET is not configured" }, 500);

    const account = await repo.getAccountByEmail(email);
    const passwordValid = await verifyPassword(
      input.password,
      account && !account.disabledAt ? account.passwordHash : DUMMY_LOGIN_PASSWORD_HASH
    );
    if (!account || account.disabledAt || !passwordValid) {
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
    await assertRateLimit(repo, `forgot-ip:${await clientIpRateKey(c, "password_reset_request")}`, "password_reset_request", 20, 60 * 60 * 1000);
    if (!(await verifyTurnstileIfConfigured(c, input.turnstileToken, fetcher))) return c.json({ ok: true });
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
    await assertRateLimit(
      repo,
      `password-reset-ip:${await clientIpRateKey(c, "password_reset_consume")}`,
      "password_reset_consume",
      5,
      15 * 60 * 1000
    );
    const tokenHash = await hashToken(input.token);
    await assertRateLimit(
      repo,
      `password-reset-token:${tokenHash}`,
      "password_reset_consume_token",
      3,
      60 * 60 * 1000
    );
    const account = await repo.consumePasswordResetToken({
      tokenHash,
      passwordHash: await hashPassword(input.password)
    }, nowFor());
    if (!account) return c.json({ error: "invalid or expired token" }, 400);
    return c.json({ ok: true });
  });

  app.use("/api/me/*", accountAuth(repoFor));
  app.use("/api/me/*", hostedLegalMutationGate());
  app.use("/api/admin/*", adminAuth(repoFor));
  app.use("/api/admin/*", hostedLegalMutationGate());

  app.get("/api/me/account", async (c) => {
    return c.json({ account: publicAccount(c.get("account")!) });
  });

  app.post("/api/me/legal-acceptance", async (c) => {
    if (!isHostedEnvironment(c.env)) {
      return c.json({ error: "hosted legal acceptance is not required" }, 409);
    }
    legalAcceptanceSchema.parse(await c.req.json().catch(() => ({})));
    const repo = c.get("repo");
    const account = c.get("account")!;
    const current = hostedLegalAcceptanceState(account, c.env);
    const accepted = current.required
      ? await repo.acceptLegalTerms({
          accountId: account.id,
          termsVersion: HOSTED_LEGAL_VERSIONS.terms,
          privacyVersion: HOSTED_LEGAL_VERSIONS.privacy,
          acceptableUseVersion: HOSTED_LEGAL_VERSIONS.acceptableUse
        }, nowFor())
      : account;
    return c.json({
      account: publicAccount(accepted),
      legalAcceptance: hostedLegalAcceptanceState(accepted, c.env)
    });
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
    let updated: AccountRecord;
    const previousBriefings = username && username !== account.username
      ? await repo.listBriefings(account.id)
      : [];
    if (previousBriefings.length > 0) {
      await invalidatePublicSnapshots(
        bucketFor(c),
        [
          ...previousBriefings.map((briefing) => publicFeedSnapshotKey(account.username, briefing.slug)),
          exploreSnapshotKey()
        ],
        isHostedEnvironment(c.env)
      );
    }
    try {
      updated = await repo.updateAccount({ id: account.id, username, passwordHash });
    } catch (error) {
      if (error instanceof Error && /username/i.test(error.message)) return c.json({ error: error.message }, 409);
      throw error;
    }
    if (passwordHash && c.env.ADMIN_SESSION_SECRET) {
      setSessionCookie(c, await createSession(c.env.ADMIN_SESSION_SECRET, updated));
    }
    return c.json({ account: publicAccount(updated), briefings: await repo.listBriefings(updated.id) });
  });

  app.get("/api/me/export", async (c) => {
    const repo = c.get("repo");
    const account = c.get("account")!;
    const briefings = await repo.listBriefings(account.id);
    const feeds = [];
    for (const briefing of briefings) {
      feeds.push({
        briefing,
        sources: await repo.listSources(briefing.id),
        editions: await repo.listBriefingEditions(briefing.id, true, nowFor(), 500)
      });
    }
    c.header("content-disposition", `attachment; filename="distilled-${account.username}-export.json"`);
    c.header("cache-control", "no-store");
    return c.json({
      exportedAt: nowFor().toISOString(),
      account: publicAccount(account),
      feeds
    });
  });

  app.delete("/api/me/account", async (c) => {
    const repo = c.get("repo");
    const account = c.get("account")!;
    const input = accountDeleteSchema.parse(await c.req.json().catch(() => ({})));
    const accountWithPassword = await repo.getAccountByEmail(account.email);
    if (!accountWithPassword || !(await verifyPassword(input.currentPassword, accountWithPassword.passwordHash))) {
      return c.json({ error: "invalid current password" }, 401);
    }
    const deletion = await deleteAccountWithPayloads(
      repo,
      bucketFor(c),
      account,
      nowFor(),
      isHostedEnvironment(c.env)
    );
    clearSessionCookie(c);
    return c.json({ ok: true, ...deletion });
  });

  app.get("/api/me/usage", async (c) => {
    const repo = c.get("repo");
    const account = c.get("account")!;
    const usage = await repo.getSpendUsage(account.id, nowFor());
    const llmLimits = hostedLlmAccountLimits(c.env);
    return c.json({
      usage,
      limits: isHostedEnvironment(c.env) ? {
        collection: { dayUsd: 0.25, monthUsd: 5 },
        llm: llmLimits
      } : undefined
    });
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
    const slug = normalizedFeedSlug(input.slug || input.title);
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
          timezone: input.briefingTimezone,
          now: nowFor()
        })
      : existing?.nextBriefingAt;
    if (existing && existing.slug !== slug) {
      await invalidatePublicSnapshots(
        bucketFor(c),
        [
          publicFeedSnapshotKey(account.username, existing.slug),
          publicFeedSnapshotKey(account.username, slug),
          exploreSnapshotKey()
        ],
        isHostedEnvironment(c.env)
      );
    }
    let briefing: BriefingConfig;
    try {
      briefing = await repo.upsertBriefing({
        ...input,
        ownerAccountId: account.id,
        ownerUsername: account.username,
        slug,
        stars: existing?.stars ?? 0,
        publicFeedEnabled: true,
        intensity: input.intensity,
        briefingCadence,
        briefingTimeOfDay,
        nextBriefingAt,
        retentionDays: FIXED_RETENTION_DAYS
      }, nowFor(), isHostedEnvironment(c.env) ? {
        maxFeeds: HOSTED_MAX_FEEDS,
        maxHourlyFeeds: HOSTED_MAX_HOURLY_FEEDS
      } : undefined);
    } catch (error) {
      if (error instanceof QuotaExceededError) return c.json({ error: error.message }, 409);
      throw error;
    }
    await invalidatePublicSnapshots(
      bucketFor(c),
      [
        publicFeedSnapshotKey(account.username, existing?.slug ?? briefing.slug),
        publicFeedSnapshotKey(account.username, briefing.slug),
        exploreSnapshotKey()
      ],
      isHostedEnvironment(c.env)
    );
    await invalidatePublicEdge(
      c,
      Array.from(new Set([existing?.slug, briefing.slug].filter(Boolean) as string[]))
        .map((feedSlug) => ({ username: account.username, slug: feedSlug })),
      true
    );
    return c.json({ briefing });
  });

  app.delete("/api/me/briefings/:briefingId", async (c) => {
    const repo = c.get("repo");
    const account = c.get("account")!;
    const briefings = await repo.listBriefings(account.id);
    if (briefings.length <= 1) return c.json({ error: "keep at least one feed" }, 400);
    const briefing = await getOwnedBriefing(repo, account, c.req.param("briefingId"));
    if (!briefing) return c.json({ error: "briefing not found" }, 404);
    await deleteBriefingWithPayloads(
      repo,
      bucketFor(c),
      account,
      briefing,
      nowFor(),
      isHostedEnvironment(c.env)
    );
    await invalidatePublicEdge(c, [{ username: account.username, slug: briefing.slug }], true);
    return c.json({ briefings: await repo.listBriefings(account.id) });
  });

  app.get("/api/me/sources", async (c) => {
    const repo = c.get("repo");
    const briefing = await getOwnedBriefing(repo, c.get("account")!, c.req.query("briefingId"));
    if (!briefing) return c.json({ error: "briefing not found" }, 404);
    return c.json({ sources: await repo.listSources(briefing.id) });
  });

  app.post("/api/me/source-suggestions", async (c) => {
    const repo = c.get("repo");
    const account = c.get("account")!;
    const input = sourceSuggestionSchema.parse(await c.req.json().catch(() => ({})));
    const briefing = await getOwnedBriefing(repo, account, input.briefingId);
    if (!briefing) return c.json({ error: "briefing not found" }, 404);
    if (isHostedEnvironment(c.env)) {
      await assertRateLimit(
        repo,
        `suggestions-account:${account.id}`,
        "source_suggestion",
        HOSTED_SUGGESTIONS_PER_ACCOUNT_PER_DAY,
        DAY_MS,
        nowFor()
      );
      await assertRateLimit(
        repo,
        `suggestions-ip:${await clientIpRateKey(c, "source_suggestion")}`,
        "source_suggestion",
        HOSTED_SUGGESTIONS_PER_IP_PER_DAY,
        DAY_MS,
        nowFor()
      );
    }
    return c.json(await suggestSources({
      briefing,
      interestProfile: input.interestProfile,
      language: input.language,
      existingSources: await repo.listSources(briefing.id),
      env: c.env,
      fetcher
    }));
  });

  app.post("/api/me/sources", async (c) => {
    const repo = c.get("repo");
    const parsed = sourceInputSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Enter a source URL, source query, or source toggle." }, 400);
    const body = parsed.data;
    const account = c.get("account")!;
    const briefing = await getOwnedBriefing(repo, account, body.briefingId);
    if (!briefing) return c.json({ error: "briefing not found" }, 404);

    if ("url" in body || "input" in body) {
      let result;
      try {
        result = await addSourceFromInput({
          briefing,
          sourceInput: ("input" in body ? body.input : undefined) ?? ("url" in body ? body.url : ""),
          repo,
          bucket: bucketFor(c),
          queue: processingQueueFor(c),
          env: c.env,
          fetcher,
          now: nowFor(),
          sourceQuota: isHostedEnvironment(c.env) ? hostedSourceQuota(account.id) : undefined
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
    const account = c.get("account")!;
    const parsed = healthInputSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "briefing not found" }, 400);
    const briefing = await getOwnedBriefing(repo, account, parsed.data.briefingId);
    if (!briefing) return c.json({ error: "briefing not found" }, 404);
    if (isHostedEnvironment(c.env)) {
      await assertRateLimit(
        repo,
        `refresh-feed:${briefing.id}`,
        "manual_source_refresh",
        HOSTED_REFRESH_PER_FEED_WINDOW,
        HOSTED_REFRESH_WINDOW_MS,
        nowFor()
      );
      await assertRateLimit(
        repo,
        `refresh-account:${account.id}`,
        "manual_source_refresh",
        HOSTED_REFRESH_PER_ACCOUNT_PER_DAY,
        DAY_MS,
        nowFor()
      );
    }
    const queued = await enqueueDueSourceRefreshJobs({
      briefing,
      repo,
      queue: sourceQueueFor(c),
      force: true
    });
    return c.json({
      refreshId: `refresh_${crypto.randomUUID()}`,
      queued,
      status: "queued",
      sources: await repo.listSources(briefing.id),
      health: await repo.getHealth(briefing.id)
    }, 202);
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
    return c.json({
      health: await repo.getHealth(briefing.id),
      recentCollectionRuns: await repo.listSourceRuns({ briefingId: briefing.id, limit: 50 }),
      release: c.env.CF_VERSION_METADATA
    });
  });

  app.post("/api/me/processing/retry", async (c) => {
    const repo = c.get("repo");
    const parsed = healthInputSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "briefing not found" }, 400);
    const briefing = await getOwnedBriefing(repo, c.get("account")!, parsed.data.briefingId);
    if (!briefing) return c.json({ error: "briefing not found" }, 404);
    const retried = await retryProcessingJobs(repo, processingQueueFor(c), briefing.id);
    return c.json({ retried, health: await repo.getHealth(briefing.id) });
  });

  app.get("/api/admin/accounts", async (c) => {
    const repo = c.get("repo");
    return c.json({ accounts: await repo.listAccounts() });
  });

  app.post("/api/admin/email/test", async (c) => {
    const repo = c.get("repo");
    const account = c.get("account")!;
    await assertRateLimit(repo, `email-test:${account.id}`, "email_delivery_test", 3, 60 * 60 * 1000);
    const sentAt = nowFor();
    try {
      await sendEmailDeliveryTest(c.env, account, sentAt);
    } catch (error) {
      await repo.setSetting("email_delivery_last_failure_at", sentAt.toISOString(), sentAt);
      logAuthEmailFailure("admin delivery test", account, c.env, error);
      return c.json({ error: "could not send test email" }, 502);
    }
    await repo.setSetting("email_delivery_last_success_at", sentAt.toISOString(), sentAt);
    return c.json({
      ok: true,
      recipientDomain: account.email.split("@").at(-1),
      sentAt: sentAt.toISOString()
    });
  });

  app.get("/api/admin/email/status", async (c) => {
    const repo = c.get("repo");
    return c.json({
      configured: Boolean(c.env.EMAIL && c.env.EMAIL_FROM),
      senderDomain: emailDomainFromAddress(c.env.EMAIL_FROM),
      lastSuccessAt: (await repo.getSetting("email_delivery_last_success_at")) || undefined,
      lastFailureAt: (await repo.getSetting("email_delivery_last_failure_at")) || undefined
    });
  });

  app.get("/api/admin/readiness", async (c) => {
    const repo = c.get("repo");
    const providers = {} as Record<RuntimeProvider, boolean>;
    for (const provider of runtimeProviderSchema.options) {
      providers[provider] = await runtimeProviderEnabledForApp(repo, c.env, provider);
    }
    const staleSpendReservations = await repo.countStaleSpendReservations(
      new Date(nowFor().getTime() - 2 * 60 * 60 * 1000).toISOString()
    );
    const operations = await operationalReadiness(
      repo,
      nowFor(),
      isHostedEnvironment(c.env),
      modelSynthesisConfigured(c.env)
    );
    const checks = {
      sessionSecret: Boolean(c.env.ADMIN_SESSION_SECRET),
      email: Boolean(c.env.EMAIL && c.env.EMAIL_FROM),
      turnstile: !isHostedEnvironment(c.env) || Boolean(
        c.env.TURNSTILE_SECRET_KEY &&
        c.env.TURNSTILE_SITE_KEY &&
        expectedTurnstileHostnames(c.env).length > 0 &&
        c.env.TURNSTILE_EXPECTED_ACTION?.trim()
      ),
      atLeastOnePublicSourceProvider: providers.rss || providers.telegram,
      noStaleSpendReservations: staleSpendReservations === 0,
      schedulerHeartbeat: operations.schedulerFresh,
      noMaintenanceErrors: operations.failingSubsystems.length === 0,
      noRecentDlq: operations.recentDlqCount === 0,
      modelSynthesis: !isHostedEnvironment(c.env) || operations.model.status === "operational"
    };
    return c.json({
      ready: Object.values(checks).every(Boolean),
      checks,
      providers,
      operations,
      staleSpendReservations,
      releaseSha: publicReleaseSha(c.env)
    });
  });

  app.get("/api/admin/providers", async (c) => {
    const repo = c.get("repo");
    const providers = await Promise.all(runtimeProviderSchema.options.map(async (provider) => ({
      provider,
      enabled: await runtimeProviderEnabledForApp(repo, c.env, provider),
      available: !(isHostedEnvironment(c.env) &&
        (provider === "linkedin" || provider === "generic_apify" || provider === "brave"))
    })));
    return c.json({ providers });
  });

  app.patch("/api/admin/providers/:provider", async (c) => {
    const repo = c.get("repo");
    const provider = runtimeProviderSchema.parse(c.req.param("provider"));
    const input = providerUpdateSchema.parse(await c.req.json().catch(() => ({})));
    if (input.enabled && isHostedEnvironment(c.env) &&
      (provider === "linkedin" || provider === "generic_apify" || provider === "brave")) {
      return c.json({ error: `${provider} is not available on hosted Distilled.news` }, 400);
    }
    if (input.enabled && envProviderEnabled(c.env, provider) === false) {
      return c.json({ error: `${provider} is disabled by deployment configuration` }, 409);
    }
    await repo.setSetting(`provider_enabled:${provider}`, String(input.enabled), nowFor());
    return c.json({
      provider,
      enabled: await runtimeProviderEnabledForApp(repo, c.env, provider)
    });
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
    let account: AccountRecord;
    const affectedBriefings = (username && username !== target.username) || input.disabled !== undefined
      ? await repo.listBriefings(target.id)
      : [];
    if (affectedBriefings.length > 0) {
      await invalidatePublicSnapshots(
        bucketFor(c),
        [
          ...affectedBriefings.map((briefing) => publicFeedSnapshotKey(target.username, briefing.slug)),
          ...(username ? affectedBriefings.map((briefing) => publicFeedSnapshotKey(username, briefing.slug)) : []),
          exploreSnapshotKey()
        ],
        isHostedEnvironment(c.env)
      );
    }
    try {
      account = await repo.updateAccount({
        id: target.id,
        username,
        role: input.role,
        disabled: input.disabled
      });
    } catch (error) {
      if (error instanceof Error && /username/i.test(error.message)) return c.json({ error: error.message }, 409);
      throw error;
    }
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
    await deleteAccountWithPayloads(
      repo,
      bucketFor(c),
      target,
      nowFor(),
      isHostedEnvironment(c.env)
    );
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
    if (input.paused !== undefined) {
      await invalidatePublicSnapshots(
        bucketFor(c),
        [publicFeedSnapshotKey(briefing.ownerUsername, briefing.slug), exploreSnapshotKey()],
        isHostedEnvironment(c.env)
      );
      await invalidatePublicEdge(c, [{
        username: briefing.ownerUsername,
        slug: briefing.slug
      }]);
    }
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
    const account = await repo.getAccountById(briefing.ownerAccountId);
    if (!account) return c.json({ error: "account not found" }, 404);
    await deleteBriefingWithPayloads(
      repo,
      bucketFor(c),
      account,
      briefing,
      nowFor(),
      isHostedEnvironment(c.env)
    );
    await invalidatePublicEdge(c, [{
      username: account.username,
      slug: briefing.slug
    }], true);
    return c.json({ briefings: await repo.listBriefings(), accounts: await repo.listAccounts() });
  });

  app.get("/api/explore/feeds", async (c) => {
    return publicEdge.respond(c.req.raw, {
      namespace: "explore",
      ttlSeconds: 30,
      release: publicReleaseSha(c.env)
    }, async () => {
    const repo = repoFor(c);
    const now = nowFor();
    try {
      const feeds = await repo.listExploreBriefings(10, now);
      const payload = {
        feeds: await Promise.all(feeds.map(async (briefing) => ({
          ...publicBriefing(briefing, now),
          publicHealth: publicFeedHealth(await repo.getHealth(briefing.id, now))
        }))),
        snapshotFallback: false
      };
      await writePublicSnapshot(bucketFor(c), exploreSnapshotKey(), payload);
      return c.json(payload);
    } catch {
      const snapshot = await readPublicSnapshot<{ feeds: unknown[] }>(bucketFor(c), exploreSnapshotKey());
      if (!snapshot) return c.json({ error: "public feeds are temporarily unavailable" }, 503);
      c.header("cache-control", "public, max-age=30, stale-if-error=86400");
      c.header("x-distilled-snapshot", "stale");
      return c.json({ ...snapshot, snapshotFallback: true });
    }
    });
  });

  app.get("/api/feed/:username/:briefingSlug", async (c) => {
    const username = c.req.param("username");
    const briefingSlug = c.req.param("briefingSlug");
    return publicEdge.respond(c.req.raw, {
      namespace: "feed",
      ttlSeconds: 30,
      release: publicReleaseSha(c.env),
      keyParts: [username, briefingSlug]
    }, async () => {
    const snapshotKey = publicFeedSnapshotKey(c.req.param("username"), c.req.param("briefingSlug"));
    try {
      await assertHostedPublicReadBudget(
        c,
        repoFor(c),
        "public_feed",
        HOSTED_PUBLIC_FEED_MISSES_PER_IP_PER_MINUTE
      );
      const resolved = await resolvePublicFeed(c);
      if (resolved instanceof Response) return resolved;
      const { repo, briefing, account } = resolved;
      const viewerAccount = await authenticatedViewerAccount(c, repo);
      const editions = (await repo.listBriefingEditions(briefing.id, true))
        .filter((edition) => isPublicEditionVisible(edition, briefing.language))
        .map((edition) => publicEdition(edition, briefing, true));
      const snapshot: PublicFeedSnapshot = {
        briefing: publicBriefing(briefing, nowFor()),
        editions
      };
      await writePublicSnapshot(
        bucketFor(c),
        publicFeedSnapshotKey(account.username, briefing.slug),
        snapshot
      );
      c.header("cache-control", viewerAccount
        ? "no-store"
        : "public, max-age=30");
      c.header("vary", "Cookie");
      return c.json({
        briefing: snapshot.briefing,
        editions: editions.map((edition) => ({ ...edition, sections: [] })),
        viewerHasStarred: viewerAccount ? await repo.hasBriefingStar(briefing.id, viewerAccount.id) : false,
        viewerCanStar: Boolean(viewerAccount),
        snapshotFallback: false
      });
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      const snapshot = await readPublicSnapshot<PublicFeedSnapshot>(bucketFor(c), snapshotKey);
      if (!snapshot) return c.json({ error: "feed is temporarily unavailable" }, 503);
      c.header("cache-control", "public, max-age=30, stale-if-error=86400");
      c.header("x-distilled-snapshot", "stale");
      return c.json({
        briefing: snapshot.briefing,
        editions: snapshot.editions.map((edition) => ({ ...edition, sections: [] })),
        viewerHasStarred: false,
        viewerCanStar: false,
        snapshotFallback: true
      });
    }
    });
  });

  app.get("/api/feed/:username/:briefingSlug/editions/:editionId", async (c) => {
    return publicEdge.respond(c.req.raw, {
      namespace: "edition",
      ttlSeconds: 30,
      release: publicReleaseSha(c.env),
      keyParts: [
        c.req.param("username"),
        c.req.param("briefingSlug"),
        c.req.param("editionId")
      ]
    }, async () => {
    try {
      await assertHostedPublicReadBudget(
        c,
        repoFor(c),
        "public_edition",
        HOSTED_PUBLIC_FEED_MISSES_PER_IP_PER_MINUTE
      );
      const resolved = await resolvePublicFeed(c);
      if (resolved instanceof Response) return resolved;
      const { repo, briefing } = resolved;
      const edition = await repo.getBriefingEdition(briefing.id, c.req.param("editionId"));
      if (!edition) return c.json({ error: "edition not found" }, 404);
      if (!isPublicEditionVisible(edition, briefing.language)) return c.json({ error: "edition not found" }, 404);
      return c.json({ edition: publicEdition(edition, briefing, true), snapshotFallback: false });
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      const snapshot = await readPublicSnapshot<PublicFeedSnapshot>(
        bucketFor(c),
        publicFeedSnapshotKey(c.req.param("username"), c.req.param("briefingSlug"))
      );
      const edition = snapshot?.editions.find((candidate) => candidate.id === c.req.param("editionId"));
      if (!edition) return c.json({ error: "edition not found" }, 404);
      c.header("x-distilled-snapshot", "stale");
      return c.json({ edition, snapshotFallback: true });
    }
    });
  });

  app.get("/api/feed/:username/:briefingSlug/items/:itemId/evidence", async (c) => {
    return c.json({ error: "not found" }, 404);
  });

  app.get("/api/feed/:username/:briefingSlug/search", async (c) => {
    const query = (c.req.query("q") ?? "").normalize("NFKC").trim().slice(0, 200);
    return publicEdge.respond(c.req.raw, {
      namespace: "search",
      ttlSeconds: 15,
      release: publicReleaseSha(c.env),
      keyParts: [c.req.param("username"), c.req.param("briefingSlug"), query]
    }, async () => {
    try {
      await assertHostedPublicReadBudget(
        c,
        repoFor(c),
        "public_search",
        HOSTED_PUBLIC_SEARCH_MISSES_PER_IP_PER_MINUTE
      );
      const resolved = await resolvePublicFeed(c);
      if (resolved instanceof Response) return resolved;
      const { repo, briefing } = resolved;
      const editions = (await repo.listBriefingEditions(briefing.id, true, nowFor(), 100))
        .filter((edition) => isPublicEditionVisible(edition, briefing.language));
      return c.json({
        editions: searchBriefingEditions(editions, query)
          .map((edition) => publicEdition(edition, briefing, true)),
        snapshotFallback: false
      });
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      const snapshot = await readPublicSnapshot<PublicFeedSnapshot>(
        bucketFor(c),
        publicFeedSnapshotKey(c.req.param("username"), c.req.param("briefingSlug"))
      );
      if (!snapshot) return c.json({ error: "feed search is temporarily unavailable" }, 503);
      c.header("x-distilled-snapshot", "stale");
      return c.json({
        editions: searchBriefingEditions(snapshot.editions, query),
        snapshotFallback: true
      });
    }
    });
  });

  app.post("/api/feed/:username/:briefingSlug/request-summary", async (c) => {
    return c.json({ error: "Hourly briefs publish automatically; manual briefing is retired." }, 410);
  });

  app.post("/api/feed/:username/:briefingSlug/star", async (c) => {
    const resolved = await resolvePublicFeed(c);
    if (resolved instanceof Response) return resolved;
    const { repo, briefing } = resolved;

    const input = feedStarInputSchema.parse(await c.req.json().catch(() => ({})));
    const voter = await authenticatedViewerAccount(c, repo);
    if (!voter) return c.json({ error: "sign in to star feeds" }, 401);
    const legalAcceptance = hostedLegalAcceptanceState(voter, c.env);
    if (legalAcceptance.required) {
      return c.json({
        error: "Review and accept the current Terms, Acceptable Use Policy, and Privacy Notice before making changes.",
        code: "legal_acceptance_required",
        legalAcceptance
      }, 428);
    }

    const stars = await repo.setBriefingStar(briefing.id, voter.id, input.starred);
    await invalidatePublicEdge(c, [{
      username: c.req.param("username"),
      slug: c.req.param("briefingSlug")
    }]);
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
      if (resolved &&
        resolved.alias.isCurrent &&
        !resolved.account.disabledAt &&
        briefing?.publicFeedEnabled) {
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

  app.get("/sitemap.xml", async (c) => {
    const origin = publicWebOrigin(c.env.PUBLIC_WEB_BASE_URL, c.req.url);
    return publicEdge.respond(c.req.raw, {
      namespace: "sitemap",
      ttlSeconds: 300,
      release: publicReleaseSha(c.env),
      keyParts: [origin]
    }, async () => {
      const feeds = await repoFor(c).listExploreBriefings(500, nowFor());
      const urls = [
        `${origin}/`,
        `${origin}/status`,
        ...feeds.map((feed) =>
          `${origin}/${encodeURIComponent(feed.ownerUsername)}/${encodeURIComponent(feed.slug)}/`
        )
      ];
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
        urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join("\n")
      }\n</urlset>\n`;
      return c.body(xml, 200, {
        "content-type": "application/xml; charset=utf-8"
      });
    });
  });

  app.post("/api/internal/retention/run", async (c) => {
    const secret = c.env.INTERNAL_MAINTENANCE_SECRET?.trim();
    const provided = c.req.header("x-distilled-internal")?.trim();
    if (!secret || !provided || provided !== secret) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const repo = repoFor(c);
    const requestedLimit = Number(c.req.query("limit") ?? 1_000);
    const result = await runRetentionCleanup(
      repo,
      bucketFor(c),
      new Date(),
      Number.isSafeInteger(requestedLimit) ? requestedLimit : 1_000
    );
    return c.json(result, result.archiveDeleteFailures > 0 ? 503 : 200);
  });

  app.post("/api/internal/legacy-canary-cleanup", async (c) => {
    const secret = c.env.INTERNAL_MAINTENANCE_SECRET?.trim();
    const provided = c.req.header("x-distilled-internal")?.trim();
    if (!secret || !provided || provided !== secret) {
      return c.json({ error: "unauthorized" }, 401);
    }
    if (
      c.env.ENVIRONMENT !== "production" ||
      c.env.REGISTRATION_MODE?.trim().toLowerCase() !== "closed"
    ) {
      return c.json({ error: "legacy canary cleanup requires closed production" }, 409);
    }
    const input = z.object({
      reviewDigest: z.literal(LEGACY_PAID_COHORT_REVIEW_DIGEST),
      releaseSha: z.string().regex(/^[a-f0-9]{40,64}$/i)
    }).strict().parse(await c.req.json().catch(() => ({})));
    if (publicReleaseSha(c.env) !== input.releaseSha) {
      return c.json({ error: "release mismatch" }, 409);
    }

    const repo = repoFor(c);
    const expectedById = new Map<string, string>(LEGACY_CANARY_ACCOUNTS);
    const presentCanaries = (await repo.listAccounts()).filter((account) =>
      account.username.startsWith("canary-")
    );
    if (presentCanaries.some((account) => expectedById.get(account.id) !== account.username)) {
      return c.json({ error: "unreviewed production canary account exists" }, 409);
    }

    let deletedAccounts = 0;
    let alreadyDeletedAccounts = 0;
    let deletedPayloads = 0;
    let sharedPayloadsRetained = 0;
    let deletionManifests = 0;
    for (const [accountId, username] of LEGACY_CANARY_ACCOUNTS) {
      const account = await repo.getAccountById(accountId);
      if (!account) {
        alreadyDeletedAccounts += 1;
        continue;
      }
      if (account.username !== username || account.role !== "user") {
        return c.json({ error: "legacy canary identity does not match review" }, 409);
      }
      const briefings = await repo.listBriefings(account.id);
      if (briefings.some((briefing) => !briefing.paused)) {
        return c.json({ error: "legacy canary feed is not paused" }, 409);
      }
      for (const briefing of briefings) {
        const sources = await repo.listSources(briefing.id);
        if (
          sources.some((source) =>
            source.kind === "google_news" ||
            source.kind === "x_profile" ||
            source.kind === "x_search"
          ) ||
          sources.some((source) =>
            source.kind === "apify_actor" &&
            (source.enabled || source.lastError !== LEGACY_PAID_SOURCE_RETIREMENT_MARKER)
          )
        ) {
          return c.json({ error: "legacy canary sources are not safely retired" }, 409);
        }
      }
      const deletion = await deleteAccountWithPayloads(
        repo,
        bucketFor(c),
        account,
        nowFor(),
        true
      );
      deletedAccounts += 1;
      deletedPayloads += deletion.deletedPayloadCount;
      sharedPayloadsRetained += deletion.sharedPayloadCountRetained;
      if (deletion.deletionManifestKey) deletionManifests += 1;
    }
    const remaining = (await repo.listAccounts()).filter((account) =>
      account.username.startsWith("canary-")
    );
    if (remaining.length !== 0) {
      return c.json({ error: "legacy canary cleanup is incomplete" }, 503);
    }
    await repo.setSetting(
      "legacy_canary_cleanup_completed",
      `${input.reviewDigest}:${input.releaseSha}`,
      nowFor()
    );
    return c.json({
      ok: true,
      reviewedAccounts: LEGACY_CANARY_ACCOUNTS.length,
      deletedAccounts,
      alreadyDeletedAccounts,
      deletedPayloads,
      sharedPayloadsRetained,
      deletionManifests
    });
  });

  app.post("/api/internal/registration", async (c) => {
    const secret = c.env.INTERNAL_MAINTENANCE_SECRET?.trim();
    const provided = c.req.header("x-distilled-internal")?.trim();
    if (!secret || !provided || provided !== secret) {
      return c.json({ error: "unauthorized" }, 401);
    }
    if (!isHostedEnvironment(c.env)) {
      return c.json({ error: "hosted registration controls are unavailable" }, 409);
    }
    const input = z.object({ enabled: z.boolean() }).parse(await c.req.json().catch(() => ({})));
    const repo = repoFor(c);
    await repo.setSetting("registration_enabled", input.enabled ? "true" : "false", nowFor());
    return c.json(await hostedRegistrationCapacity(repo, c.env));
  });

  app.post("/api/internal/registration/preflight", async (c) => {
    const secret = c.env.INTERNAL_MAINTENANCE_SECRET?.trim();
    const provided = c.req.header("x-distilled-internal")?.trim();
    if (!secret || !provided || provided !== secret) {
      return c.json({ error: "unauthorized" }, 401);
    }
    if (!isHostedEnvironment(c.env)) {
      return c.json({ error: "hosted registration controls are unavailable" }, 409);
    }
    const repo = repoFor(c);
    const now = nowFor();
    const allowed = await repo.consumeRateLimit({
      key: "internal:registration-preflight",
      action: "registration_preflight",
      since: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
      limit: 3
    }, now);
    if (!allowed) return c.json({ error: "too many attempts" }, 429);
    const input = z.object({ sendEmailReceipt: z.boolean().default(false) }).strict()
      .parse(await c.req.json().catch(() => ({})));
    const modelTest = await runModelReadinessCanary({
      env: c.env,
      repo,
      now,
      fetcher
    });
    const [registration, operations, staleSpendReservations] = await Promise.all([
      hostedRegistrationCapacity(repo, c.env),
      operationalReadiness(repo, now, true, modelSynthesisConfigured(c.env)),
      repo.countStaleSpendReservations(new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString())
    ]);
    const providers = {} as Record<RuntimeProvider, boolean>;
    for (const provider of runtimeProviderSchema.options) {
      providers[provider] = await runtimeProviderEnabledForApp(repo, c.env, provider);
    }
    const recipientParse = emailSchema.safeParse(c.env.EMAIL_CANARY_RECIPIENT);
    const normalizedRecipient = recipientParse.success ? normalizeEmail(recipientParse.data) : null;
    const recipientFingerprint = normalizedRecipient ? await sha256Hex(normalizedRecipient) : null;
    const receiptReleaseSha = publicReleaseSha(c.env);
    let emailReceipt: {
      requested: boolean;
      sent: boolean;
      acceptedAt: string | null;
      recipientFingerprint: string | null;
      receiptExpiresAt: string | null;
    } = {
      requested: input.sendEmailReceipt,
      sent: false,
      acceptedAt: null,
      recipientFingerprint,
      receiptExpiresAt: null
    };
    if (input.sendEmailReceipt) {
      if (!normalizedRecipient || !c.env.EMAIL || !c.env.EMAIL_FROM || !receiptReleaseSha) {
        await repo.setSetting("registration_preflight_email_last_failure_at", now.toISOString(), now);
        await safeRecordAppOperationalEvent(repo, {
          category: "maintenance",
          subsystem: "registration_email_canary",
          status: "failed",
          releaseSha: publicReleaseSha(c.env),
          detail: "configuration_missing"
        }, now);
      } else {
        try {
          const nonce = randomToken(24);
          const nonceHash = await sha256Hex(nonce);
          const receiptExpiresAt = new Date(
            now.getTime() + REGISTRATION_EMAIL_RECEIPT_TTL_MS
          ).toISOString();
          await sendRegistrationEmailReceipt(c.env, normalizedRecipient, {
            nonce,
            release: receiptReleaseSha,
            sentAt: now,
            expiresAt: receiptExpiresAt
          });
          await repo.saveRegistrationEmailReceipt({
            nonceHash,
            releaseSha: receiptReleaseSha,
            recipientFingerprint: recipientFingerprint!,
            expiresAt: receiptExpiresAt
          }, now);
          emailReceipt = {
            requested: true,
            sent: true,
            acceptedAt: now.toISOString(),
            recipientFingerprint,
            receiptExpiresAt
          };
          await repo.setSetting("registration_preflight_email_last_success_at", now.toISOString(), now);
          await safeRecordAppOperationalEvent(repo, {
            category: "maintenance",
            subsystem: "registration_email_canary",
            status: "succeeded",
            releaseSha: publicReleaseSha(c.env),
            detail: "accepted"
          }, now);
        } catch {
          await repo.setSetting("registration_preflight_email_last_failure_at", now.toISOString(), now);
          await safeRecordAppOperationalEvent(repo, {
            category: "maintenance",
            subsystem: "registration_email_canary",
            status: "failed",
            releaseSha: publicReleaseSha(c.env),
            detail: "delivery_rejected"
          }, now);
        }
      }
    }
    await repo.setSetting("registration_preflight_last_run_at", now.toISOString(), now);
    const checks = {
      sessionSecret: Boolean(c.env.ADMIN_SESSION_SECRET),
      email: Boolean(c.env.EMAIL && c.env.EMAIL_FROM && normalizedRecipient),
      turnstile: Boolean(
        c.env.TURNSTILE_SECRET_KEY &&
        c.env.TURNSTILE_SITE_KEY &&
        expectedTurnstileHostnames(c.env).length > 0 &&
        c.env.TURNSTILE_EXPECTED_ACTION?.trim()
      ),
      sourceProvider: providers.rss || providers.telegram,
      schedulerHeartbeat: operations.schedulerFresh,
      noMaintenanceErrors: operations.failingSubsystems.length === 0,
      noRecentDlq: operations.recentDlqCount === 0,
      modelSynthesis: modelTest.succeeded && operations.model.status === "operational",
      noStaleSpendReservations: staleSpendReservations === 0,
      capacityAvailable: !registration.capacityReached && !registration.pendingCapacityReached,
      emailReceipt: !input.sendEmailReceipt || emailReceipt.sent
    };
    return c.json({
      ready: Object.values(checks).every(Boolean),
      releaseSha: publicReleaseSha(c.env),
      checks,
      registration,
      providers,
      operations,
      staleSpendReservations,
      emailReceipt,
      modelTest
    });
  });

  app.post("/api/internal/registration/email-receipt", async (c) => {
    const secret = c.env.INTERNAL_MAINTENANCE_SECRET?.trim();
    const provided = c.req.header("x-distilled-internal")?.trim();
    if (!secret || !provided || provided !== secret) {
      return c.json({ error: "unauthorized" }, 401);
    }
    if (!isHostedEnvironment(c.env)) {
      return c.json({ error: "hosted registration controls are unavailable" }, 409);
    }
    const input = z.object({
      nonce: z.string().min(24).max(128).regex(/^[A-Za-z0-9_-]+$/)
    }).strict().parse(await c.req.json().catch(() => ({})));
    const recipientParse = emailSchema.safeParse(c.env.EMAIL_CANARY_RECIPIENT);
    if (!recipientParse.success) {
      return c.json({ error: "email receipt configuration is unavailable" }, 503);
    }
    const releaseSha = publicReleaseSha(c.env);
    if (!releaseSha) {
      return c.json({ error: "email receipt release identity is unavailable" }, 503);
    }
    const recipientFingerprint = await sha256Hex(normalizeEmail(recipientParse.data));
    const consumed = await repoFor(c).consumeRegistrationEmailReceipt({
      nonceHash: await sha256Hex(input.nonce),
      releaseSha,
      recipientFingerprint
    }, nowFor());
    if (!consumed) {
      return c.json({ error: "invalid, expired, or already-used email receipt" }, 409);
    }
    return c.json({ consumed: true });
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
      if (hasFileExtension) return assetResponse;
      if (!accept.includes("text/html") && accept !== "*/*" && accept !== "") return assetResponse;

      const publicRoute = await resolvePublicHtmlRoute(repoFor(c), requestPath);
      const knownSpaRoute = isKnownSpaRoute(requestPath);

      const indexUrl = new URL(c.req.url);
      indexUrl.pathname = "/";
      indexUrl.search = "";
      const indexResponse = await c.env.ASSETS.fetch(new Request(indexUrl, c.req.raw));
      if (!indexResponse.ok) return indexResponse;
      const html = await indexResponse.text();
      const rendered = publicRoute
        ? injectPublicFeedMetadata(
            html,
            publicRoute,
            publicWebOrigin(c.env.PUBLIC_WEB_BASE_URL, c.req.url)
          )
        : html;
      return new Response(rendered, {
        status: publicRoute || knownSpaRoute ? 200 : 404,
        headers: indexResponse.headers
      });
    }
    const requestPath = new URL(c.req.url).pathname;
    const publicRoute = await resolvePublicHtmlRoute(repoFor(c), requestPath);
    if (!publicRoute && !isKnownSpaRoute(requestPath)) return c.text("not found", 404);
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
    if (!briefing || !briefing.publicFeedEnabled) return c.json({ error: "feed not found" }, 404);
    return { repo, account: resolved.account, briefing };
  }

  return app;
}

function isSensitiveProbePath(pathname: string): boolean {
  const normalized = pathname.toLowerCase();
  return /(?:^|\/)\.(?:env|git|svn|hg)(?:\/|$)/.test(normalized) ||
    /(?:^|\/)(?:wp-admin|wp-content|wp-includes|wordpress|phpmyadmin)(?:\/|$)/.test(normalized) ||
    /(?:^|\/)(?:xmlrpc\.php|wp-login\.php)$/.test(normalized);
}

async function createAccountOrError(
  repo: Repository,
  input: {
    email: string;
    username: string;
    password: string;
    role: AccountRole;
    verified: boolean;
    termsAcceptedAt?: string;
    termsVersion?: string;
    privacyVersion?: string;
    acceptableUseVersion?: string;
  },
  quota?: AccountQuota
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
    emailVerifiedAt: input.verified ? new Date().toISOString() : undefined,
    termsAcceptedAt: input.termsAcceptedAt,
    termsVersion: input.termsVersion,
    privacyVersion: input.privacyVersion,
    acceptableUseVersion: input.acceptableUseVersion
  }, new Date(), quota);
}

async function sendVerificationToken(repo: Repository, env: Env, account: AccountRecord): Promise<void> {
  const token = randomToken();
  const expiresAt = new Date(
    Date.now() + (isHostedEnvironment(env) ? HOSTED_PENDING_ACCOUNT_LEASE_MS : DAY_MS)
  ).toISOString();
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
  if (!(await repo.consumeAuthToken(record.id, now))) throw new Error("invalid or expired token");
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
  if (!(await repo.consumeAuthToken(record.id, now))) return null;
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
  assertValidUsername(username);
  if (await repo.isUsernameRetired(username)) {
    throw new Error("username is permanently unavailable");
  }
  const resolved = await repo.resolveUsernameAlias(username);
  if (resolved && resolved.account.id !== accountId) throw new Error("username is already taken");
}

async function assertRateLimit(
  repo: Repository,
  key: string,
  action: string,
  limit: number,
  windowMs: number,
  now = new Date()
): Promise<void> {
  const since = new Date(now.getTime() - windowMs).toISOString();
  if (!(await repo.consumeRateLimit({ key, action, since, limit }, now))) {
    throw new RateLimitError(Math.ceil(windowMs / 1000));
  }
}

async function assertHostedPublicReadBudget(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  repo: Repository,
  action: "public_feed" | "public_edition" | "public_search",
  limit: number
): Promise<void> {
  if (!isHostedEnvironment(c.env)) return;
  await assertRateLimit(
    repo,
    `${action}-ip:${await clientIpRateKey(c, action)}`,
    action,
    limit,
    60 * 1000
  );
}

class RateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("too many attempts");
  }
}

async function verifyTurnstileIfConfigured(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  token: string | undefined,
  fetcher: typeof fetch = fetch
): Promise<boolean> {
  const hosted = isHostedEnvironment(c.env);
  if (!c.env.TURNSTILE_SECRET_KEY) return !hosted;
  if (!token) return false;
  const expectedHostnames = expectedTurnstileHostnames(c.env);
  const expectedAction = c.env.TURNSTILE_EXPECTED_ACTION?.trim();
  if (hosted && (expectedHostnames.length === 0 || !expectedAction)) return false;
  const body = new FormData();
  body.set("secret", c.env.TURNSTILE_SECRET_KEY);
  body.set("response", token);
  body.set("remoteip", c.req.header("cf-connecting-ip") ?? "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: controller.signal });
    if (!response.ok) return false;
    const payload = (await response.json()) as { success?: boolean; hostname?: string; action?: string };
    if (!payload.success) return false;
    if (expectedHostnames.length > 0 &&
      (!payload.hostname || !expectedHostnames.includes(payload.hostname.trim().toLowerCase()))) return false;
    if (expectedAction && payload.action !== expectedAction) return false;
    return true;
  } catch { return false; }
  finally { clearTimeout(timeout); }
}

async function clientIpRateKey(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  purpose: string
): Promise<string> {
  const ip = c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const secret = c.env.ADMIN_SESSION_SECRET?.trim();
  if (!secret) return "unavailable";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`rate-limit:${purpose}:${ip}`)
  );
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
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
  const failedRecentSince = new Date(Date.now() - 24 * 60 * 60 * 1000).getTime();
  const now = Date.now();
  const retryableJobs = (await repo.listProcessingJobs({
    briefingId,
    states: ["failed", "queued"],
    limit: 50
  })).filter(
    (job) =>
      (job.state === "failed" && new Date(job.updatedAt).getTime() >= failedRecentSince) ||
      (job.state === "queued" &&
        new Date(job.updatedAt).getTime() <= queuedStaleBefore &&
        (!job.leaseUntil || new Date(job.leaseUntil).getTime() <= now))
  );

  for (const job of retryableJobs) {
    await repo.requeueProcessingJob(job.id);
    await queue.send({
      jobId: job.id,
      briefingId: job.briefingId,
      rawMessageId: job.rawMessageId
    });
    await repo.markProcessingJobEnqueued(job.id);
  }

  return retryableJobs.length;
}

function repoForContext(c: Context<{ Bindings: Env; Variables: Variables }>): Repository {
  return c.get("repo") ?? new D1Repository(c.env.DB);
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
    errorCode: safeErrorIdentifier(errorProperty(error, "code")),
    errorClass: safeErrorIdentifier(error instanceof Error ? error.name : undefined)
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

function safeErrorIdentifier(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/.test(normalized)
    ? normalized
    : undefined;
}

function publicBriefing(
  briefing: BriefingConfig | ExploreBriefingRecord,
  now = new Date()
): Omit<BriefingConfig, "interestProfile" | "styleInstruction"> & { latestPublishedAt?: string } {
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
    nextBriefingAt: visibleNextBriefingAt(briefing, now),
    retentionDays: FIXED_RETENTION_DAYS,
    latestPublishedAt: "latestPublishedAt" in briefing ? briefing.latestPublishedAt : undefined
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
  return edition.status === "published" &&
    publicEditionSections(edition, language).length > 0;
}

function publicEditionSections(
  edition: BriefingEdition,
  language: BriefingConfig["language"]
): BriefingEdition["sections"] {
  const sections = edition.sections.map((section) => sanitizeEditionSectionForLanguage(section, language));
  return selectEditionReferenceSections(sections, edition.cadence, language, { strictLanguage: true })
    .map((section) => ({
      ...section,
      title: localizedPublicSectionTitle(section.title, language),
      evidence: section.evidence.map((entry) => publicEvidence(entry, language))
    }));
}

function publicEvidence(
  evidence: BriefingEvidence,
  language: BriefingConfig["language"]
): BriefingEvidence {
  return {
    ...evidence,
    text: sanitizeEvidenceText(evidence.text, language),
    sourceUrl: safeOutboundPublicUrl(evidence.sourceUrl),
    links: evidence.links.flatMap((link) => {
      const safe = safeOutboundPublicUrl(link);
      return safe ? [safe] : [];
    }).slice(0, 8),
    media: evidence.media.flatMap((entry) => {
      const safe = safeOutboundPublicUrl(entry.url);
      return safe ? [{ ...entry, url: safe }] : [];
    }).slice(0, 8)
  };
}

function editionSummaryForLanguage(
  edition: BriefingEdition,
  language: BriefingConfig["language"],
  sections = publicEditionSections(edition, language)
): string {
  if (edition.status === "empty") {
    return synthesizeEditionNarrativeSummary([], edition.cadence, language);
  }
  if (sections.length === 0) return synthesizeEditionNarrativeSummary([], edition.cadence, language);
  const savedSummary = sanitizeEvidenceText(edition.summary, language);
  if (
    sections.length === edition.sections.length &&
    sectionSummaryMatchesFeedLanguage(savedSummary, language) &&
    editionSummaryReferencesAreValid(savedSummary, sections.length)
  ) {
    return savedSummary;
  }
  const topSections = sections.filter((section) => section.tier === "top");
  return synthesizeEditionNarrativeSummary(
    topSections.length > 0 ? topSections : sections.slice(0, 3),
    edition.cadence,
    language
  );
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
  if (!briefing || !briefing.publicFeedEnabled) return null;
  const url = new URL(c.req.url);
  url.pathname = `/${resolved.account.username}/${briefing.slug}/`;
  return c.redirect(url.toString(), 301);
}

function isHostedEnvironment(env: Partial<Env>): boolean {
  const environment = env.ENVIRONMENT?.trim().toLowerCase();
  return environment === "production" || environment === "staging";
}

function hostedLegalMutationGate(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!isHostedEnvironment(c.env) || !["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method)) {
      await next();
      return;
    }
    const pathname = new URL(c.req.url).pathname;
    if (
      (c.req.method === "POST" && pathname === "/api/me/legal-acceptance") ||
      (c.req.method === "DELETE" && pathname === "/api/me/account")
    ) {
      await next();
      return;
    }
    const legalAcceptance = hostedLegalAcceptanceState(c.get("account")!, c.env);
    if (legalAcceptance.required) {
      return c.json({
        error: "Review and accept the current Terms, Acceptable Use Policy, and Privacy Notice before making changes.",
        code: "legal_acceptance_required",
        legalAcceptance
      }, 428);
    }
    await next();
  };
}

function hostedLegalAcceptanceState(account: AccountRecord, env: Partial<Env>) {
  const hosted = isHostedEnvironment(env);
  const acceptedAt = account.termsAcceptedAt;
  const validAcceptedAt = Boolean(acceptedAt && Number.isFinite(Date.parse(acceptedAt)));
  const required = hosted && (
    !validAcceptedAt ||
    account.termsVersion !== HOSTED_LEGAL_VERSIONS.terms ||
    account.privacyVersion !== HOSTED_LEGAL_VERSIONS.privacy ||
    account.acceptableUseVersion !== HOSTED_LEGAL_VERSIONS.acceptableUse
  );
  return {
    required,
    currentTermsVersion: HOSTED_LEGAL_VERSIONS.terms,
    currentPrivacyVersion: HOSTED_LEGAL_VERSIONS.privacy,
    currentAcceptableUseVersion: HOSTED_LEGAL_VERSIONS.acceptableUse,
    acceptedAt: !required && validAcceptedAt ? acceptedAt : undefined
  };
}

function isStagingEnvironment(env: Partial<Env>): boolean {
  return env.ENVIRONMENT?.trim().toLowerCase() === "staging";
}

function publicWebOrigin(configuredBaseUrl: string | undefined, requestUrl: string): string {
  const fallback = new URL(requestUrl).origin;
  if (!configuredBaseUrl?.trim()) return fallback;
  try {
    const configured = new URL(configuredBaseUrl);
    if (!["http:", "https:"].includes(configured.protocol) ||
      configured.username ||
      configured.password ||
      configured.origin === "null") {
      return fallback;
    }
    return configured.origin;
  } catch {
    return fallback;
  }
}

function hostedAccountCap(env: Partial<Env>): number {
  const parsed = Number(env.HOSTED_ACCOUNT_CAP);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 100_000
    ? parsed
    : DEFAULT_HOSTED_ACCOUNT_CAP;
}

function hostedPendingAccountCap(env: Partial<Env>): number {
  const parsed = Number(env.HOSTED_PENDING_ACCOUNT_CAP);
  const accountCap = hostedAccountCap(env);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? Math.min(parsed, accountCap)
    : Math.min(DEFAULT_HOSTED_PENDING_ACCOUNT_CAP, accountCap);
}

async function hostedRegistrationCapacity(repo: Repository, env: Partial<Env>): Promise<{
  enabled: boolean;
  accountCap: number;
  remaining: number;
  capacityReached: boolean;
  pendingAccountCap: number;
  pendingRemaining: number;
  pendingCapacityReached: boolean;
  pendingLeaseMinutes: number;
}> {
  const accountCap = hostedAccountCap(env);
  const pendingAccountCap = hostedPendingAccountCap(env);
  const [accountCount, pendingAccountCount] = await Promise.all([
    repo.countAccounts(),
    repo.countPendingAccounts()
  ]);
  const remaining = Math.max(0, accountCap - accountCount);
  const pendingRemaining = Math.max(0, pendingAccountCap - pendingAccountCount);
  const operatorEnabled = booleanValue(
    await repo.getSetting("registration_enabled") ?? undefined
  ) === true;
  const envEnabled = env.REGISTRATION_MODE?.trim().toLowerCase() === "open";
  return {
    enabled: envEnabled && operatorEnabled && remaining > 0 && pendingRemaining > 0,
    accountCap,
    remaining,
    capacityReached: remaining === 0,
    pendingAccountCap,
    pendingRemaining,
    pendingCapacityReached: pendingRemaining === 0,
    pendingLeaseMinutes: Math.ceil(HOSTED_PENDING_ACCOUNT_LEASE_MS / (60 * 1000))
  };
}

async function releaseExpiredHostedPendingSlots(
  repo: Repository,
  now: Date,
  pendingAccountCap: number
): Promise<number> {
  const cutoff = new Date(now.getTime() - HOSTED_PENDING_ACCOUNT_LEASE_MS).toISOString();
  return repo.deleteStaleUnverifiedAccounts(
    cutoff,
    now.toISOString(),
    cutoff,
    Math.max(1, pendingAccountCap)
  );
}

function hostedSourceQuota(accountId: string): SourceQuota {
  return {
    accountId,
    maxPerFeed: HOSTED_MAX_SOURCES_PER_FEED,
    maxPerAccount: HOSTED_MAX_SOURCES_PER_ACCOUNT,
    maxPaidPerAccount: HOSTED_MAX_PAID_SOURCES_PER_ACCOUNT,
    maxPaidProviderAccounts: HOSTED_MAX_PAID_PROVIDER_ACCOUNTS,
    maxGoogleNewsPerAccount: HOSTED_MAX_GOOGLE_NEWS_SOURCES_PER_ACCOUNT,
    maxXPerAccount: HOSTED_MAX_X_SOURCES_PER_ACCOUNT
  };
}

function normalizedFeedSlug(value: string): string {
  const slug = normalizeUsername(value);
  if (slug.length > 64) throw new Error("feed slug must be 64 characters or fewer");
  return slug;
}

function assertValidUsername(username: string): void {
  if (username.length > 40) throw new Error("username must be 40 characters or fewer");
  if (RESERVED_USERNAMES.has(username)) throw new Error("username is reserved");
}

function expectedTurnstileHostnames(env: Partial<Env>): string[] {
  return (env.TURNSTILE_EXPECTED_HOSTNAMES ?? "")
    .split(",")
    .map((hostname) => hostname.trim().toLowerCase())
    .filter(Boolean);
}

function envProviderEnabled(env: Partial<Env>, provider: RuntimeProvider): boolean {
  const configured = booleanValue({
    rss: env.PROVIDER_RSS_ENABLED,
    telegram: env.PROVIDER_TELEGRAM_ENABLED,
    google_news: env.PROVIDER_GOOGLE_NEWS_ENABLED,
    x: env.PROVIDER_X_ENABLED,
    linkedin: env.PROVIDER_LINKEDIN_ENABLED,
    generic_apify: env.PROVIDER_GENERIC_APIFY_ENABLED,
    brave: env.PROVIDER_BRAVE_ENABLED
  }[provider]);
  if (configured !== undefined) return configured;
  return !isHostedEnvironment(env);
}

async function runtimeProviderEnabledForApp(
  repo: Repository,
  env: Partial<Env>,
  provider: RuntimeProvider
): Promise<boolean> {
  if (!envProviderEnabled(env, provider)) return false;
  if (isHostedEnvironment(env) &&
    (provider === "linkedin" || provider === "generic_apify" || provider === "brave")) return false;
  return booleanValue(await repo.getSetting(`provider_enabled:${provider}`) ?? undefined) ?? true;
}

function booleanValue(value: string | undefined): boolean | undefined {
  const normalized = value?.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized ?? "")) return true;
  if (["false", "0", "no", "off"].includes(normalized ?? "")) return false;
  return undefined;
}

function publicReleaseSha(env: Partial<Env>): string | undefined {
  return env.RELEASE_SHA?.trim() || env.CF_VERSION_METADATA?.tag || env.CF_VERSION_METADATA?.id;
}

function publicFeedHealth(health: HealthStatus): "healthy" | "degraded" {
  return health.sources.enabled > 0 &&
    health.sources.degraded === 0 &&
    health.sources.backoff === 0 &&
    health.processing.failed === 0 &&
    health.processing.staleQueued === 0
    ? "healthy"
    : "degraded";
}

async function operationalReadiness(
  repo: Repository,
  now: Date,
  requireSchedulerHeartbeat: boolean,
  modelEnabled: boolean
): Promise<{
  schedulerFresh: boolean;
  latestSchedulerAt?: string;
  failingSubsystems: string[];
  recentDlqCount: number;
  model: {
    status: "operational" | "degraded" | "disabled";
    latestAt?: string;
    latestFailureAt?: string;
  };
}> {
  const maintenanceSince = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const [maintenance, dlq, modelEvents] = await Promise.all([
    repo.listOperationalEvents({ since: maintenanceSince, category: "maintenance", limit: 500 }),
    repo.listOperationalEvents({
      since: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      category: "dlq",
      limit: 500
    }),
    modelEnabled
      ? repo.listOperationalEvents({
          since: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
          category: "model",
          limit: 500
        })
      : Promise.resolve([])
  ]);
  const latestBySubsystem = new Map<string, (typeof maintenance)[number]>();
  for (const event of maintenance) {
    if (event.status === "started" || latestBySubsystem.has(event.subsystem)) continue;
    latestBySubsystem.set(event.subsystem, event);
  }
  const scheduler = latestBySubsystem.get("scheduler");
  const schedulerFresh = !requireSchedulerHeartbeat || Boolean(
    scheduler &&
    scheduler.status === "succeeded" &&
    scheduler.occurredAt >= new Date(now.getTime() - 5 * 60 * 1000).toISOString()
  );
  const latestModelEvent = modelEvents[0];
  const latestModelFailure = modelEvents.find((event) => event.status === "failed");
  return {
    schedulerFresh,
    latestSchedulerAt: scheduler?.occurredAt,
    failingSubsystems: Array.from(latestBySubsystem.values())
      .filter((event) => event.subsystem !== "scheduler" && event.status === "failed")
      .map((event) => event.subsystem)
      .sort(),
    recentDlqCount: dlq.length,
    model: {
      status: !modelEnabled
        ? "disabled"
        : latestModelEvent?.status === "succeeded"
          ? "operational"
          : "degraded",
      latestAt: latestModelEvent?.occurredAt,
      latestFailureAt: latestModelFailure?.occurredAt
    }
  };
}

function modelSynthesisConfigured(env: Partial<Env>): boolean {
  const mode = env.EDITION_SYNTHESIS_MODE?.trim().toLowerCase();
  if (mode === "deterministic" || mode === "disabled" || mode === "off") return false;
  return Boolean(
    env.CLOUDFLARE_ACCOUNT_ID &&
    env.CLOUDFLARE_AI_GATEWAY_ID &&
    env.OPENAI_API_KEY
  );
}

async function authenticatedViewerAccount(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  repo: Repository
): Promise<AccountRecord | null> {
  const claims = await verifySession(getCookie(c, SESSION_COOKIE), c.env.ADMIN_SESSION_SECRET ?? "");
  if (!claims) return null;
  const account = await repo.getAccountById(claims.sub);
  if (!account || account.disabledAt || account.sessionVersion !== claims.ver) return null;
  return account;
}

async function requestBodyExceedsLimit(request: Request, maxBytes: number): Promise<boolean> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) return true;
  if (!request.body) return false;
  const reader = request.clone().body?.getReader();
  if (!reader) return false;
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return false;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return true;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function hasSessionCookie(cookieHeader: string | undefined): boolean {
  return (cookieHeader ?? "").split(";").some((part) =>
    part.trim().startsWith(`${SESSION_COOKIE}=`)
  );
}

function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function isKnownSpaRoute(pathname: string): boolean {
  return pathname === "/" ||
    pathname === "/status" ||
    pathname === "/status/" ||
    pathname === "/privacy" ||
    pathname === "/privacy/" ||
    pathname === "/terms" ||
    pathname === "/terms/" ||
    pathname === "/acceptable-use" ||
    pathname === "/acceptable-use/" ||
    pathname === "/verify-email" ||
    pathname === "/reset-password";
}

async function resolvePublicHtmlRoute(
  repo: Repository,
  pathname: string
): Promise<{ account: AccountRecord; briefing: BriefingConfig } | null> {
  const match = pathname.match(/^\/([^/.][^/]*)\/([^/]+)\/?$/);
  if (!match) return null;
  let username: string;
  let slug: string;
  try {
    username = decodeURIComponent(match[1]);
    slug = decodeURIComponent(match[2]);
  } catch {
    return null;
  }
  if (RESERVED_USERNAMES.has(username.toLowerCase())) return null;
  const resolved = await repo.resolveUsernameAlias(username);
  if (!resolved || resolved.account.disabledAt || !resolved.alias.isCurrent) return null;
  const briefing = await repo.getBriefingBySlug(resolved.account.id, slug);
  if (!briefing || !briefing.publicFeedEnabled) return null;
  return { account: resolved.account, briefing };
}

function injectPublicFeedMetadata(
  html: string,
  route: { account: AccountRecord; briefing: BriefingConfig },
  origin: string
): string {
  const title = `${route.briefing.title} — Distilled.news`;
  const description = `A public ${route.briefing.language.toUpperCase()} news briefing by @${route.account.username}.`;
  const canonical = `${origin}/${encodeURIComponent(route.account.username)}/${encodeURIComponent(route.briefing.slug)}/`;
  const replacements: Array<[RegExp, string]> = [
    [/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtmlText(title)}</title>`],
    [/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i, `<meta name="description" content="${escapeHtmlAttribute(description)}" />`],
    [/<meta\s+property="og:type"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:type" content="article" />`],
    [/<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:title" content="${escapeHtmlAttribute(title)}" />`],
    [/<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:description" content="${escapeHtmlAttribute(description)}" />`],
    [/<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:title" content="${escapeHtmlAttribute(title)}" />`],
    [/<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:description" content="${escapeHtmlAttribute(description)}" />`]
  ];
  let result = html;
  for (const [pattern, replacement] of replacements) result = result.replace(pattern, replacement);
  const routeTags = [
    `<link rel="canonical" href="${escapeHtmlAttribute(canonical)}" />`,
    `<meta property="og:url" content="${escapeHtmlAttribute(canonical)}" />`
  ].join("\n    ");
  return result.replace("</head>", `    ${routeTags}\n  </head>`);
}

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function escapeXml(value: string): string {
  return escapeHtmlAttribute(value);
}

function parseCanaryFixtureEpoch(value: string | undefined): Date | null {
  if (!value) return null;
  let milliseconds: number;
  if (/^\d{10,13}$/.test(value)) {
    milliseconds = Number(value) * (value.length === 10 ? 1_000 : 1);
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}(?::00(?::00(?:\.000)?)?)?Z$/.test(value)) {
    milliseconds = Date.parse(value);
  } else {
    return null;
  }
  if (!Number.isFinite(milliseconds)) return null;
  const epoch = new Date(milliseconds);
  if (Number.isNaN(epoch.getTime()) || epoch.getUTCFullYear() < 2020 || epoch.getUTCFullYear() > 2100) return null;
  epoch.setUTCMinutes(0, 0, 0);
  return epoch;
}

function parseCanaryFixtureRotationHours(value: string | undefined): 1 | 4 | null {
  if (value === "1") return 1;
  if (value === "4") return 4;
  return null;
}

async function safeRecordAppOperationalEvent(
  repo: Repository,
  event: Parameters<Repository["recordOperationalEvent"]>[0],
  now: Date
): Promise<void> {
  try {
    await repo.recordOperationalEvent(event, now);
  } catch {
    console.warn("Could not persist application operational event", {
      category: event.category,
      subsystem: event.subsystem,
      status: event.status
    });
  }
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeOutboundPublicUrl(value: string | undefined): string | undefined {
  if (!value || value.length > 2_048) return undefined;
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return undefined;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host === "::1" ||
      host === "0.0.0.0" ||
      host.startsWith("127.") ||
      host.startsWith("169.254.") ||
      host.startsWith("10.") ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^(?:fc|fd|fe80:)/i.test(host)) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

async function deleteAccountWithPayloads(
  repo: Repository,
  bucket: {
    put(key: string, value: string, options?: unknown): Promise<unknown>;
    delete(key: string | string[]): Promise<unknown>;
  } | undefined,
  account: AccountRecord,
  now: Date,
  requireBucket: boolean
): Promise<{ deletedPayloadCount: number; sharedPayloadCountRetained: number; deletionManifestKey?: string }> {
  const plan = await repo.planAccountPayloadDeletion(account.id);
  const briefings = await repo.listBriefings(account.id);
  const timestamp = now.toISOString();
  const deletionManifestKey = `deletion-manifests/${account.id}/pending.json`;
  const snapshotKeys = [
    ...briefings.map((briefing) => publicFeedSnapshotKey(account.username, briefing.slug)),
    exploreSnapshotKey()
  ];
  if (!bucket) {
    if (requireBucket || plan.exclusiveKeys.length > 0) {
      throw new Error("R2 archive binding is required to delete this account safely");
    }
    await repo.deleteAccount(account.id, now);
    return {
      deletedPayloadCount: 0,
      sharedPayloadCountRetained: plan.sharedKeysRetained
    };
  }
  await bucket.put(deletionManifestKey, JSON.stringify({
    accountId: account.id,
    requestedAt: timestamp,
    exclusivePayloadKeys: plan.exclusiveKeys,
    publicSnapshotKeys: snapshotKeys,
    sharedPayloadCountRetained: plan.sharedKeysRetained,
    totalReferencedPayloadKeys: plan.totalReferencedKeys
  }), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
  // Public copies disappear first. If a later archive batch fails, a retry can
  // safely replay the deterministic manifest and idempotent R2 deletes without
  // exposing an account whose database row still exists.
  await deleteR2KeysInBatches(bucket, snapshotKeys);
  await deleteR2KeysInBatches(bucket, plan.exclusiveKeys);
  await repo.deleteAccount(account.id, now);
  return {
    deletedPayloadCount: plan.exclusiveKeys.length,
    sharedPayloadCountRetained: plan.sharedKeysRetained,
    deletionManifestKey
  };
}

async function deleteBriefingWithPayloads(
  repo: Repository,
  bucket: {
    put(key: string, value: string, options?: unknown): Promise<unknown>;
    delete(key: string | string[]): Promise<unknown>;
  } | undefined,
  account: AccountRecord,
  briefing: BriefingConfig,
  now: Date,
  requireBucket: boolean
): Promise<void> {
  const plan = await repo.planBriefingPayloadDeletion(briefing.id);
  const snapshotKeys = [
    publicFeedSnapshotKey(account.username, briefing.slug),
    exploreSnapshotKey()
  ];
  if (!bucket) {
    if (requireBucket || plan.exclusiveKeys.length > 0) {
      throw new Error("R2 archive binding is required to delete this feed safely");
    }
    await repo.deleteBriefing(briefing.id, now);
    return;
  }
  const timestamp = now.toISOString();
  const manifestKey = `deletion-manifests/${account.id}/feeds/${briefing.id}/pending.json`;
  await bucket.put(manifestKey, JSON.stringify({
    accountId: account.id,
    briefingId: briefing.id,
    requestedAt: timestamp,
    exclusivePayloadKeys: plan.exclusiveKeys,
    publicSnapshotKeys: snapshotKeys,
    sharedPayloadCountRetained: plan.sharedKeysRetained,
    totalReferencedPayloadKeys: plan.totalReferencedKeys
  }), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
  await deleteR2KeysInBatches(bucket, snapshotKeys);
  await deleteR2KeysInBatches(bucket, plan.exclusiveKeys);
  await repo.deleteBriefing(briefing.id, now);
}

async function invalidatePublicSnapshots(
  bucket: { delete(key: string | string[]): Promise<unknown> } | undefined,
  keys: string[],
  requireBucket: boolean
): Promise<void> {
  if (!bucket) {
    if (requireBucket) throw new Error("R2 archive binding is required to invalidate public snapshots");
    return;
  }
  await deleteR2KeysInBatches(bucket, keys);
}

async function deleteR2KeysInBatches(
  bucket: { delete(key: string | string[]): Promise<unknown> },
  keys: string[]
): Promise<void> {
  const uniqueKeys = Array.from(new Set(keys));
  for (let index = 0; index < uniqueKeys.length; index += 1_000) {
    const batch = uniqueKeys.slice(index, index + 1_000);
    await bucket.delete(batch.length === 1 ? batch[0] : batch);
  }
}

function publicFeedSnapshotKey(username: string, slug: string): string {
  return `public-snapshots/feeds/${encodeURIComponent(username.toLowerCase())}/${encodeURIComponent(slug.toLowerCase())}.json`;
}

function exploreSnapshotKey(): string {
  return "public-snapshots/explore.json";
}

async function writePublicSnapshot(
  bucket: {
    put(key: string, value: string, options?: unknown): Promise<unknown>;
    get?(key: string): Promise<{ text(): Promise<string> } | null>;
  } | undefined,
  key: string,
  payload: unknown
): Promise<void> {
  try {
    if (!bucket) return;
    const payloadJson = JSON.stringify(payload);
    if (bucket.get) {
      const existing = await bucket.get(key);
      if (existing) {
        try {
          const envelope = JSON.parse(await existing.text()) as { payload?: unknown };
          if (envelope.payload !== undefined && JSON.stringify(envelope.payload) === payloadJson) return;
        } catch {
          // Replace malformed snapshots with a valid last-known-good envelope.
        }
      }
    }
    await bucket.put(key, JSON.stringify({
      version: 1,
      capturedAt: new Date().toISOString(),
      payload
    }), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
  } catch {
    console.warn("Could not update a public last-known-good snapshot");
  }
}

async function readPublicSnapshot<T>(
  bucket: {
    get?(key: string): Promise<{ text(): Promise<string> } | null>;
  } | undefined,
  key: string
): Promise<T | null> {
  try {
    if (!bucket?.get) return null;
    const object = await bucket.get(key);
    if (!object) return null;
    const envelope = JSON.parse(await object.text()) as {
      version?: number;
      capturedAt?: string;
      payload?: T;
    };
    const capturedAt = Date.parse(envelope.capturedAt ?? "");
    if (envelope.version !== 1 ||
      !Number.isFinite(capturedAt) ||
      capturedAt > Date.now() + 5 * 60 * 1000 ||
      capturedAt < Date.now() - 24 * 60 * 60 * 1000 ||
      envelope.payload === undefined) return null;
    return envelope.payload;
  } catch {
    return null;
  }
}
