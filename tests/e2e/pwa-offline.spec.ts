import {expect,test} from '@playwright/test';
for(const locale of ['en','ar'])for(const width of [320,1280])test('offline page '+locale+' at '+width,async({browser})=>{
 const context=await browser.newContext({locale,viewport:{width,height:800},serviceWorkers:'allow'});try{const page=await context.newPage();
 await page.route('**/api/**',route=>route.fulfill({json:{authenticated:false,feeds:[],briefings:[]}}));
 await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
 await context.setOffline(true);await page.reload();await expect(page.locator('h1')).toHaveText(locale==='ar'?'أنت غير متصل بالإنترنت':"You're offline");
 await expect(page.locator('html')).toHaveAttribute('dir',locale==='ar'?'rtl':'ltr');expect(await page.locator('img').evaluate((n:HTMLImageElement)=>n.complete&&n.naturalWidth>0)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const button=await page.locator('button').boundingBox();expect(button!.height).toBeGreaterThanOrEqual(44);
 }finally{await context.close();}
});
