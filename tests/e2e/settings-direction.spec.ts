import {expect,test} from '@playwright/test';
for(const language of ['en','ar'])for(const width of [390,1280])test('settings heading follows '+language+' direction at '+width,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.addInitScript(language=>localStorage.setItem('dn_language',language),language);
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;return route.fulfill({json:path==='/api/auth/session'?{authenticated:true,account:{id:'owner',username:'owner',role:'user'}}:path==='/api/me/briefings'?{briefings:[]}:path==='/api/explore/feeds'?{feeds:[]}:{}});});
 await page.goto('/');await page.locator('.navigation-settings').click();
 const title=page.locator('.settings-view .experience-title');await expect(title).toBeVisible();await expect(title).toHaveCSS('text-align','start');await expect(title).toHaveCSS('direction',language==='ar'?'rtl':'ltr');
 const edges=await title.locator('h1').evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);const text=range.getBoundingClientRect(),box=node.getBoundingClientRect();return {left:Math.abs(text.left-box.left),right:Math.abs(text.right-box.right)};});expect(language==='ar'?edges.right:edges.left).toBeLessThan(3);
});
