import type { Browser, BrowserContext, CDPSession, Page } from "@playwright/test";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import type { ChallengeState, InteractionCapability, SemanticControl } from "./contracts";
import { makeId } from "./contracts";
import { sha256Text } from "./observations";
import { classifyBrowserChallenge } from "./challenge-classifier";
import type { BrowserSessionState } from "./auth-profile";
import type { AuthenticatedBootstrapObserver,AuthenticatedSiteAdapter,AuthenticatedSiteDetection,AuthenticatedSiteSnapshot } from "./authenticated-site";
import type { CredentialMaterial } from "./auth-profile";

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
  observationSource: "CDP_DOM_SNAPSHOT" | "CDP_ACCESSIBILITY_TREE" | "CDP_SCREENSHOT";
  protocolSnapshotVersion: string;
  controls: SemanticControl[];
  challengeState: ChallengeState;
  httpStatus?: number;
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
    authenticatedSessionState?: BrowserSessionState;
    signal?: AbortSignal;
  }): Promise<BrowserAllocation>;
  exportAuthenticatedSession?(scope: BrowserScope): Promise<BrowserSessionState>;
  attachAuthenticatedSession?(scope: BrowserScope,state:BrowserSessionState): Promise<void>;
  detectAuthenticatedState?(scope:BrowserScope,adapter:AuthenticatedSiteAdapter):Promise<AuthenticatedSiteDetection>;
  establishAuthenticatedSession?(scope:BrowserScope,adapter:AuthenticatedSiteAdapter,credential:CredentialMaterial):Promise<AuthenticatedSiteDetection>;
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

export type BrowserBackendName = "local" | "cloudflare";

export interface BrowserBackendEnvironment {
  DISTILLED_BROWSER_BACKEND?: string;
}

export interface CloudflareBrowserBinding {}

export interface CloudflareBrowserLaunchPolicy {
  allowedDomains: string[];
}

export type CloudflareBrowserLauncher = (
  binding: CloudflareBrowserBinding,
  policy: CloudflareBrowserLaunchPolicy
) => Promise<Browser>;

export interface BrowserBackendSelection {
  backend: BrowserBackendName;
  executor: PlaywrightBrowserAdapter;
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
  authenticationWriteOrigins?:Set<string>;
  authenticationBootstrap?:boolean;
  handles: Map<string, { index: number; revision: string; destinationUrl?: string }>;
  screenshots: Map<string, { revision: string; url: string; scrollX: number; scrollY: number; viewport: string }>;
  capabilities: Map<string, InteractionCapability>;
  pinnedAddresses: Map<string, string>;
  signal?: AbortSignal;
  abortListener?: () => void;
  state: "healthy" | "crashed" | "closed";
  blockedRequest?: { method: string; url: string };
  cdp: CDPSession;
  lastMainDocumentStatus?: number;
  httpRequestCount: number;
}

interface BrowserObservationProvider {
  capture(live: LiveSession, image?: boolean): Promise<TrustedBrowserObservation>;
}

interface TrustedBrowserObservation {
  url: string;
  title: string;
  pageRevision: string;
  contentType: string;
  raw: Uint8Array;
  controls: SemanticControl[];
  visibleText: string;
  markup: string;
  watermarkObserved: boolean;
  article?: BrowserObservationData["article"];
  observationSource: BrowserObservationData["observationSource"];
  protocolSnapshotVersion: string;
}

interface SnapshotDocument {
  documentURL?: number;
  title?: number;
  baseURL?: number;
  nodes: {
    parentIndex?: number[];
    nodeName: number[];
    nodeValue: number[];
    backendNodeId?: number[];
    attributes?: number[][];
  };
  layout?: {
    nodeIndex: number[];
    bounds?: number[][];
  };
}

interface DomNodeSnapshot {
  index: number;
  parent: number;
  name: string;
  value: string;
  backendNodeId?: number;
  attributes: Map<string, string>;
  children: number[];
  geometry?: { x: number; y: number; width: number; height: number };
}

