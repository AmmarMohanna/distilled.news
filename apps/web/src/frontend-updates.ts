// An open PWA keeps executing its original bundle even after the server deploys.
// Compare the deployed entry points, rather than relying on sw.js changing.
function entryPoints(document: Document): string[] {
  return [...document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[type="module"][src],link[rel="stylesheet"][href]')]
    .map(node => new URL(node.getAttribute('src') ?? node.getAttribute('href')!, location.origin))
    .filter(url => url.origin === location.origin && url.pathname.startsWith('/assets/'))
    .map(url => url.pathname + url.search).sort();
}

export function startFrontendUpdates(reload = () => location.reload()) {
  const original = entryPoints(document);
  if (!original.length) return () => {};
  let checking = false, pending = false, stopped = false, reloading = false;
  let lastCheck = -Infinity;
  let observer: MutationObserver | undefined;
  const refresh = () => {
    if (stopped || reloading || !pending || document.visibilityState === 'hidden' || navigator.onLine === false) return;
    if (document.querySelector('dialog[open]:not([inert])') || document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')) return;
    reloading = true;
    observer?.disconnect();
    reload();
  };
  const check = async () => {
    if (stopped || document.visibilityState === 'hidden' || navigator.onLine === false) return;
    if (pending) { refresh(); return; }
    if (checking || Date.now() - lastCheck < 60_000) return;
    checking = true; lastCheck = Date.now();
    try {
      const response = await fetch('/', {cache:'no-store', credentials:'same-origin', headers:{Accept:'text/html'}, signal:AbortSignal.timeout(10_000)});
      if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return;
      const deployed = entryPoints(new DOMParser().parseFromString(await response.text(), 'text/html'));
      if (stopped || !deployed.length || JSON.stringify(deployed) === JSON.stringify(original)) return;
      pending = true;
      observer = new MutationObserver(refresh);
      observer.observe(document.body, {childList:true,subtree:true,attributes:true,attributeFilter:['open']});
      refresh();
    } catch { /* Offline, failed or incomplete deployment reads never force a reload. */ }
    finally { checking = false; }
  };
  const resumed = () => { void check(); };
  const blurred = () => { if (pending) setTimeout(refresh, 0); };
  window.addEventListener('focus', resumed);
  window.addEventListener('online', resumed);
  document.addEventListener('visibilitychange', resumed);
  document.addEventListener('focusout', blurred);
  const interval = window.setInterval(resumed, 5 * 60_000);
  void check();
  return () => {
    stopped = true; observer?.disconnect(); clearInterval(interval);
    window.removeEventListener('focus', resumed);
    window.removeEventListener('online', resumed);
    document.removeEventListener('visibilitychange', resumed);
    document.removeEventListener('focusout', blurred);
  };
}
