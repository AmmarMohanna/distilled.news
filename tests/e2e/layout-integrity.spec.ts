import { expect, test, type Page } from "@playwright/test";

/**
 * Layout integrity: on each page state, every visible control must be reachable (not covered by anything but its
 * own menu), controls must not overlap, and nothing may overflow the screen, including with enlarged text.
 */
const now = Date.now();
const iso = (minutes: number) => new Date(now - minutes * 60000).toISOString();
const base = { ownerAccountId: "joud", ownerUsername: "joud", interestProfile: "x", styleInstruction: "", publicFeedEnabled: true, paused: false, language: "en", intensity: "low", briefingCadence: "daily", briefingTimeOfDay: "09:00", briefingTimezone: "UTC", retentionDays: 15 };
const feeds = ["Lebanon", "Technology", "Science and research", "Global affairs"].map((title, index) => ({ ...base, id: `f${index}`, slug: title.toLowerCase().replace(/\W+/g, "-"), title, stars: index * 3 + 1 }));
const evidence = (n: number) => [{ messageId: `m${n}a`, sourceId: "s", sourceTitle: "NNA", sourceType: "channel", sourceUrl: "https://example.com/" + n, postedAt: iso(90), text: "Officials confirmed the ceasefire holds along the southern border. ".repeat(4), links: ["https://news.example.org/story" + n], media: [] }];
const sections = [1, 2, 3].map(n => ({ title: "Story headline " + n, summary: "A summary of what happened and why it matters to readers of this feed.", evidence: evidence(n) }));
const editions = Array.from({ length: 6 }, (_, i) => ({ id: "e" + i, briefingId: "f0", cadence: "daily", windowStart: iso(i * 700), windowEnd: iso(i * 700), title: "Briefing", summary: "Electricity supply rises by two hours tonight [1]. The central bank raised the withdrawal cap [2]. The border stayed calm overnight [3].", sections, status: "published", publishedAt: iso(i * 700 + 30), createdAt: iso(i * 700), updatedAt: iso(i * 700) }));

async function mock(page: Page, role: "user" | "admin" | null) {
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    const body: unknown = path === "/api/auth/session" ? (role ? { authenticated: true, setupRequired: false, account: { id: "joud", username: "joud", email: "j@example.test", role } } : { authenticated: false, setupRequired: false })
      : path === "/api/me/briefings" || path === "/api/me/feeds" ? { briefings: role ? feeds : [] }
      : path === "/api/explore/feeds" ? { feeds }
      : path === "/api/me/sources" ? { sources: [] }
      : path === "/api/me/health" ? { health: { processing: { queued: 0, completed: 0, failed: 0 } } }
      : path.startsWith("/api/admin/") ? { accounts: [], briefings: feeds }
      : /^\/api\/feed\/joud\/[^/]+\/editions\//.test(path) ? { edition: editions[0] }
      : /^\/api\/feed\/joud\/[^/]+$/.test(path) ? { briefing: feeds[0], editions, viewerHasStarred: false }
      : {};
    return path.endsWith("/sketch") ? route.fulfill({ status: 404 }) : route.fulfill({ json: body });
  });
}

