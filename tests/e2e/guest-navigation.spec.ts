import {test,expect} from '@playwright/test';
test('guest Home contains authentication and links to Explore',async({page})=>{
 await page.route('**/api/**',route=>route.fulfill({json:route.request().url().includes('/auth/session')?{authenticated:false,setupRequired:false}:{feeds:[]}}));
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Welcome back',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Sign up',exact:true}).first().click();
 await expect(page.getByRole('heading',{name:'Create your account'})).toBeVisible();
 const nav=page.getByRole('navigation',{name:'Main navigation'});
 await expect(nav.getByRole('link')).toHaveCount(2);
 await nav.getByRole('link',{name:'Explore',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Explore',exact:true})).toBeVisible();
 await expect(page.getByRole('textbox')).toBeVisible();
 await expect(page.locator('.topic-grid .topic-card')).toHaveCount(6);
 await expect(nav.getByText('Top feeds')).toHaveCount(0);
 await nav.getByRole('link',{name:'Home',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Welcome back',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
