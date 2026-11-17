import {expect,test} from '@playwright/test';
for(const language of ['en','ar'])test('header branding scales predictably without clipping '+language,async({page})=>{
 await page.addInitScript(language=>localStorage.setItem('dn_language',language),language);
 await page.route('**/api/**',route=>route.fulfill({json:new URL(route.request().url()).pathname==='/api/auth/session'?{authenticated:false}:{feeds:[],briefings:[]}}));
 let previous=0;
 for(const width of [320,390,600,899,900,1280,1920]){
 await page.setViewportSize({width,height:900});await page.goto('/');
 const brand=page.locator('.experience-header .experience-brand');await expect(brand).toBeVisible();
 const values=await brand.evaluate(node=>{const logo=node.querySelector('.distilled-logo')!,word=node.querySelector('.distilled-logo-wordmark')!,symbol=node.querySelector('.distilled-logo-symbol')!;const box=node.getBoundingClientRect(),mark=symbol.getBoundingClientRect();return {font:parseFloat(getComputedStyle(word).fontSize),visible:getComputedStyle(word).display!=='none',ratio:mark.width/parseFloat(getComputedStyle(logo).fontSize),clipped:logo.scrollWidth>box.width+1};});
 expect(values.font).toBeGreaterThanOrEqual(previous);expect(values.font).toBeGreaterThanOrEqual(18);expect(values.font).toBeLessThanOrEqual(24);previous=values.font;expect(values.ratio).toBeCloseTo(1.8,1);expect(values.clipped).toBe(false);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});