const CHECK = (): string[] => {
  const desc = e => e ? `${e.tagName.toLowerCase()}${e.className && typeof e.className === "string" ? "." + e.className.trim().split(/\s+/)[0] : ""}[${(e.getAttribute("aria-label") || e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 22)}]` : "none";
  const shown = e => { if (e.closest("details:not([open])") && !e.matches("summary")) return false; const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 1 && r.height > 1 && s.visibility !== "hidden" && s.display !== "none" && parseFloat(s.opacity) > 0.05 && !e.closest("[inert],[aria-hidden='true']"); };
  const modal = document.querySelector("dialog[open]");
  const scope = modal || document;
  const controls = [...scope.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, summary, [role=switch], [role=button]")].filter(shown).filter(e => !e.closest(".sr-only") && !e.matches(".skip-link"));
  const issues: string[] = [];
  const inView = r => r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  const overlay = n => n && n.closest && n.closest(".feed-options-popover, [class*=popover], [role=menu]");
  const related = (a, b) => a.contains(b) || b.contains(a) || (a.closest("label") && a.closest("label") === b.closest("label"));
  for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
    const a = controls[i], b = controls[j]; if (related(a, b)) continue;
    const chrome = n => { for (let e = n; e && e !== document.body; e = e.parentElement) { const pos = getComputedStyle(e).position; if (pos === "fixed" || pos === "sticky") return true; } return false; };
    if (chrome(a) !== chrome(b)) continue;
    if (!!overlay(a) !== !!overlay(b)) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); if (!inView(ra) || !inView(rb)) continue;
    const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (w > 3 && h > 3 && w * h > 24) issues.push(`OVERLAP ${desc(a)} × ${desc(b)} (${Math.round(w)}×${Math.round(h)})`);
  }
  for (const e of controls) {
    e.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    const r = e.getBoundingClientRect(); if (!inView(r)) continue;
    let blocked = 0, by = null, tested = 0;
    for (const [px, py] of [[.5, .5], [.2, .5], [.8, .5], [.5, .25], [.5, .75]]) {
      const x = r.left + r.width * px, y = r.top + r.height * py; if (x < 1 || y < 1 || x > innerWidth - 1 || y > innerHeight - 1) continue; tested++;
      const top = document.elementFromPoint(x, y); if (top && !related(e, top) && !(overlay(top) && !overlay(e))) { blocked++; by = top; }
    }
    if (tested && blocked >= Math.max(1, Math.ceil(tested / 2))) issues.push(`COVERED ${desc(e)} by ${desc(by)}`);
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) issues.push(`H-SCROLL page ${document.documentElement.scrollWidth}>${innerWidth}`);
  for (const e of scope.querySelectorAll("h1,h2,h3,p,strong,span,a,button,label,summary,time,small")) {
    if (!shown(e)) continue; const s = getComputedStyle(e);
    if ((s.overflow === "hidden" || s.overflowX === "hidden") && s.textOverflow !== "ellipsis" && s.display !== "-webkit-box" && e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 0 && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) issues.push(`CLIPPED ${desc(e)} ${e.scrollWidth}>${e.clientWidth}`);
    const r = e.getBoundingClientRect(); if (inView(r) && (r.right > innerWidth + 0.5 || r.left < -0.5) && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && !e.closest("[class*=popover]")) issues.push(`OFFSCREEN-TEXT ${desc(e)} ${Math.round(r.left)}..${Math.round(r.right)}`);
  }
  return issues;
};

const scenes: { name: string; role: "user" | "admin" | null; url: string; act?: (page: Page) => Promise<void> }[] = [
  { name: "guest landing", role: null, url: "/" },
  { name: "guest feed with menu", role: null, url: "/joud/lebanon/", act: async page => { await page.locator(".feed-more > summary").click(); } },
  { name: "home", role: "user", url: "/" },
  { name: "home with a card menu open", role: "admin", url: "/", act: async page => { await page.locator(".personal-feed-grid .topic-card").nth(1).locator(".feed-options > summary").click(); } },
  { name: "explore", role: "user", url: "/explore" },
  { name: "settings", role: "admin", url: "/", act: async page => { await page.locator(".bottom-navigation .navigation-settings").click(); } },
  { name: "feed", role: "user", url: "/joud/lebanon/" },
  { name: "feed with the More menu open", role: "user", url: "/joud/lebanon/", act: async page => { await page.locator(".feed-more > summary").click(); } },
  { name: "feed sources sheet", role: "user", url: "/joud/lebanon/", act: async page => { await page.locator(".news-item .inline-reference").nth(1).click(); } },
];
const variants = [
  { label: "320px", width: 320, height: 568, scale: 1 },
  { label: "390px with doubled text", width: 390, height: 844, scale: 2 },
  { label: "1280px", width: 1280, height: 800, scale: 1 },
];

for (const scene of scenes) for (const variant of variants) {
  test(`layout integrity: ${scene.name} at ${variant.label}`, async ({ page }) => {
    await page.setViewportSize({ width: variant.width, height: variant.height });
    await page.addInitScript(() => { try { localStorage.setItem("dn_theme", "light"); } catch { /* storage unavailable */ } });
    await mock(page, scene.role);
    await page.goto(scene.url);
    await expect(page.locator(".experience-header, header").first()).toBeVisible();
    await page.waitForTimeout(400);
    if (variant.scale !== 1) await page.addStyleTag({ content: `html { font-size: ${16 * variant.scale}px !important; }` });
    if (scene.act) { await scene.act(page); await page.waitForTimeout(300); }
    expect(await page.evaluate(CHECK)).toEqual([]);
  });
}
