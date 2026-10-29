import {expect,test} from '@playwright/test';
const titles={en:"You're offline",fr:'Vous êtes hors ligne',ar:'أنت غير متصل بالإنترنت'};
for(const language of ['en','fr','ar'] as const)for(const width of [320,1280])test('offline page uses saved '+language+' at '+width,async({browser,baseURL},info)=>{
 const context=await browser.newContext({baseURL,locale:'en-US',viewport:{width,height:800},serviceWorkers:'allow'});
 try{
  await context.addInitScript(language=>localStorage.setItem('dn_language',language),language);
  const page=await context.newPage();
  await page.route('**/api/**',route=>route.fulfill({json:{authenticated:false,feeds:[],briefings:[]}}));
  await page.goto('/');await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);await page.reload();
  await expect(page.locator('h1')).toHaveText(titles[language]);
  await expect(page.locator('html')).toHaveAttribute('lang',language);
  await expect(page.locator('html')).toHaveAttribute('dir',language==='ar'?'rtl':'ltr');
  await expect(page).toHaveTitle('Distilled.News - '+titles[language]);
  await expect(page.locator('svg.offline-wifi')).toBeVisible();
  await expect(page.locator('.offline-wifi #offline-card')).toHaveCount(1);
  await expect(page.locator('img')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const button=await page.locator('button').boundingBox();expect(button!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({path:info.outputPath('offline-'+language+'.png'),animations:'disabled'});
 }finally{await context.close();}
});
