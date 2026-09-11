import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import type { ChallengeState, InteractionCapability, SemanticControl } from "./contracts";
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
    signal?: AbortSignal;
  }): Promise<BrowserAllocation>;
  health(scope: BrowserScope): Promise<"healthy" | "crashed" | "closed">;
  close(scope: BrowserScope): Promise<void>;
  crashForTest(scope: BrowserScope): Promise<void>;
  bindObservationCapabilities(scope: BrowserScope, input: {
    observationId: string;
    observationHash: string;
    pageRevision: string;
    controls: SemanticControl[];
    allowedDestinationUrls: string[];
  }): Promise<SemanticControl[]>;
}

export interface StructuredBrowserUsePort {
  navigate(scope: BrowserScope, url: string): Promise<BrowserObservationData>;
  inspectDom(scope: BrowserScope): Promise<BrowserObservationData>;
  inspectAccessibilityTree(scope: BrowserScope): Promise<BrowserObservationData>;
  followLink(scope: BrowserScope, handle: string, observationRevision: string, capability: string): Promise<BrowserObservationData>;
  extract(scope: BrowserScope): Promise<BrowserObservationData>;
  queryPageState(scope: BrowserScope): Promise<BrowserObservationData>;
  scroll(scope: BrowserScope, deltaY: number): Promise<BrowserObservationData>;
}

export interface VisualComputerUsePort {
  screenshot(scope: BrowserScope): Promise<ScreenshotData>;
  movePointer(
    scope: BrowserScope,
    input: { x: number; y: number; screenshotToken: string; pageRevision: string; capability: InteractionCapability }
  ): Promise<BrowserObservationData>;
  click(
    scope: BrowserScope,
    input: { x: number; y: number; screenshotToken: string; pageRevision: string; capability: InteractionCapability }
  ): Promise<BrowserObservationData>;
  issueVisualCapability(scope: BrowserScope, input: {
    action: "click" | "move_pointer";
    x: number;
    y: number;
    screenshotToken: string;
    screenshotObservationId: string;
    screenshotHash: string;
    pageRevision: string;
    allowedDestinationUrls: string[];
  }): Promise<InteractionCapability | null>;
}

interface LiveSession {
  scope: BrowserAllocation;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  allowedOrigins: Set<string>;
  handles: Map<string, { index: number; revision: string; destinationUrl?: string }>;
  screenshots: Map<string, { revision: string; url: string; scrollX: number; scrollY: number; viewport: string }>;
  capabilities: Map<string, InteractionCapability>;
  pinnedAddresses: Map<string, string>;
  signal?: AbortSignal;
  abortListener?: () => void;
  state: "healthy" | "crashed" | "closed";
  blockedNavigation?: string;
}

export class BrowserScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserScopeError";
  }
}

export class BrowserPreDispatchError extends BrowserScopeError {
  constructor(message: string) { super(message); this.name = "BrowserPreDispatchError"; }
}

export class BrowserPostDispatchError extends BrowserScopeError {
  constructor(message: string) { super(message); this.name = "BrowserPostDispatchError"; }
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

  constructor(private readonly options: { testOnlyPrivateNetwork?: true } = {}) {
    if (options.testOnlyPrivateNetwork && (typeof process === "undefined" || process.env.NODE_ENV !== "test")) {
      throw new Error("private-network browser access is test-only");
    }
  }

  static forTest(): PlaywrightBrowserAdapter {
    if (typeof process === "undefined" || process.env.NODE_ENV !== "test") {
      throw new Error("private-network browser access is test-only");
    }
    return new PlaywrightBrowserAdapter({ testOnlyPrivateNetwork: true });
  }

