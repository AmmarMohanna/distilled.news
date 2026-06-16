import { searchBriefingItems, type BriefingConfig } from "@lownoise/core";
import { Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { adminAuth, clearSessionCookie, createSession, hashPassword, setSessionCookie, verifySession } from "./auth";
import { ingestPublicTelegramChannel, refreshPublicTelegramSources } from "./publicTelegram";
import { D1Repository } from "./repository";
import type { Env, ProcessingJobMessage, Repository } from "./types";

type Variables = {
  repo: Repository;
};

export interface AppOptions {
  repository?: Repository;
  bucket?: { put(key: string, value: string, options?: unknown): Promise<unknown> };
  queue?: { send(message: ProcessingJobMessage): Promise<unknown> };
  fetcher?: typeof fetch;
}

const briefingInputSchema = z.object({
  id: z.string().min(1).default("briefing_default"),
  slug: z.string().min(1).default("personal"),
  title: z.string().min(1).default("Personal Briefing"),
  interestProfile: z.string().min(1),
  styleInstruction: z.string().optional(),
  publicFeedEnabled: z.boolean().default(false),
  paused: z.boolean().default(false),
  language: z.enum(["en", "ar"]).default("en"),
  retentionDays: z.number().int().min(1).max(90).default(15)
});

const sourceInputSchema = z.union([
  z.object({
    briefingId: z.string().min(1),
    url: z.string().min(1)
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

export function createApp(options: AppOptions = {}) {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();

  const repoFor = (c: { env: Env }): Repository => options.repository ?? new D1Repository(c.env.DB);
  const bucketFor = (c: { env: Env }) => options.bucket ?? c.env.RAW_ARCHIVE;
  const queueFor = (c: { env: Env }) => options.queue ?? c.env.PROCESSING_QUEUE;
  const fetcher = options.fetcher ?? fetch;

  app.use("*", async (c, next) => {
    const url = new URL(c.req.url);
    if (url.hostname === "www.lownoise.news" || (url.hostname === "lownoise.news" && url.protocol === "http:")) {
      url.protocol = "https:";
      url.hostname = "lownoise.news";
      return c.redirect(url.toString(), 301);
    }
    return next();
  });

  app.get("/api/admin/session", async (c) => {
    const repo = repoFor(c);
    const setupRequired = !(await repo.getSetting("admin_password_hash"));
    const authenticated = await verifySession(
      getCookie(c, "ln_session"),
      c.env.ADMIN_SESSION_SECRET ?? ""
    );
    return c.json({ authenticated, setupRequired });
  });

  app.post("/api/admin/session", async (c) => {
    const repo = repoFor(c);
    const body = (await c.req.json().catch(() => ({}))) as {
      username?: string;
      password?: string;
      setupToken?: string;
    };
    if (!body.password) return c.json({ error: "password is required" }, 400);
    if (!c.env.ADMIN_SESSION_SECRET) {
      return c.json({ error: "ADMIN_SESSION_SECRET is not configured" }, 500);
    }

    const existingHash = await repo.getSetting("admin_password_hash");
    const requestedUsername = body.username?.trim();
    if (!existingHash) {
      const expectedSetupToken = c.env.ADMIN_SETUP_TOKEN ?? c.env.ADMIN_SESSION_SECRET;
      if (body.setupToken !== expectedSetupToken) return c.json({ error: "invalid setup token" }, 401);
      await repo.setSetting("admin_username", requestedUsername || "admin");
      await repo.setSetting("admin_password_hash", await hashPassword(body.password));
    } else {
      const expectedUsername = (await repo.getSetting("admin_username")) ?? "admin";
      if (requestedUsername && requestedUsername !== expectedUsername) return c.json({ error: "invalid username" }, 401);
      if ((await hashPassword(body.password)) !== existingHash) {
        return c.json({ error: "invalid password" }, 401);
      }
    }

    setSessionCookie(c, await createSession(c.env.ADMIN_SESSION_SECRET));
    return c.json({ ok: true });
  });

  app.delete("/api/admin/session", async (c) => {
    clearSessionCookie(c);
    return c.json({ ok: true });
  });

  app.use("/api/admin/*", async (c, next) => {
    const path = new URL(c.req.url).pathname;
    if (path === "/api/admin/session") return next();
    return adminAuth(repoFor)(c, next);
  });

  app.get("/api/admin/briefings", async (c) => {
    const repo = c.get("repo");
    if ((await repo.listBriefings()).length === 0) await repo.ensureDefaultBriefing();
    return c.json({ briefings: await repo.listBriefings() });
  });

  app.post("/api/admin/briefings", async (c) => {
    const repo = c.get("repo");
    const input = briefingInputSchema.parse(await c.req.json());
    const briefing = await repo.upsertBriefing(input);
    return c.json({ briefing });
  });

  app.get("/api/admin/sources", async (c) => {
    const repo = c.get("repo");
    const briefing = await resolveBriefing(repo, c.req.query("briefingId"));
    if (!briefing) return c.json({ error: "briefing not found" }, 404);
    return c.json({ sources: await repo.listSources(briefing.id) });
  });

  app.post("/api/admin/sources", async (c) => {
    const repo = c.get("repo");
    const parsed = sourceInputSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Enter a Telegram channel URL or source toggle." }, 400);
    const body = parsed.data;
    const briefing = await resolveBriefing(repo, body.briefingId);
    if (!briefing) return c.json({ error: "briefing not found" }, 404);

    if ("url" in body) {
      let result;
      try {
        result = await ingestPublicTelegramChannel({
          briefing,
          url: body.url,
          repo,
          bucket: bucketFor(c),
          queue: queueFor(c),
          fetcher
        });
      } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : "Could not add Telegram source" }, 400);
      }
      return c.json({ sources: await repo.listSources(briefing.id), result });
    }

    await repo.setSourceEnabled(body.sourceId, body.enabled);
    return c.json({ sources: await repo.listSources(briefing.id) });
  });

  app.post("/api/admin/sources/refresh", async (c) => {
    const repo = c.get("repo");
    const parsed = healthInputSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "briefing not found" }, 400);
    const briefing = await resolveBriefing(repo, parsed.data.briefingId);
    if (!briefing) return c.json({ error: "briefing not found" }, 404);
    const results = await refreshPublicTelegramSources({
      briefing,
      repo,
      bucket: bucketFor(c),
      queue: queueFor(c),
      fetcher
    });
    return c.json({ sources: await repo.listSources(briefing.id), results });
  });

  app.delete("/api/admin/sources/:sourceId", async (c) => {
    const repo = c.get("repo");
    await repo.deleteSource(c.req.param("sourceId"));
    const briefing = await resolveBriefing(repo, c.req.query("briefingId"));
    if (!briefing) return c.json({ error: "briefing not found" }, 404);
    return c.json({ sources: await repo.listSources(briefing.id) });
  });

  app.get("/api/admin/health", async (c) => {
    const repo = c.get("repo");
    const briefing = await resolveBriefing(repo, c.req.query("briefingId"));
    if (!briefing) return c.json({ error: "briefing not found" }, 404);
    return c.json({ health: await repo.getHealth(briefing.id) });
  });

  app.get("/api/feed/:briefingSlug", async (c) => {
    const repo = repoFor(c);
    const briefing = await repo.getBriefingBySlug(c.req.param("briefingSlug"));
    if (!briefing) return c.json({ error: "briefing not found" }, 404);
    const includePrivate = await isAdminRequest(c, briefing);
    if (!briefing.publicFeedEnabled && !includePrivate) return c.json({ error: "feed is private" }, 401);
    return c.json({ briefing: publicBriefing(briefing), items: await repo.listFeedItems(briefing.slug, true) });
  });

  app.get("/api/feed/:briefingSlug/search", async (c) => {
    const repo = repoFor(c);
    const briefing = await repo.getBriefingBySlug(c.req.param("briefingSlug"));
    if (!briefing) return c.json({ error: "briefing not found" }, 404);
    const includePrivate = await isAdminRequest(c, briefing);
    if (!briefing.publicFeedEnabled && !includePrivate) return c.json({ error: "feed is private" }, 401);

    const query = c.req.query("q") ?? "";
    const items = await repo.listFeedItems(briefing.slug, true);
    return c.json({ items: searchBriefingItems(items, query) });
  });

  app.post("/api/internal/retention/run", async (c) => {
    if (c.req.header("x-lownoise-internal") !== c.env.INTERNAL_MAINTENANCE_SECRET) {
      return c.json({ error: "unauthorized" }, 401);
    }
    const repo = repoFor(c);
    return c.json({ deleted: await repo.deleteExpired() });
  });

  app.all("/api/*", (c) => c.json({ error: "not found" }, 404));
  app.all("/telegram/*", (c) => c.json({ error: "not found" }, 404));
  app.get("/demo", (c) => c.redirect("/", 302));

  app.all("*", async (c) => {
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
    return c.text("LowNoise.news Worker is running. Build apps/web to serve the UI.", 200);
  });

  return app;
}

async function isAdminRequest(c: Context<{ Bindings: Env; Variables: Variables }>, _briefing: BriefingConfig): Promise<boolean> {
  const secret = c.env.ADMIN_SESSION_SECRET ?? "";
  if (c.req.header("x-lownoise-admin") === secret && secret) return true;
  return verifySession(getCookie(c, "ln_session"), secret);
}

function publicBriefing(briefing: BriefingConfig): Omit<BriefingConfig, "interestProfile" | "styleInstruction"> {
  return {
    id: briefing.id,
    slug: briefing.slug,
    title: briefing.title,
    publicFeedEnabled: briefing.publicFeedEnabled,
    paused: briefing.paused,
    language: briefing.language,
    retentionDays: briefing.retentionDays
  };
}

async function resolveBriefing(repo: Repository, briefingId?: string): Promise<BriefingConfig | null> {
  if (briefingId) return repo.getBriefingById(briefingId);
  return repo.ensureDefaultBriefing();
}
