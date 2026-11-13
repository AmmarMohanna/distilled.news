const {chromium,expect}=require('@playwright/test');
const ts=require('typescript');
const fs=require('node:fs/promises');
const path=require('node:path');

(async()=>{
  const directory=path.resolve('tools/distilled-magnifier');
  await fs.mkdir('.local-reports',{recursive:true});
  const profile=await fs.mkdtemp(path.resolve('.local-reports/magnifier-profile-'));
  const context=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,
    viewport:{width:1280,height:800},args:[`--disable-extensions-except=${directory}`,`--load-extension=${directory}`]});
  try{
    const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
    const source=await fs.readFile('apps/web/src/usePageMagnification.ts','utf8');
    const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const html=`<html><style>html,body,#root{margin:0;height:100%;overflow:hidden}nav{width:240px}@media(max-width:899px){nav{width:100%}}</style><div id="root"><nav>Home Explore</nav><h1>Magnifier test</h1></div><script>var exports={};var require=()=>({useLayoutEffect:fn=>fn()});${code};exports.installPageMagnification();</script></html>`;
    // All requests are local fixtures. No account, live data or provider calls.
    await context.route('**/*',route=>route.fulfill({contentType:'text/html',body:html}));
    const page=await context.newPage();
    await page.goto('https://distilled-news-joud.distillednews-platform.workers.dev/');
    const tabId=await worker.evaluate(async()=>{
      const tabs=await chrome.tabs.query({url:'https://distilled-news-joud.distillednews-platform.workers.dev/*'});
      return tabs[0].id;
    });
    const settings=()=>worker.evaluate(id=>chrome.tabs.getZoomSettings(id),tabId);
    await expect.poll(async()=>(await settings()).mode).toBe('manual');
    const baseline=await page.evaluate(()=>({width:innerWidth,dpr:devicePixelRatio}));
    for(const factor of [1.25,1.75,2,4,1]){
      await worker.evaluate(({id,factor})=>chrome.tabs.setZoom(id,factor),{id:tabId,factor});
      await expect.poll(()=>page.locator('#root').evaluate(root=>root.style.transform)).toBe(factor===1?'':`translate(${-baseline.width/2*(factor-1)}px, ${-400*(factor-1)}px) scale(${factor})`);
      const actual=await page.evaluate(()=>({width:innerWidth,dpr:devicePixelRatio,navWidth:document.querySelector('nav').offsetWidth,overflow:getComputedStyle(document.documentElement).overflowX}));
      expect(actual).toEqual({...baseline,navWidth:240,overflow:'hidden'});
      console.log(JSON.stringify({factor,mode:(await settings()).mode,layoutUnchanged:true}));
    }
    await page.keyboard.press('Control+=');
    await expect.poll(()=>worker.evaluate(id=>chrome.tabs.getZoom(id),tabId)).toBe(1.1);
    await expect.poll(()=>page.locator('#root').evaluate(root=>root.style.transform.includes('scale(1.1)'))).toBe(true);
    await page.keyboard.press('Control+0');
    await expect.poll(()=>worker.evaluate(id=>chrome.tabs.getZoom(id),tabId)).toBe(1);
    console.log(JSON.stringify({keyboardAndBrowserZoomSynced:true}));
    await page.reload();
    await expect.poll(async()=>(await settings()).mode).toBe('manual');
    console.log(JSON.stringify({reloadReconnected:true}));
    await page.goto('https://example.com/');
    expect((await settings()).mode).toBe('automatic');
    console.log(JSON.stringify({otherSitesUnaffected:true}));
  }finally{await context.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
