import { startFrontendUpdates } from './frontend-updates';

type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
const installedKey = "dn_pwa_installed_on_device";
let installPrompt: InstallEvent | undefined;
let installed = matchMedia("(display-mode: standalone)").matches;
window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); installPrompt = event as InstallEvent; installed = false; localStorage.removeItem(installedKey); });
window.addEventListener("appinstalled", () => { installPrompt = undefined; installed = true; localStorage.setItem(installedKey, "1"); });
const registration = "serviceWorker" in navigator
  ? navigator.serviceWorker.register("/sw.js", {updateViaCache:'none'}).catch(() => null) : Promise.resolve(null);
startFrontendUpdates();

export async function installApp() {
  const browser = navigator as Navigator & { standalone?: boolean; getInstalledRelatedApps?: () => Promise<Array<{ platform: string; url?: string; id?: string }>> };
  if (browser.standalone || matchMedia("(display-mode: standalone)").matches) return "already-installed" as const;
  if (!installPrompt) {
    if (installed) return "already-installed" as const;
    try {
      const related = await browser.getInstalledRelatedApps?.();
      const manifest = new URL(document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href || '/manifest.webmanifest', location.origin);
      if (related?.some(app => app.platform === "webapp" && (
        app.url && new URL(app.url, location.origin).origin === manifest.origin && new URL(app.url, location.origin).pathname === manifest.pathname ||
        app.id && new URL(app.id, location.origin).href === new URL("/", location.origin).href
      ))) {
        installed = true;
        localStorage.setItem(installedKey, "1");
        return "already-installed" as const;
      }
    } catch { /* Browsers may not expose installed applications. */ }
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ? "ios-instructions" as const : /Android/.test(navigator.userAgent) ? "android-instructions" as const : "unavailable" as const;
  }
  const prompt = installPrompt; installPrompt = undefined;
  await prompt.prompt();
  if ((await prompt.userChoice).outcome !== "accepted") return "cancelled" as const;
  if (installed) return "installed" as const;
  return "installing" as const;
}

export async function notificationsEnabled(): Promise<boolean> {
  if (!("Notification" in window) || Notification.permission !== "granted" || !("PushManager" in window)) return false;
  const worker = await registration;
  const subscription = worker ? await worker.pushManager.getSubscription() : null;
  if (!subscription) return false;
  const response = await fetch('/api/me/push/status', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:subscription.endpoint})});
  if (!response.ok) throw new Error('Could not check notification status');
  return (await response.json()).subscribed === true;
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  if (!("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)) throw new Error("Notifications are not supported in this browser. On iPhone, install the app first.");
  // Request permission directly from the click, before any network work (Safari).
  if (enabled && await Notification.requestPermission() !== "granted") throw new Error("Allow notifications in your browser settings to enable them.");
  if (!await registration) throw new Error("Service worker registration failed");
  const worker = await navigator.serviceWorker.ready;
  const existing = await worker.pushManager.getSubscription();
  if (!enabled && existing) {
    const response = await fetch("/api/me/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: existing.endpoint }) });
    if (!response.ok) throw new Error("Could not remove subscription");
    if (!await existing.unsubscribe()) throw new Error("Could not disable notifications. Please try again.");
    return;
  }
  if (!enabled) return;
  const config = await fetch("/api/me/push");
  if (!config.ok) throw new Error("Could not load notification configuration");
  const { publicKey } = await config.json();
  if (!publicKey) throw new Error("Notifications need server setup before they can be enabled.");
  const key = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
  const subscription = existing ?? await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const response = await fetch("/api/me/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: subscription.toJSON(), language: localStorage.getItem("dn_language") || "en" }) });
  if (!response.ok) { if (!existing) await subscription.unsubscribe(); throw new Error("Could not save subscription"); }
}

/** Revoke this device before ending the authenticated session. */
export async function stopNotificationsOnLogout(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const worker=await registration;
  if (worker && await worker.pushManager.getSubscription()) await setNotificationsEnabled(false);
}
