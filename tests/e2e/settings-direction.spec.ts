import {expect,test} from '@playwright/test';
for(const language of ['en','ar'])for(const width of [390,1280])test('settings heading follows '+language+' direction at '+width,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.addInitScript(language=>localStorage.setItem('dn_language',language),language);
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;return route.fulfill({json:path==='/api/auth/session'?{authenticated:true,account:{id:'owner',username:'owner',role:'admin'}}:path.startsWith('/api/admin/')?{accounts:[],briefings:[]}:path==='/api/me/briefings'?{briefings:[]}:path==='/api/explore/feeds'?{feeds:[]}:{}});});
 await page.goto('/');await page.locator('.navigation-settings').click();
 const title=page.locator('.settings-view .experience-title');await expect(title).toBeVisible();await expect(title).toHaveCSS('text-align','start');await expect(title).toHaveCSS('direction',language==='ar'?'rtl':'ltr');
 const chevron=page.locator('.accounts-summary > svg').nth(1);await expect(chevron).toHaveCSS('transform',language==='ar'?'matrix(-1, 0, 0, -1, 0, 0)':'none');
 if(width<900)for(const button of await page.locator('.setting-language .language-segments button').all()){const box=await button.boundingBox();expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);}
 const edges=await title.locator('h1').evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);const text=range.getBoundingClientRect(),box=node.getBoundingClientRect();return {left:Math.abs(text.left-box.left),right:Math.abs(text.right-box.right)};});expect(language==='ar'?edges.right:edges.left).toBeLessThan(3);
});
