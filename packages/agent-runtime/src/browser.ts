import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { ChallengeState, SemanticControl } from "./contracts";
import { makeId } from "./contracts";
import { sha256Text } from "./observations";

export interface BrowserScope {
  runId: string;
  tenantId: string;
  sessionId: string;
  contextId: string;
  generation: number;
}

export interface BrowserAllocation extends BrowserScope {
  pageId: string;
  viewport: { width: number; height: number; deviceScaleFactor: number };
}

export interface BrowserObservationData {
  url: string;
  finalUrl: string;
  title: string;
  pageId: string;
  pageRevision: string;
  contentType: string;
  raw: Uint8Array;
  representation: unknown;
  controls: SemanticControl[];
  challengeState: ChallengeState;
  watermarkObserved: boolean;
  article?: {
    title: string;
    canonicalUrl: string;
    publisherTimestamp: string;
    excerpt: string;
    body: string;
  };
}

export interface ScreenshotData extends BrowserObservationData {
  screenshotObservationToken: string;
  viewport: { width: number; height: number; deviceScaleFactor: number };
}

export interface BrowserExecutorPort {
  allocate(input: {
    runId: string;
    tenantId: string;
    generation: number;
    allowedOrigins: string[];
  }): Promise<BrowserAllocation>;
  health(scope: BrowserScope): Promise<"healthy" | "crashed" | "closed">;
  close(scope: BrowserScope): Promise<void>;
  crashForTest(scope: BrowserScope): Promise<void>;
}

export interface StructuredBrowserUsePort {
  navigate(scope: BrowserScope, url: string): Promise<BrowserObservationData>;
  inspectDom(scope: BrowserScope): Promise<BrowserObservationData>;
  inspectAccessibilityTree(scope: BrowserScope): Promise<BrowserObservationData>;
  followLink(scope: BrowserScope, handle: string, observationRevision: string): Promise<BrowserObservationData>;
  extract(scope: BrowserScope): Promise<BrowserObservationData>;
  queryPageState(scope: BrowserScope): Promise<BrowserObservationData>;
  scroll(scope: BrowserScope, deltaY: number): Promise<BrowserObservationData>;
}

export interface VisualComputerUsePort {
  screenshot(scope: BrowserScope): Promise<ScreenshotData>;
  movePointer(
    scope: BrowserScope,
    input: { x: number; y: number; screenshotToken: string; pageRevision: string }
  ): Promise<BrowserObservationData>;
  click(
    scope: BrowserScope,
    input: { x: number; y: number; screenshotToken: string; pageRevision: string }
  ): Promise<BrowserObservationData>;
}

interface LiveSession {
  scope: BrowserAllocation;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  allowedOrigins: Set<string>;
  handles: Map<string, { index: number; revision: string }>;
  screenshots: Map<string, { revision: string; url: string }>;
  state: "healthy" | "crashed" | "closed";
  blockedNavigation?: string;
}

export class BrowserScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserScopeError";
  }
}

export class StaleObservationError extends Error {
  constructor(kind: "handle" | "screenshot") {
    super(`stale ${kind} observation`);
    this.name = "StaleObservationError";
  }
}

