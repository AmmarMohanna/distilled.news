type InstallEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> };
let installPrompt: InstallEvent | undefined;
window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); installPrompt = event as InstallEvent; });
window.addEventListener("appinstalled", () => { installPrompt = undefined; });
const registration = "serviceWorker" in navigator
  ? navigator.serviceWorker.register("/sw.js").catch(() => null) : Promise.resolve(null);

export async function installApp() {
  if (matchMedia("(display-mode: standalone)").matches) return "The app is already open as an installed application.";
  if (!installPrompt) return "Choose Add to Home Screen or Install app in your browser menu, if available.";
  const prompt = installPrompt; installPrompt = undefined;
  await prompt.prompt();
  return (await prompt.userChoice).outcome === "accepted" ? "App installed." : "Installation cancelled.";
}

export async function toggleNotifications() {
  if (!("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)) return "Notifications are not supported in this browser. On iPhone, install the app first.";
  // Request permission directly from the click, before any network work (Safari).
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "Allow notifications in your browser settings to enable them.";
  if (!await registration) throw new Error("Service worker registration failed");
  const worker = await navigator.serviceWorker.ready;
  const existing = await worker.pushManager.getSubscription();
  if (existing) {
    const response = await fetch("/api/me/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: existing.endpoint }) });
    if (!response.ok) throw new Error("Could not remove subscription");
    await existing.unsubscribe();
    return "Notifications disabled on this device.";
  }
  const config = await fetch("/api/me/push");
  if (!config.ok) throw new Error("Could not load notification configuration");
  const { publicKey } = await config.json();
  if (!publicKey) return "Notifications need server setup before they can be enabled.";
  const key = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
  const subscription = await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const response = await fetch("/api/me/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: subscription.toJSON(), language: localStorage.getItem("dn_language") || "en" }) });
  if (!response.ok) { await subscription.unsubscribe(); throw new Error("Could not save subscription"); }
  return "Notifications enabled for new briefings in your feeds.";
}
