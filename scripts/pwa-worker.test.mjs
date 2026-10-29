import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../apps/web/public/sw.js',import.meta.url),'utf8');
const setup=(clients={})=>{const events={};vm.runInNewContext(code,{URL,Response,fetch:()=>Promise.reject(Error('offline')),self:{location:{origin:'https://news.test'},clients,addEventListener:(type,fn)=>events[type]=fn}});return events;};
test('notification reuses and focuses an existing app window',async()=>{let navigated,focused=false,opened=false,wait;const events=setup({matchAll:async()=>[{url:'https://news.test/',navigate:async url=>{navigated=url},focus:async()=>{focused=true}}],openWindow:async()=>{opened=true}});events.notificationclick({notification:{close(){},data:{url:'/owner/feed/'}},waitUntil:p=>{wait=p}});await wait;assert.equal(navigated,'https://news.test/owner/feed/');assert.ok(focused);assert.equal(opened,false);});
test('notification opens a window when none exists and blocks external URLs',async()=>{let opened,wait;const events=setup({matchAll:async()=>[],openWindow:async url=>{opened=url}});events.notificationclick({notification:{close(){},data:{url:'/feed/'}},waitUntil:p=>wait=p});await wait;assert.equal(opened,'https://news.test/feed/');events.notificationclick({notification:{close(){},data:{url:'https://outside.test'}},waitUntil:()=>assert.fail()});});
const offlineCopy = {
  en: {title: "You're offline", retry: 'Try again'},
  ar: {title: '\u0623\u0646\u062a \u063a\u064a\u0631 \u0645\u062a\u0635\u0644 \u0628\u0627\u0644\u0625\u0646\u062a\u0631\u0646\u062a', retry: '\u062d\u0627\u0648\u0644 \u0645\u062c\u062f\u062f\u064b\u0627'},
  fr: {title: 'Vous \u00eates hors ligne', retry: 'R\u00e9essayer'},
};
for (const language of ['en', 'ar', 'fr']) {
  test('offline fallback is self-contained and localized ' + language, async () => {
    let response;
    const events = setup();
    events.fetch({
      request: {mode: 'navigate', headers: new Headers({'Accept-Language': language})},
      respondWith: promise => { response = promise; },
    });
    const result = await response;
    assert.match(result.headers.get('Content-Type'), /text\/html; charset=utf-8/);
    const html = await result.text();
    assert.ok(html.includes('lang="' + language + '"'));
    assert.ok(html.includes('dir="' + (language === 'ar' ? 'rtl' : 'ltr') + '"'));
    assert.ok(html.includes('<h1>' + offlineCopy[language].title + '</h1>'));
    assert.ok(html.includes(offlineCopy[language].retry));
    assert.match(html, /<svg\b[^>]*class="offline-wifi"[^>]*>[\s\S]*?<path\b[\s\S]*?<\/svg>/);
    // The illustration and page must render without fetching any image or stylesheet.
    assert.doesNotMatch(html, /<(?:img|image|link)\b|\b(?:src|href|xlink:href)\s*=|@import\b/i);
    assert.equal(html.includes('cloud-left'), false);
  });
}