  async allocate(input: {
    runId: string;
    tenantId: string;
    generation: number;
    allowedOrigins: string[];
    signal?: AbortSignal;
  }): Promise<BrowserAllocation> {
    input.signal?.throwIfAborted();
    if ([...this.sessions.values()].some((entry) => entry.scope.runId === input.runId && entry.state === "healthy")) {
      throw new BrowserScopeError(`run ${input.runId} already has an active browser context`);
    }
    const normalizedOrigins=new Set<string>();
    const pinnedAddresses=new Map<string,string>();
    const resolverRules:string[]=[];
    for (const configuredOrigin of input.allowedOrigins) {
      let parsed:URL;
      try { parsed=new URL(configuredOrigin); } catch { throw new BrowserPreDispatchError(`invalid allowed origin: ${configuredOrigin}`); }
      if ((parsed.protocol!=="http:" && parsed.protocol!=="https:") || parsed.origin!==configuredOrigin) {
        throw new BrowserPreDispatchError(`allowed origin must be an exact HTTP(S) origin: ${configuredOrigin}`);
      }
      normalizedOrigins.add(parsed.origin);
      if (!this.options.testOnlyPrivateNetwork && !pinnedAddresses.has(parsed.hostname)) {
        const addresses=await resolveAddresses(parsed.hostname);
        if (addresses.length===0 || addresses.some(isPrivateAddress)) {
          throw new BrowserPreDispatchError(`private or unresolved allowed origin denied: ${parsed.hostname}`);
        }
        const sorted=addresses.sort();
        pinnedAddresses.set(parsed.hostname,sorted.join(","));
        resolverRules.push(`MAP ${parsed.hostname} ${sorted[0]}`);
      }
    }
    const browser = await chromium.launch({ headless: true,args:resolverRules.length ? [`--host-resolver-rules=${resolverRules.join(",")}`] : [] });
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
      allowedOrigins: normalizedOrigins,
      handles: new Map(),
      screenshots: new Map(),
      capabilities: new Map(),
      pinnedAddresses,
      signal:input.signal,
      state: "healthy"
    };
    await context.route("**/*", async (route) => {
      const request = route.request();
      try {
        await this.assertRequestAllowed(live, request.url());
        await route.continue();
      } catch {
        live.blockedNavigation = request.url();
        await route.abort("blockedbyclient");
      }
    });
    page.on("download", (download) => { void download.cancel().catch(() => undefined); });
    this.sessions.set(sessionId, live);
    context.on("page",(opened)=>{
      if (opened===page) return;
      live.blockedNavigation="popup:new-page";
      void opened.close().catch(()=>undefined);
    });
    if (input.signal) {
      live.abortListener = () => {
        if (live.state !== "healthy") return;
        live.state = "closed";
        this.invalidateTransientBindings(live);
        void Promise.all([
          live.context.close().catch(() => undefined),
          live.browser.close().catch(() => undefined)
        ]).finally(()=>{
          if (this.sessions.get(scope.sessionId)===live) this.sessions.delete(scope.sessionId);
        });
      };
      input.signal.addEventListener("abort", live.abortListener, { once: true });
      if (input.signal.aborted) {
        live.abortListener();
        input.signal.throwIfAborted();
      }
    }
    return structuredClone(scope);
  }

  async health(scope: BrowserScope) {
    return this.require(scope).state;
  }

  async close(scope: BrowserScope) {
    if (!this.sessions.has(scope.sessionId)) return;
    const live = this.require(scope);
    if (live.signal && live.abortListener) live.signal.removeEventListener("abort", live.abortListener);
    if (live.state !== "closed") {
      live.state = "closed";
      await live.context.close().catch(() => undefined);
      await live.browser.close().catch(() => undefined);
    }
    this.sessions.delete(scope.sessionId);
  }

  async crashForTest(scope: BrowserScope) {
    const live = this.require(scope);
    if (live.signal && live.abortListener) live.signal.removeEventListener("abort", live.abortListener);
    live.state = "crashed";
    await live.browser.close();
    this.sessions.delete(scope.sessionId);
  }

  async bindObservationCapabilities(scope: BrowserScope, input: {
    observationId: string; observationHash: string; pageRevision: string; controls: SemanticControl[];allowedDestinationUrls:string[];
  }) {
    const live = this.requireHealthy(scope);
    if (input.pageRevision !== await this.revision(live.page)) throw new StaleObservationError("handle");
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    return input.controls.map((control) => {
      const binding = live.handles.get(control.handle);
      if (!binding?.destinationUrl || control.safeAction !== "follow" || !urlInSet(binding.destinationUrl,input.allowedDestinationUrls)) {
        return {...control,safeAction:control.safeAction==="follow"?"unknown":control.safeAction,interactionCapability:undefined};
      }
      const capability = this.createCapability(live, {
        observationId:input.observationId,observationHash:input.observationHash,pageRevision:input.pageRevision,
        actionClass:"follow_read_link",effect:"read_navigation",
        target:{kind:"element",handle:control.handle,destinationUrl:binding.destinationUrl},expiresAt
      });
      return { ...control, destinationUrl:binding.destinationUrl, interactionCapability:capability.token };
    });
  }

  async navigate(scope: BrowserScope, url: string) {
    const live = this.requireHealthy(scope);
    live.blockedNavigation = undefined;
    await this.assertRequestAllowed(live, url);
    try {
      await live.page.goto(url, { waitUntil: "networkidle" });
    } catch (error) {
      throw new BrowserPostDispatchError(live.blockedNavigation ? `redirect blocked: ${live.blockedNavigation}` : errorMessage(error));
    }
    if (live.blockedNavigation) throw new BrowserPostDispatchError(`redirect blocked: ${live.blockedNavigation}`);
    try { this.assertFinalOrigin(live); } catch (error) { throw new BrowserPostDispatchError(errorMessage(error)); }
    this.invalidateTransientBindings(live);
    return this.observe(live, "page_state");
  }

  async inspectDom(scope: BrowserScope) {
    return this.observe(this.requireHealthy(scope), "dom");
  }

  async inspectAccessibilityTree(scope: BrowserScope) {
    return this.observe(this.requireHealthy(scope), "accessibility");
  }

  async followLink(scope: BrowserScope, handle: string, observationRevision: string, capabilityToken: string) {
    const live = this.requireHealthy(scope);
    const binding = live.handles.get(handle);
    if (!binding || binding.revision !== observationRevision || (await this.revision(live.page)) !== observationRevision) {
      throw new StaleObservationError("handle");
    }
    const capability = this.requireCapability(live, capabilityToken, "follow_read_link");
    if (capability.target.kind !== "element" || capability.target.handle !== handle) throw new BrowserPreDispatchError("interaction target mismatch");
    await this.assertRequestAllowed(live, capability.target.destinationUrl);
    live.blockedNavigation = undefined;
    live.capabilities.delete(capability.token);
    await live.page.locator("a,button,input,select,textarea").nth(binding.index).click();
    await live.page.waitForLoadState("networkidle").catch(() => undefined);
    if (live.blockedNavigation) throw new BrowserPostDispatchError(`redirect blocked: ${live.blockedNavigation}`);
    try { this.assertFinalOrigin(live); } catch (error) { throw new BrowserPostDispatchError(errorMessage(error)); }
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
    this.invalidateTransientBindings(live);
    return this.observe(live, "page_state");
  }

  async screenshot(scope: BrowserScope): Promise<ScreenshotData> {
    const live = this.requireHealthy(scope);
    const base = await this.observe(live, "screenshot", true);
    const token = makeId("screenshot", scope.runId, base.pageRevision, live.screenshots.size + 1);
    const position = await live.page.evaluate(() => ({ x:scrollX,y:scrollY }));
    live.screenshots.set(token, { revision: base.pageRevision, url: base.url, scrollX:position.x,scrollY:position.y,viewport:JSON.stringify(live.scope.viewport) });
    return {
      ...base,
      screenshotObservationToken: token,
      viewport: structuredClone(live.scope.viewport)
    };
  }

  async movePointer(
    scope: BrowserScope,
    input: { x: number; y: number; screenshotToken: string; pageRevision: string; capability: InteractionCapability }
  ) {
    const live = this.requireHealthy(scope);
    await this.assertScreenshot(live, input.screenshotToken, input.pageRevision);
    this.assertCoordinates(live, input.x, input.y);
    const capability=this.requireCapability(live,input.capability.token,"pointer_only");
    if (capability.target.kind!=="coordinates" || capability.target.x!==input.x || capability.target.y!==input.y) {
      throw new BrowserPreDispatchError("interaction target mismatch");
    }
    live.capabilities.delete(capability.token);
    await live.page.mouse.move(input.x, input.y);
    return this.observe(live, "page_state");
  }

  async click(
    scope: BrowserScope,
    input: { x: number; y: number; screenshotToken: string; pageRevision: string; capability: InteractionCapability }
  ) {
    const live = this.requireHealthy(scope);
    await this.assertScreenshot(live, input.screenshotToken, input.pageRevision);
    this.assertCoordinates(live, input.x, input.y);
    const capability = this.requireCapability(live,input.capability.token,"visual_read_link");
    if (capability.target.kind !== "coordinates" || capability.target.x !== input.x || capability.target.y !== input.y) {
      throw new BrowserPreDispatchError("interaction target mismatch");
    }
    live.blockedNavigation = undefined;
    const beforeUrl = live.page.url();
    live.capabilities.delete(capability.token);
    await live.page.mouse.click(input.x, input.y);
    await Promise.race([
      live.page.waitForURL((candidate) => candidate.toString() !== beforeUrl, { timeout: 1_000 }).catch(() => undefined),
      live.page.waitForTimeout(250)
    ]);
    await live.page.waitForLoadState("networkidle").catch(() => undefined);
    if (live.blockedNavigation) throw new BrowserPostDispatchError(`redirect blocked: ${live.blockedNavigation}`);
    try { this.assertFinalOrigin(live); } catch (error) { throw new BrowserPostDispatchError(errorMessage(error)); }
    this.invalidateTransientBindings(live);
    return this.observe(live, "page_state");
  }

  async issueVisualCapability(scope: BrowserScope, input: {
    action:"click"|"move_pointer";x:number;y:number;screenshotToken:string;screenshotObservationId:string;
    screenshotHash:string;pageRevision:string;allowedDestinationUrls:string[];
  }): Promise<InteractionCapability | null> {
    const live = this.requireHealthy(scope);
    await this.assertScreenshot(live,input.screenshotToken,input.pageRevision);
    this.assertCoordinates(live,input.x,input.y);
    let destinationUrl: string | undefined;
    let actionClass: InteractionCapability["actionClass"] = "pointer_only";
    let effect: InteractionCapability["effect"] = "pointer_only";
    if (input.action === "click") {
      const hit = await live.page.evaluate(({x,y}) => {
        const element = document.elementFromPoint(x,y);
        const link = element?.closest("a[href]") as HTMLAnchorElement | null;
        return link?{href:link.href,download:link.hasAttribute("download"),target:link.target}:null;
      },{x:input.x,y:input.y});
      if (!hit?.href || hit.download || (hit.target && hit.target!=="_self")) return null;
      const href=hit.href;
      await this.assertRequestAllowed(live,href);
      if (!urlInSet(href,input.allowedDestinationUrls)) return null;
      destinationUrl = href;
      actionClass = "visual_read_link";
      effect = "read_navigation";
    }
    return this.createCapability(live,{
      observationId:input.screenshotObservationId,observationHash:input.screenshotHash,pageRevision:input.pageRevision,
      actionClass,effect,target:{kind:"coordinates",x:input.x,y:input.y,destinationUrl},
      viewport:structuredClone(live.scope.viewport),expiresAt:new Date(Date.now()+30_000).toISOString()
    });
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
    live.signal?.throwIfAborted();
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
    live.capabilities.clear();
  }

  private async assertScreenshot(live: LiveSession, token: string, revision: string) {
    const captured = live.screenshots.get(token);
    if (!captured || captured.revision !== revision || captured.url !== live.page.url()) {
      throw new StaleObservationError("screenshot");
    }
    if ((await this.revision(live.page)) !== revision) throw new StaleObservationError("screenshot");
    const position = await live.page.evaluate(() => ({ x:scrollX,y:scrollY }));
    if (captured.scrollX !== position.x || captured.scrollY !== position.y || captured.viewport !== JSON.stringify(live.scope.viewport)) {
      throw new StaleObservationError("screenshot");
    }
  }

  private assertCoordinates(live: LiveSession, x: number, y: number) {
    if (x < 0 || y < 0 || x >= live.scope.viewport.width || y >= live.scope.viewport.height) {
      throw new BrowserScopeError("coordinates outside captured viewport");
    }
  }

  private async revision(page: Page) {
    const state = await page.evaluate(() => ({x:scrollX,y:scrollY,width:innerWidth,height:innerHeight,scale:devicePixelRatio}));
    return sha256Text(`${page.url()}\n${JSON.stringify(state)}\n${await page.content()}`);
  }

  private createCapability(live: LiveSession, input: Omit<InteractionCapability,"token"|"tenantId"|"runId"|"browserGeneration"|"pageId">) {
    const capability: InteractionCapability = {
      ...input,tenantId:live.scope.tenantId,runId:live.scope.runId,browserGeneration:live.scope.generation,pageId:live.scope.pageId,
      token:makeId("interaction",live.scope.tenantId,live.scope.runId,live.scope.generation,live.scope.pageId,input.observationId,
        input.observationHash,input.pageRevision,input.actionClass,JSON.stringify(input.target),input.expiresAt)
    };
    live.capabilities.set(capability.token,capability);
    return structuredClone(capability);
  }

  private requireCapability(live: LiveSession, token: string, actionClass: InteractionCapability["actionClass"]) {
    const capability=live.capabilities.get(token);
    if (!capability || capability.actionClass!==actionClass || capability.tenantId!==live.scope.tenantId || capability.runId!==live.scope.runId ||
      capability.browserGeneration!==live.scope.generation || capability.pageId!==live.scope.pageId ||
      new Date(capability.expiresAt).getTime()<=Date.now()) throw new BrowserPreDispatchError("invalid or expired interaction capability");
    return capability;
  }

  private async assertRequestAllowed(live: LiveSession, value: string) {
    if (value === "about:blank") return;
    let url: URL;
    try { url=new URL(value); } catch { throw new BrowserPreDispatchError("invalid request URL"); }
    if (url.protocol!=="http:" && url.protocol!=="https:") throw new BrowserPreDispatchError(`scheme denied: ${url.protocol}`);
    if (!live.allowedOrigins.has(url.origin)) throw new BrowserPreDispatchError(`origin denied: ${url.origin}`);
    if (this.options.testOnlyPrivateNetwork) return;
    const addresses = await resolveAddresses(url.hostname);
    if (addresses.length===0 || addresses.some(isPrivateAddress)) throw new BrowserPreDispatchError(`private or unresolved address denied: ${url.hostname}`);
    const resolved=addresses.sort().join(",");
    const pinned=live.pinnedAddresses.get(url.hostname);
    if (pinned && pinned!==resolved) throw new BrowserPreDispatchError(`DNS rebinding denied: ${url.hostname}`);
    live.pinnedAddresses.set(url.hostname,resolved);
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
    const pageRevision = await this.revision(page);
    const controls: SemanticControl[] = [];
    live.handles.clear();
    live.capabilities.clear();
    const elements = page.locator("a,button,input,select,textarea");
    const count = Math.min(await elements.count(), 40);
    for (let index = 0; index < count; index += 1) {
      const element = elements.nth(index);
      if (!(await element.isVisible().catch(() => false))) continue;
      if ((await element.getAttribute("aria-hidden")) === "true") continue;
      const tag = await element.evaluate((node) => node.tagName.toLowerCase());
      const label = (
        (await element.getAttribute("aria-label")) ??
        (await element.getAttribute("title")) ??
        (await element.getAttribute("placeholder")) ??
        (await element.innerText().catch(() => ""))
      ).trim();
      const handle = makeId("handle", live.scope.sessionId, pageRevision, index, label);
      const destinationUrl = tag === "a" ? await element.getAttribute("href").then((href) => href ? new URL(href,url).toString() : undefined) : undefined;
      const isDownload = tag === "a" && (await element.getAttribute("download")) !== null;
      const target = tag === "a" ? await element.getAttribute("target") : null;
      const opensNewContext = Boolean(target && target.toLowerCase() !== "_self");
      const destinationAllowed = destinationUrl
        ? await this.isRequestAllowed(live,destinationUrl) && !isDownload && !opensNewContext
        : false;
      live.handles.set(handle, { index, revision: pageRevision, destinationUrl:destinationAllowed ? destinationUrl : undefined });
      controls.push({
        handle,
        kind: tag === "a" ? "link" : tag === "button" ? "button" : tag === "input" ? "input" : "other",
        label: label.slice(0, 160),
        destinationUrl:destinationAllowed ? destinationUrl : undefined,
        safeAction: /publish|send|buy|delete|save/i.test(label) ? "forbidden" : tag === "a" && destinationAllowed ? "follow" : "unknown"
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

  private async isRequestAllowed(live: LiveSession,value:string) { try { await this.assertRequestAllowed(live,value); return true; } catch { return false; } }
}

async function resolveAddresses(hostname:string): Promise<string[]> {
  if (isIP(hostname)) return [hostname];
  try { return (await lookup(hostname,{all:true,verbatim:true})).map((entry)=>entry.address); } catch { return []; }
}

function isPrivateAddress(address:string): boolean {
  const normalized=address.toLowerCase();
  if (normalized.startsWith("::ffff:")) return isPrivateAddress(normalized.slice(7));
  if (isIP(normalized)===4) {
    const [a,b]=normalized.split(".").map(Number);
    return a===0 || a===10 || a===127 || (a===100 && b>=64 && b<=127) || (a===169 && b===254) ||
      (a===172 && b>=16 && b<=31) || (a===192 && b===168) || (a===198 && (b===18 || b===19)) || a>=224;
  }
  return normalized==="::" || normalized==="::1" || normalized.startsWith("fc") || normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) || normalized.startsWith("ff");
}

function errorMessage(error:unknown) { return error instanceof Error ? error.message : String(error); }
function urlInSet(value:string,allowed:string[]) {
  try {
    const actual=new URL(value);actual.hash="";
    return allowed.some((candidate)=>{const expected=new URL(candidate);expected.hash="";return expected.toString()===actual.toString();});
  } catch { return false; }
}