export class PlaywrightBrowserAdapter
  implements BrowserExecutorPort, StructuredBrowserUsePort, VisualComputerUsePort
{
  private readonly sessions = new Map<string, LiveSession>();

  async allocate(input: {
    runId: string;
    tenantId: string;
    generation: number;
    allowedOrigins: string[];
  }): Promise<BrowserAllocation> {
    if ([...this.sessions.values()].some((entry) => entry.scope.runId === input.runId && entry.state === "healthy")) {
      throw new BrowserScopeError(`run ${input.runId} already has an active browser context`);
    }
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const sessionId = makeId("browser_session", input.runId, input.generation);
    const contextId = makeId("browser_context", input.runId, input.tenantId, input.generation);
    const pageId = makeId("page", contextId, 1);
    const scope: BrowserAllocation = {
      runId: input.runId,
      tenantId: input.tenantId,
      sessionId,
      contextId,
      generation: input.generation,
      pageId,
      viewport: { width: 960, height: 720, deviceScaleFactor: 1 }
    };
    const live: LiveSession = {
      scope,
      browser,
      context,
      page,
      allowedOrigins: new Set(input.allowedOrigins),
      handles: new Map(),
      screenshots: new Map(),
      state: "healthy"
    };
    await context.route("**/*", async (route) => {
      const request = route.request();
      if (request.isNavigationRequest() && request.resourceType() === "document") {
        const origin = new URL(request.url()).origin;
        if (!live.allowedOrigins.has(origin) && request.url() !== "about:blank") {
          live.blockedNavigation = request.url();
          await route.abort("blockedbyclient");
          return;
        }
      }
      await route.continue();
    });
    this.sessions.set(sessionId, live);
    return structuredClone(scope);
  }

  async health(scope: BrowserScope) {
    return this.require(scope).state;
  }

  async close(scope: BrowserScope) {
    const live = this.require(scope);
    if (live.state === "closed") return;
    live.state = "closed";
    await live.context.close().catch(() => undefined);
    await live.browser.close().catch(() => undefined);
  }

  async crashForTest(scope: BrowserScope) {
    const live = this.require(scope);
    live.state = "crashed";
    await live.browser.close();
  }

  async navigate(scope: BrowserScope, url: string) {
    const live = this.requireHealthy(scope);
    live.blockedNavigation = undefined;
    try {
      await live.page.goto(url, { waitUntil: "networkidle" });
    } catch (error) {
      if (live.blockedNavigation) throw new BrowserScopeError(`redirect blocked: ${live.blockedNavigation}`);
      throw error;
    }
    if (live.blockedNavigation) throw new BrowserScopeError(`redirect blocked: ${live.blockedNavigation}`);
    this.assertFinalOrigin(live);
    this.invalidateTransientBindings(live);
    return this.observe(live, "page_state");
  }

  async inspectDom(scope: BrowserScope) {
    return this.observe(this.requireHealthy(scope), "dom");
  }

  async inspectAccessibilityTree(scope: BrowserScope) {
    return this.observe(this.requireHealthy(scope), "accessibility");
  }

  async followLink(scope: BrowserScope, handle: string, observationRevision: string) {
    const live = this.requireHealthy(scope);
    const binding = live.handles.get(handle);
    if (!binding || binding.revision !== observationRevision || (await this.revision(live.page)) !== observationRevision) {
      throw new StaleObservationError("handle");
    }
    live.blockedNavigation = undefined;
    await live.page.locator("a,button,input,select,textarea").nth(binding.index).click();
    await live.page.waitForLoadState("networkidle");
    if (live.blockedNavigation) throw new BrowserScopeError(`redirect blocked: ${live.blockedNavigation}`);
    this.assertFinalOrigin(live);
    this.invalidateTransientBindings(live);
    return this.observe(live, "page_state");
  }

  async extract(scope: BrowserScope) {
    return this.observe(this.requireHealthy(scope), "article");
  }

  async queryPageState(scope: BrowserScope) {
    return this.observe(this.requireHealthy(scope), "page_state");
  }

  async scroll(scope: BrowserScope, deltaY: number) {
    const live = this.requireHealthy(scope);
    await live.page.mouse.wheel(0, deltaY);
    return this.observe(live, "page_state");
  }

  async screenshot(scope: BrowserScope): Promise<ScreenshotData> {
    const live = this.requireHealthy(scope);
    const base = await this.observe(live, "screenshot", true);
    const token = makeId("screenshot", scope.runId, base.pageRevision, live.screenshots.size + 1);
    live.screenshots.set(token, { revision: base.pageRevision, url: base.url });
    return {
      ...base,
      screenshotObservationToken: token,
      viewport: structuredClone(live.scope.viewport)
    };
  }

  async movePointer(
    scope: BrowserScope,
    input: { x: number; y: number; screenshotToken: string; pageRevision: string }
  ) {
    const live = this.requireHealthy(scope);
    await this.assertScreenshot(live, input.screenshotToken, input.pageRevision);
    this.assertCoordinates(live, input.x, input.y);
    await live.page.mouse.move(input.x, input.y);
    return this.observe(live, "page_state");
  }

  async click(
    scope: BrowserScope,
    input: { x: number; y: number; screenshotToken: string; pageRevision: string }
  ) {
    const live = this.requireHealthy(scope);
    await this.assertScreenshot(live, input.screenshotToken, input.pageRevision);
    this.assertCoordinates(live, input.x, input.y);
    live.blockedNavigation = undefined;
    const beforeUrl = live.page.url();
    await live.page.mouse.click(input.x, input.y);
    await Promise.race([
      live.page.waitForURL((candidate) => candidate.toString() !== beforeUrl, { timeout: 1_000 }).catch(() => undefined),
      live.page.waitForTimeout(250)
    ]);
    await live.page.waitForLoadState("networkidle").catch(() => undefined);
    if (live.blockedNavigation) throw new BrowserScopeError(`redirect blocked: ${live.blockedNavigation}`);
    this.assertFinalOrigin(live);
    this.invalidateTransientBindings(live);
    return this.observe(live, "page_state");
  }

  private require(scope: BrowserScope): LiveSession {
    const live = this.sessions.get(scope.sessionId);
    if (!live) throw new BrowserScopeError(`browser session not found: ${scope.sessionId}`);
    if (
      live.scope.runId !== scope.runId ||
      live.scope.tenantId !== scope.tenantId ||
      live.scope.contextId !== scope.contextId ||
      live.scope.generation !== scope.generation
    ) {
      throw new BrowserScopeError("browser scope does not belong to this tenant/run/generation");
    }
    return live;
  }

  private requireHealthy(scope: BrowserScope): LiveSession {
    const live = this.require(scope);
    if (live.state !== "healthy") throw new BrowserScopeError(`browser session is ${live.state}`);
    return live;
  }

  private assertFinalOrigin(live: LiveSession) {
    if (!live.allowedOrigins.has(new URL(live.page.url()).origin)) {
      throw new BrowserScopeError(`final origin blocked: ${live.page.url()}`);
    }
  }

  private invalidateTransientBindings(live: LiveSession) {
    live.handles.clear();
    live.screenshots.clear();
  }

  private async assertScreenshot(live: LiveSession, token: string, revision: string) {
    const captured = live.screenshots.get(token);
    if (!captured || captured.revision !== revision || captured.url !== live.page.url()) {
      throw new StaleObservationError("screenshot");
    }
    if ((await this.revision(live.page)) !== revision) throw new StaleObservationError("screenshot");
  }

  private assertCoordinates(live: LiveSession, x: number, y: number) {
    if (x < 0 || y < 0 || x >= live.scope.viewport.width || y >= live.scope.viewport.height) {
      throw new BrowserScopeError("coordinates outside captured viewport");
    }
  }

  private async revision(page: Page) {
    return sha256Text(`${page.url()}\n${await page.content()}`);
  }

  private async observe(
    live: LiveSession,
    kind: "dom" | "accessibility" | "page_state" | "screenshot" | "article",
    image = false
  ): Promise<BrowserObservationData> {
    const page = live.page;
    const url = page.url();
    const title = await page.title();
    const html = await page.content();
    const pageRevision = await sha256Text(`${url}\n${html}`);
    const controls: SemanticControl[] = [];
    const elements = page.locator("a,button,input,select,textarea");
    const count = Math.min(await elements.count(), 40);
    for (let index = 0; index < count; index += 1) {
      const element = elements.nth(index);
      if (!(await element.isVisible().catch(() => false))) continue;
      const tag = await element.evaluate((node) => node.tagName.toLowerCase());
      const label = (
        (await element.getAttribute("aria-label")) ??
        (await element.getAttribute("title")) ??
        (await element.getAttribute("placeholder")) ??
        (await element.innerText().catch(() => ""))
      ).trim();
      const handle = makeId("handle", live.scope.sessionId, pageRevision, index, label);
      live.handles.set(handle, { index, revision: pageRevision });
      controls.push({
        handle,
        kind: tag === "a" ? "link" : tag === "button" ? "button" : tag === "input" ? "input" : "other",
        label: label.slice(0, 160),
        safeAction: /publish|send|buy|delete|save/i.test(label) ? "forbidden" : tag === "a" ? "follow" : "read"
      });
    }
    const bodyText = await page.locator("body").innerText().catch(() => "");
    const challengeState = /simulated captcha|required captcha/i.test(bodyText) ? "CAPTCHA_REQUIRED" : "NO_CHALLENGE";
    const watermarkObserved = (await page.locator("[data-watermark-observed='true']").count()) > 0;
    let article: BrowserObservationData["article"];
    const articleLocator = page.locator("article").first();
    if ((await articleLocator.count()) > 0) {
      const articleTitle = (await articleLocator.locator("h1").first().innerText().catch(() => "")).trim();
      const canonicalUrl = (await page.locator("link[rel='canonical']").getAttribute("href")) ?? url;
      const publisherTimestamp = (await articleLocator.locator("time").getAttribute("datetime")) ?? "";
      const body = (await articleLocator.locator("[data-article-body]").innerText().catch(() => bodyText)).trim();
      const excerpt = (await articleLocator.locator("[data-excerpt]").innerText().catch(() => body.slice(0, 180))).trim();
      article = { title: articleTitle, canonicalUrl, publisherTimestamp, excerpt, body };
    }
    const representation = {
      url,
      title,
      controls,
      challengeState,
      watermarkObserved,
      article: article
        ? {
            title: article.title,
            canonicalUrl: article.canonicalUrl,
            publisherTimestamp: article.publisherTimestamp,
            excerpt: article.excerpt,
            body: article.body.slice(0, 4_000)
          }
        : undefined,
      visibleText: bodyText.slice(0, 4_000)
    };
    const raw = image ? await page.screenshot({ type: "png" }) : new TextEncoder().encode(html);
    return {
      url,
      finalUrl: url,
      title,
      pageId: live.scope.pageId,
      pageRevision,
      contentType: image ? "image/png" : "text/html",
      raw,
      representation,
      controls,
      challengeState,
      watermarkObserved,
      article
    };
  }
}