const READ_ONLY_BROWSER_METHODS = new Set(["GET", "HEAD"]);
const MAX_HTTP_REQUESTS_PER_SESSION = 200;
const ACTIVE_TRANSPORT_HARDENING = `(() => {
  const deny = name => {
    try { Object.defineProperty(globalThis, name, { value: undefined, writable: false, configurable: false }); } catch {}
  };
  for (const name of ['WebSocket','WebTransport','RTCPeerConnection','webkitRTCPeerConnection','Worker','SharedWorker','EventSource']) deny(name);
  try { Object.defineProperty(globalThis, 'open', { value: undefined, writable: false, configurable: false }); } catch {}
  try { Object.defineProperty(Navigator.prototype, 'serviceWorker', { value: undefined, writable: false, configurable: false }); } catch {}
})();`;

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
export class BrowserNavigationError extends BrowserPostDispatchError{constructor(public readonly code:"NAVIGATION_TIMEOUT"|"UNEXPECTED_AUTH_ORIGIN"|"NETWORK_POLICY_DENIED"|"INITIAL_NAVIGATION_FAILED"){super(code);this.name="BrowserNavigationError";}}
export class BrowserAllocationError extends BrowserScopeError{constructor(public readonly code:"BROWSER_ALLOCATION_FAILED"|"BROWSER_CONTEXT_INITIALIZATION_FAILED",options?:{cause?:unknown}){super(code);this.name="BrowserAllocationError";if(options?.cause!==undefined)this.cause=options.cause;}}

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
  private readonly observationProvider: BrowserObservationProvider = new CdpBrowserObservationProvider();

  constructor(private readonly options: {
    testOnlyPrivateNetwork?: true;
    launchBrowser?: (options: { headless: boolean; args: string[]; allowedDomains: string[] }) => Promise<Browser>;
  } = {}) {
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
    authenticatedSessionState?: BrowserSessionState;
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
    const launchOptions = { headless: true, args: [
      "--disable-features=WebTransport,WebTransportDeveloperMode",
      "--disable-quic",
      "--disable-webrtc",
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
      ...(resolverRules.length ? [`--host-resolver-rules=${resolverRules.join(",")}`] : [])
    ], allowedDomains:[...new Set([...normalizedOrigins].map((origin)=>new URL(origin).hostname))] };
    let browser:Browser;try{browser=this.options.launchBrowser
      ? await this.options.launchBrowser(launchOptions)
      : await launchLocalChromium(launchOptions)}catch(error){throw new BrowserAllocationError("BROWSER_ALLOCATION_FAILED",{cause:error})}
    let context:BrowserContext;let page:Page;try{context=await browser.newContext({
      viewport: { width: 960, height: 720 },
      deviceScaleFactor: 1,
      serviceWorkers: "block",
      acceptDownloads: false,
      storageState: input.authenticatedSessionState
    });
    await context.addInitScript({ content: ACTIVE_TRANSPORT_HARDENING });
    page = await context.newPage();}catch(error){await browser.close().catch(()=>undefined);throw new BrowserAllocationError("BROWSER_CONTEXT_INITIALIZATION_FAILED",{cause:error})}
    page.setDefaultTimeout(10_000);
    page.setDefaultNavigationTimeout(15_000);
    const cdp = await context.newCDPSession(page);
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
      cdp,
      httpRequestCount:0,
      signal:input.signal,
      state: "healthy"
    };
    await context.route("**/*", async (route) => {
      const request = route.request();
      try {
        if (request.frame().page() !== live.page) throw new BrowserPreDispatchError("new browser context denied");
        live.httpRequestCount+=1;
        if (live.httpRequestCount>MAX_HTTP_REQUESTS_PER_SESSION) throw new BrowserPreDispatchError("browser HTTP request budget exhausted");
        if (request.resourceType()==="eventsource") throw new BrowserPreDispatchError("EventSource transport denied");
        await this.assertRequestAllowed(live, request.url(), request.method());
        await route.continue();
      } catch {
        live.blockedRequest = { method: request.method(), url: request.url() };
        await route.abort("blockedbyclient");
      }
    });
    await context.routeWebSocket("**/*", async (webSocket) => {
      live.blockedRequest = { method: "WEBSOCKET", url: webSocket.url() };
      await webSocket.close({ code: 1008, reason: "active transport denied" });
    });
    page.on("download", (download) => {
      live.blockedRequest = { method: "DOWNLOAD", url: download.url() };
      void download.cancel().catch(() => undefined);
    });
    page.on("response", (response) => {
      const request = response.request();
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) live.lastMainDocumentStatus = response.status();
    });
    this.sessions.set(sessionId, live);
    context.on("page",(opened)=>{
      if (opened===page) return;
      live.blockedRequest={method:"POPUP",url:opened.url()};
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

  async exportAuthenticatedSession(scope: BrowserScope): Promise<BrowserSessionState> {
    const live=this.requireHealthy(scope);
    return await live.context.storageState() as BrowserSessionState;
  }

  async attachAuthenticatedSession(scope:BrowserScope,state:BrowserSessionState){
    const live=this.requireHealthy(scope);
    const allowedCookies=state.cookies.filter((cookie)=>[...live.allowedOrigins].some((origin)=>domainMatches(cookie.domain,new URL(origin).hostname)));
    if(allowedCookies.length!==state.cookies.length||state.origins.some((entry)=>!live.allowedOrigins.has(new URL(entry.origin).origin)))throw new BrowserPreDispatchError("authenticated session origin denied");
    await live.context.addCookies(allowedCookies);
    for(const entry of state.origins){await live.page.goto(entry.origin);for(const item of entry.localStorage)await live.cdp.send("DOMStorage.setDOMStorageItem",{storageId:{securityOrigin:entry.origin,isLocalStorage:true},key:item.name,value:item.value});}
    this.invalidateTransientBindings(live);
  }

  async detectAuthenticatedState(scope:BrowserScope,adapter:AuthenticatedSiteAdapter){return adapter.detect(await this.authenticationSnapshot(this.requireHealthy(scope)));}

  async establishAuthenticatedSession(scope:BrowserScope,adapter:AuthenticatedSiteAdapter,credential:CredentialMaterial,observer?:AuthenticatedBootstrapObserver){
    const live=this.requireHealthy(scope);
    if(!adapter.allowedOrigins.every((origin)=>live.allowedOrigins.has(origin)))throw new BrowserPreDispatchError("site adapter origin outside browser policy");
    const writeOrigins=new Set(adapter.authenticationWriteOrigins??adapter.allowedOrigins);if([...writeOrigins].some(origin=>!live.allowedOrigins.has(origin)))throw new BrowserPreDispatchError("site authentication origin outside browser policy");live.authenticationWriteOrigins=writeOrigins;live.authenticationBootstrap=true;
    try{return await adapter.bootstrap({goto:async(url,options)=>{await this.navigateDirectly(live,url,options?.waitUntil)},fill:async(selector,value)=>{await live.page.locator(selector).fill(value)},fillControl:async(control,value)=>{const observed=await this.authenticationSnapshot(live);if(!observed.controls.some(candidate=>candidate.role===control.role&&candidate.label.trim()===control.label))throw new BrowserPreDispatchError("authentication control no longer present");await live.page.getByRole(control.role,{name:control.label,exact:true}).fill(value)},click:async(selector)=>{await live.page.locator(selector).click()},clickControl:async(control)=>{const observed=await this.authenticationSnapshot(live);if(!observed.controls.some(candidate=>candidate.role===control.role&&candidate.label.trim()===control.label))throw new BrowserPreDispatchError("authentication control no longer present");await live.page.getByRole(control.role,{name:control.label,exact:true}).click()},waitForPasswordSurface:async()=>{await live.page.locator('input[type="password"]').waitFor({state:"visible",timeout:10_000})},snapshot:async()=>this.authenticationSnapshot(live),importSession:async(state)=>this.attachAuthenticatedSession(scope,state),exportSession:async()=>this.exportAuthenticatedSession(scope)},credential,observer)}finally{live.authenticationBootstrap=false;live.authenticationWriteOrigins=undefined;}
  }

  private async authenticationSnapshot(live:LiveSession):Promise<AuthenticatedSiteSnapshot>{const observed=await this.observationProvider.capture(live);return{url:observed.url,title:observed.title,visibleText:observed.visibleText,controls:observed.controls.map(control=>({role:control.role,label:control.label,type:control.attributes?.type}))};}

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
    if (input.pageRevision !== await this.revision(live)) throw new StaleObservationError("handle");
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
    return this.navigateDirectly(live, url);
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
    if (!binding || binding.revision !== observationRevision || (await this.revision(live)) !== observationRevision) {
      throw new StaleObservationError("handle");
    }
    const capability = this.requireCapability(live, capabilityToken, "follow_read_link");
    if (capability.target.kind !== "element" || capability.target.handle !== handle) throw new BrowserPreDispatchError("interaction target mismatch");
    if (!capability.target.destinationUrl) throw new BrowserPreDispatchError("read-navigation capability has no destination");
    await this.assertRequestAllowed(live, capability.target.destinationUrl, "GET");
    live.capabilities.delete(capability.token);
    return this.navigateDirectly(live, capability.target.destinationUrl);
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
    const position = await this.viewportState(live);
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
    if (!capability.target.destinationUrl) throw new BrowserPreDispatchError("visual read-navigation capability has no destination");
    await this.assertRequestAllowed(live, capability.target.destinationUrl, "GET");
    live.capabilities.delete(capability.token);
    return this.navigateDirectly(live, capability.target.destinationUrl);
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
      const hit = await this.trustedAnchorAt(live, input.x, input.y);
      if (!hit?.href || hit.download || (hit.target && hit.target!=="_self")) return null;
      const href=hit.href;
      this.assertGroundedDestination(live,href);
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
    if ((await this.revision(live)) !== revision) throw new StaleObservationError("screenshot");
    const position = await this.viewportState(live);
    if (captured.scrollX !== position.x || captured.scrollY !== position.y || captured.viewport !== JSON.stringify(live.scope.viewport)) {
      throw new StaleObservationError("screenshot");
    }
  }

  private assertCoordinates(live: LiveSession, x: number, y: number) {
    if (x < 0 || y < 0 || x >= live.scope.viewport.width || y >= live.scope.viewport.height) {
      throw new BrowserScopeError("coordinates outside captured viewport");
    }
  }

  private async revision(live: LiveSession) {
    const snapshot = await live.cdp.send("DOMSnapshot.captureSnapshot", {
      computedStyles: [],
      includeDOMRects: false,
      includePaintOrder: false
    }) as { documents: SnapshotDocument[]; strings: string[] };
    return snapshotRevision(live.page.url(), snapshot.documents[0], snapshot.strings);
  }

  private async viewportState(live: LiveSession) {
    const result = await live.cdp.send("Page.getLayoutMetrics") as {
      visualViewport: { pageX: number; pageY: number; clientWidth: number; clientHeight: number; scale: number };
    };
    return {
      x: result.visualViewport.pageX,
      y: result.visualViewport.pageY,
      width: result.visualViewport.clientWidth,
      height: result.visualViewport.clientHeight,
      scale: result.visualViewport.scale
    };
  }

  private async trustedAnchorAt(live: LiveSession, x: number, y: number) {
    const located = await live.cdp.send("DOM.getNodeForLocation", {
      x: Math.floor(x), y: Math.floor(y), includeUserAgentShadowDOM: true, ignorePointerEventsNone: false
    }) as { backendNodeId?: number };
    if (!located.backendNodeId) return null;
    const described = await live.cdp.send("DOM.describeNode", {
      backendNodeId: located.backendNodeId, depth: 0, pierce: true
    }) as { node: { nodeName: string; attributes?: string[] } };
    if (described.node.nodeName.toLowerCase() !== "a") return null;
    const attributes = new Map<string,string>();
    const values = described.node.attributes ?? [];
    for (let index = 0; index + 1 < values.length; index += 2) {
      attributes.set(values[index].toLowerCase(), values[index + 1]);
    }
    const rawHref = attributes.get("href");
    if (!rawHref) return null;
    return {
      href: new URL(rawHref, live.page.url()).toString(),
      download: attributes.has("download"),
      target: attributes.get("target") ?? ""
    };
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

  private async navigateDirectly(live: LiveSession, destinationUrl: string,waitUntil:"networkidle"|"domcontentloaded"="networkidle") {
    live.blockedRequest = undefined;
    await this.assertRequestAllowed(live, destinationUrl, "GET");
    try {
      const response = await live.page.goto(destinationUrl, { waitUntil });
      live.lastMainDocumentStatus = response?.status();
    } catch (error) {
      if(live.blockedRequest)throw new BrowserNavigationError("NETWORK_POLICY_DENIED");
      if(error instanceof Error&&(error.name==="TimeoutError"||/timeout/i.test(error.message)))throw new BrowserNavigationError("NAVIGATION_TIMEOUT");
      throw new BrowserNavigationError("INITIAL_NAVIGATION_FAILED");
    }
    if (live.blockedRequest) throw new BrowserNavigationError("NETWORK_POLICY_DENIED");
    try { this.assertFinalOrigin(live); } catch { throw new BrowserNavigationError("UNEXPECTED_AUTH_ORIGIN"); }
    this.invalidateTransientBindings(live);
    return this.observe(live, "page_state");
  }

  private async assertRequestAllowed(live: LiveSession, value: string, method = "GET") {
    const normalizedMethod = method.toUpperCase();
    if (value === "about:blank") return;
    let url: URL;
    try { url=new URL(value); } catch { throw new BrowserPreDispatchError("invalid request URL"); }
    if (url.protocol!=="http:" && url.protocol!=="https:") throw new BrowserPreDispatchError(`scheme denied: ${url.protocol}`);
    if (!live.allowedOrigins.has(url.origin)) throw new BrowserPreDispatchError(`origin denied: ${url.origin}`);
    if (!READ_ONLY_BROWSER_METHODS.has(normalizedMethod)&&!(normalizedMethod==="POST"&&live.authenticationBootstrap&&live.authenticationWriteOrigins?.has(url.origin)))throw new BrowserPreDispatchError(`browser request method denied: ${normalizedMethod}`);
    if (this.options.testOnlyPrivateNetwork) return;
    const pinned=live.pinnedAddresses.get(url.hostname);
    if (!pinned) throw new BrowserPreDispatchError(`hostname was not pinned at allocation: ${url.hostname}`);
  }

  private assertGroundedDestination(live:LiveSession,value:string) {
    let url:URL;
    try { url=new URL(value); } catch { throw new BrowserPreDispatchError("invalid grounded destination URL"); }
    if ((url.protocol!=="http:"&&url.protocol!=="https:")||!live.allowedOrigins.has(url.origin)) {
      throw new BrowserPreDispatchError("grounded destination is outside the admitted HTTP(S) origins");
    }
  }

  private async observe(
    live: LiveSession,
    kind: "dom" | "accessibility" | "page_state" | "screenshot" | "article",
    image = false
  ): Promise<BrowserObservationData> {
    live.handles.clear();
    live.capabilities.clear();
    const observed = await this.observationProvider.capture(live, image);
    const controls: SemanticControl[] = [];
    for (const [index, control] of observed.controls.entries()) {
      const destinationAllowed = control.destinationUrl
        ? await this.isRequestAllowed(live, control.destinationUrl) && control.safeAction === "follow"
        : false;
      const handle = makeId("handle", live.scope.sessionId, observed.pageRevision, index, control.label);
      live.handles.set(handle, {
        index,
        revision: observed.pageRevision,
        destinationUrl: destinationAllowed ? control.destinationUrl : undefined
      });
      controls.push({
        ...control,
        handle,
        destinationUrl: destinationAllowed ? control.destinationUrl : undefined,
        safeAction: /publish|send|buy|delete|save/i.test(control.label)
          ? "forbidden"
          : control.kind === "link" && destinationAllowed
            ? "follow"
            : control.safeAction === "forbidden"
              ? "forbidden"
              : "unknown"
      });
    }
    const challengeState = classifyBrowserChallenge({
      url: observed.url,
      title: observed.title,
      bodyText: observed.visibleText,
      markup: observed.markup,
      httpStatus: live.lastMainDocumentStatus
    });
    const representation = {
      url: observed.url,
      title: observed.title,
      controls,
      challengeState,
      httpStatus: live.lastMainDocumentStatus,
      watermarkObserved: observed.watermarkObserved,
      observationSource: observed.observationSource,
      protocolSnapshotVersion: observed.protocolSnapshotVersion,
      article: observed.article
        ? {
            title: observed.article.title,
            canonicalUrl: observed.article.canonicalUrl,
            publisherTimestamp: observed.article.publisherTimestamp,
            excerpt: observed.article.excerpt,
            body: observed.article.body.slice(0, 4_000)
          }
        : undefined,
      visibleText: observed.visibleText.slice(0, 4_000)
    };
    return {
      url: observed.url,
      finalUrl: observed.url,
      title: observed.title,
      pageId: live.scope.pageId,
      pageRevision: observed.pageRevision,
      contentType: observed.contentType,
      raw: observed.raw,
      representation,
      observationSource: observed.observationSource,
      protocolSnapshotVersion: observed.protocolSnapshotVersion,
      controls,
      challengeState,
      watermarkObserved: observed.watermarkObserved,
      article: observed.article
    };
  }

  private async isRequestAllowed(live: LiveSession,value:string) { try { await this.assertRequestAllowed(live,value); return true; } catch { return false; } }
}

export class LocalPlaywrightBrowserExecutor extends PlaywrightBrowserAdapter {
  constructor(options: { testOnlyPrivateNetwork?: true } = {}) {
    super(options);
  }

  static forTest(): LocalPlaywrightBrowserExecutor {
    if (typeof process === "undefined" || process.env.NODE_ENV !== "test") {
      throw new Error("private-network browser access is test-only");
    }
    return new LocalPlaywrightBrowserExecutor({ testOnlyPrivateNetwork: true });
  }
}

export class CloudflareBrowserExecutor extends PlaywrightBrowserAdapter {
  constructor(input: { binding: CloudflareBrowserBinding; launch: CloudflareBrowserLauncher }) {
    super({ launchBrowser: (options) => input.launch(input.binding,{allowedDomains:options.allowedDomains}) });
  }
}

export function selectBrowserBackend(input: {
  environment: BrowserBackendEnvironment;
  cloudflare?: { binding?: CloudflareBrowserBinding; launch?: CloudflareBrowserLauncher };
}): BrowserBackendSelection {
  const backend = parseBrowserBackend(input.environment.DISTILLED_BROWSER_BACKEND ?? "local");
  if (backend === "local") return { backend, executor: new LocalPlaywrightBrowserExecutor() };
  if (!input.cloudflare?.binding || !input.cloudflare.launch) {
    throw new Error("Cloudflare browser backend requires a Browser binding and launcher");
  }
  return {
    backend,
    executor: new CloudflareBrowserExecutor({ binding: input.cloudflare.binding, launch: input.cloudflare.launch })
  };
}

function parseBrowserBackend(value: string): BrowserBackendName {
  const normalized = value.trim().toLowerCase();
  if (normalized === "local" || normalized === "cloudflare") return normalized;
  throw new Error("DISTILLED_BROWSER_BACKEND must be local or cloudflare");
}

async function launchLocalChromium(options: {
  headless: boolean;
  args: string[];
}): Promise<Browser> {
  const packageName = "@playwright/test";
  const { chromium } = await import(packageName);
  return await chromium.launch(options);
}

class CdpBrowserObservationProvider implements BrowserObservationProvider {
  async capture(live: LiveSession, image = false): Promise<TrustedBrowserObservation> {
    const snapshot = await live.cdp.send("DOMSnapshot.captureSnapshot", {
      computedStyles: ["display", "visibility", "opacity"],
      includeDOMRects: true,
      includePaintOrder: false
    }) as { documents: SnapshotDocument[]; strings: string[] };
    const ax = await live.cdp.send("Accessibility.getFullAXTree", {}) as {
      nodes?: Array<{
        backendDOMNodeId?: number;
        role?: { value?: string };
        name?: { value?: string };
      }>;
    };
    const document = snapshot.documents[0];
    if (!document) throw new BrowserPreDispatchError("browser protocol snapshot did not include a document");
    const nodes = buildNodeTree(document, snapshot.strings);
    const axByBackend = new Map<number, { role?: string; name?: string }>();
    for (const node of ax.nodes ?? []) {
      if (typeof node.backendDOMNodeId === "number") {
        axByBackend.set(node.backendDOMNodeId, {
          role: typeof node.role?.value === "string" ? node.role.value : undefined,
          name: typeof node.name?.value === "string" ? node.name.value : undefined
        });
      }
    }
    const pageUrl = stringAt(snapshot.strings, document.documentURL) || live.page.url();
    const baseUrl = stringAt(snapshot.strings, document.baseURL) || pageUrl;
    const title = stringAt(snapshot.strings, document.title) || textOf(firstByName(nodes, "title"), nodes);
    const visibleText = collapseWhitespace(textOf(firstByName(nodes, "body"), nodes));
    const controls = discoverControls(nodes, axByBackend, pageUrl, baseUrl);
    const article = discoverArticle(nodes, pageUrl, baseUrl, visibleText);
    const watermarkObserved = [...nodes.values()].some((node) => node.attributes.get("data-watermark-observed") === "true");
    const protocolSnapshotVersion = "cdp-dom-snapshot-v1";
    const pageRevision = await snapshotRevision(pageUrl, document, snapshot.strings);
    const sanitizedSnapshot=sanitizeProtocolPayload(snapshot);
    const sanitizedAccessibility=sanitizeProtocolPayload(ax);
    const raw = image
      ? await live.page.screenshot({ type: "png" })
      : new TextEncoder().encode(JSON.stringify({ protocolSnapshotVersion, snapshot:sanitizedSnapshot, accessibilityTree:sanitizedAccessibility }));
    return {
      url: pageUrl,
      title,
      pageRevision,
      contentType: image ? "image/png" : "application/vnd.distilled.cdp-snapshot+json",
      raw,
      controls,
      visibleText,
      markup: JSON.stringify(sanitizedSnapshot),
      watermarkObserved,
      article,
      observationSource: image ? "CDP_SCREENSHOT" : "CDP_DOM_SNAPSHOT",
      protocolSnapshotVersion
    };
  }
}

function buildNodeTree(document: SnapshotDocument, strings: string[]): Map<number, DomNodeSnapshot> {
  const nodes = new Map<number, DomNodeSnapshot>();
  for (let index = 0; index < document.nodes.nodeName.length; index += 1) {
    const attributes = new Map<string, string>();
    for (const attr of chunkPairs(document.nodes.attributes?.[index] ?? [])) {
      attributes.set(stringAt(strings, attr[0]).toLowerCase(), stringAt(strings, attr[1]));
    }
    nodes.set(index, {
      index,
      parent: document.nodes.parentIndex?.[index] ?? -1,
      name: stringAt(strings, document.nodes.nodeName[index]).toLowerCase(),
      value: stringAt(strings, document.nodes.nodeValue[index]),
      backendNodeId: document.nodes.backendNodeId?.[index],
      attributes,
      children: []
    });
  }
  for (const node of nodes.values()) {
    const parent = nodes.get(node.parent);
    if (parent) parent.children.push(node.index);
  }
  for (let index = 0; index < (document.layout?.nodeIndex.length ?? 0); index += 1) {
    const node = nodes.get(document.layout!.nodeIndex[index]);
    const bounds = document.layout?.bounds?.[index];
    if (node && bounds && bounds.length >= 4) {
      node.geometry = { x: bounds[0], y: bounds[1], width: bounds[2], height: bounds[3] };
    }
  }
  return nodes;
}

function discoverControls(
  nodes: Map<number, DomNodeSnapshot>,
  axByBackend: Map<number, { role?: string; name?: string }>,
  pageUrl: string,
  baseUrl: string
): SemanticControl[] {
  const controls: SemanticControl[] = [];
  for (const node of nodes.values()) {
    if (!["a", "button", "input", "select", "textarea"].includes(node.name)) continue;
    if (node.attributes.get("aria-hidden") === "true") continue;
    if (!isRenderableControl(node)) continue;
    const ax = node.backendNodeId === undefined ? undefined : axByBackend.get(node.backendNodeId);
    const label = collapseWhitespace(
      ax?.name ||
      node.attributes.get("aria-label") ||
      node.attributes.get("title") ||
      node.attributes.get("placeholder") ||
      textOf(node, nodes)
    );
    const destinationUrl = node.name === "a" ? resolveRuntimeUrl(node.attributes.get("href"), baseUrl || pageUrl) : undefined;
    const target = node.attributes.get("target") ?? "";
    const isDownload = node.attributes.has("download");
    const opensNewContext = Boolean(target && target.toLowerCase() !== "_self");
    const kind: SemanticControl["kind"] = node.name === "a" ? "link" : node.name === "button" ? "button" : node.name === "input" ? "input" : "other";
    controls.push({
      handle: "",
      nodeId: node.backendNodeId === undefined ? `snapshot:${node.index}` : `backend:${node.backendNodeId}`,
      kind,
      role: ax?.role ?? implicitRole(node.name, node.attributes),
      label: label.slice(0, 160),
      attributes: relevantAttributes(node.attributes),
      geometry: node.geometry,
      destinationUrl: !isDownload && !opensNewContext ? destinationUrl : undefined,
      safeAction: node.name === "a" && destinationUrl && !isDownload && !opensNewContext ? "follow" : "unknown"
    });
    if (controls.length >= 40) break;
  }
  return controls;
}

function discoverArticle(
  nodes: Map<number, DomNodeSnapshot>,
  pageUrl: string,
  baseUrl: string,
  visibleText: string
): BrowserObservationData["article"] | undefined {
  const article = firstByName(nodes, "article");
  if (!article) return undefined;
  const title = collapseWhitespace(textOf(firstDescendant(article, nodes, "h1"), nodes));
  const canonicalUrl = resolveRuntimeUrl(
    [...nodes.values()].find((node) => node.name === "link" && (node.attributes.get("rel") ?? "").toLowerCase() === "canonical")
      ?.attributes.get("href"),
    baseUrl || pageUrl
  ) ?? pageUrl;
  const publisherTimestamp = firstDescendant(article, nodes, "time")?.attributes.get("datetime") ?? "";
  const bodyNode = firstByAttribute(article, nodes, "data-article-body");
  const excerptNode = firstByAttribute(article, nodes, "data-excerpt");
  const body = collapseWhitespace(textOf(bodyNode ?? article, nodes) || visibleText);
  const excerpt = collapseWhitespace(textOf(excerptNode, nodes) || body.slice(0, 180));
  return { title, canonicalUrl, publisherTimestamp, excerpt, body };
}

function firstByName(nodes: Map<number, DomNodeSnapshot>, name: string): DomNodeSnapshot | undefined {
  return [...nodes.values()].find((node) => node.name === name);
}

function firstDescendant(root: DomNodeSnapshot | undefined, nodes: Map<number, DomNodeSnapshot>, name: string): DomNodeSnapshot | undefined {
  if (!root) return undefined;
  for (const child of root.children) {
    const node = nodes.get(child);
    if (!node) continue;
    if (node.name === name) return node;
    const nested = firstDescendant(node, nodes, name);
    if (nested) return nested;
  }
  return undefined;
}

function firstByAttribute(
  root: DomNodeSnapshot | undefined,
  nodes: Map<number, DomNodeSnapshot>,
  attribute: string
): DomNodeSnapshot | undefined {
  if (!root) return undefined;
  if (root.attributes.has(attribute)) return root;
  for (const child of root.children) {
    const nested = firstByAttribute(nodes.get(child), nodes, attribute);
    if (nested) return nested;
  }
  return undefined;
}

function textOf(root: DomNodeSnapshot | undefined, nodes: Map<number, DomNodeSnapshot>): string {
  if (!root) return "";
  if (root.name === "#text") return root.value;
  return root.children.map((child) => textOf(nodes.get(child), nodes)).join(" ");
}

function relevantAttributes(attributes: Map<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of ["href", "aria-label", "title", "placeholder", "type", "rel", "target", "download"]) {
    const value = attributes.get(key);
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function isRenderableControl(node: DomNodeSnapshot): boolean {
  return Boolean(node.geometry && node.geometry.width > 0 && node.geometry.height > 0);
}

function implicitRole(name: string, attributes: Map<string, string>): string {
  if (attributes.has("role")) return attributes.get("role")!;
  if (name === "a") return "link";
  if (name === "button") return "button";
  if (name === "input") return "textbox";
  return name;
}

function resolveRuntimeUrl(value: string | undefined, baseUrl: string): string | undefined {
  if (!value) return undefined;
  try { return new URL(value, baseUrl).toString(); } catch { return undefined; }
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function chunkPairs(values: number[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let index = 0; index + 1 < values.length; index += 2) pairs.push([values[index], values[index + 1]]);
  return pairs;
}

function stringAt(strings: string[], index: number | undefined): string {
  return index === undefined ? "" : strings[index] ?? "";
}

const SECRET_PROTOCOL_KEY=/(?:password|passwd|cookie|authorization|authToken|accessToken|refreshToken|sessionToken|csrf|xsrf|totp|otp|inputValue)/i;
const SECRET_TEXT=/(?:bearer\s+[a-z0-9._~+\/-]+=*|(?:access|refresh|session|csrf|xsrf|auth)[_-]?token\s*[=:]\s*["']?[a-z0-9._~+\/-]{8,})/ig;
function sanitizeProtocolPayload<T>(value:T,key=""):T {
  if(SECRET_PROTOCOL_KEY.test(key)) return "[REDACTED]" as T;
  if(typeof value==="string") return value.replace(SECRET_TEXT,"[REDACTED]") as T;
  if(Array.isArray(value)) return value.map((entry)=>sanitizeProtocolPayload(entry,key)) as T;
  if(value&&typeof value==="object") {
    const output:Record<string,unknown>={};
    for(const [childKey,child] of Object.entries(value as Record<string,unknown>)) output[childKey]=sanitizeProtocolPayload(child,childKey);
    return output as T;
  }
  return value;
}

async function snapshotRevision(pageUrl: string, document: SnapshotDocument | undefined, strings: string[]) {
  if (!document) return sha256Text(pageUrl);
  return sha256Text(JSON.stringify({
    pageUrl,
    documentURL: stringAt(strings, document.documentURL),
    title: stringAt(strings, document.title),
    baseURL: stringAt(strings, document.baseURL),
    nodes: document.nodes.nodeName.map((name, index) => ({
      parent: document.nodes.parentIndex?.[index] ?? -1,
      name: stringAt(strings, name),
      value: stringAt(strings, document.nodes.nodeValue[index]),
      attributes: chunkPairs(document.nodes.attributes?.[index] ?? [])
        .map(([key, value]) => [stringAt(strings, key), stringAt(strings, value)])
    }))
  }));
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
function blockedRequestMessage(request:{method:string;url:string}) { return `browser request blocked: ${request.method} ${request.url}`; }
function urlInSet(value:string,allowed:string[]) {
  try {
    const actual=new URL(value);actual.hash="";
    return allowed.some((candidate)=>{const expected=new URL(candidate);expected.hash="";return expected.toString()===actual.toString();});
  } catch { return false; }
}
function domainMatches(cookieDomain:string,hostname:string){const normalized=cookieDomain.replace(/^\./,"").toLowerCase();const host=hostname.toLowerCase();return host===normalized||host.endsWith(`.${normalized}`);}
