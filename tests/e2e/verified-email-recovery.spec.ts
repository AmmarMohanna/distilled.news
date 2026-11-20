import {expect,test} from '@playwright/test';

for(const entry of ['register','resend'] as const)for(const language of ['en','fr','ar'] as const)for(const action of ['login','forgot'] as const){
 test(`already-verified ${language} ${entry} error opens ${action} with the email preserved`,async({page})=>{
  await page.addInitScript(value=>localStorage.setItem('dn_language',value),language);
  const requests:Array<{path:string;body:Record<string,unknown>}>=[];
  await page.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname;
   if(route.request().method()==='POST')requests.push({path,body:route.request().postDataJSON()});
   if(path==='/api/auth/register')return route.fulfill({status:409,json:{error:entry==='register'?'Email is already verified. Please sign in or reset your password.':'email is already registered'}});
   if(path==='/api/auth/verification/resend')return route.fulfill({status:409,json:{error:'Email is already verified. Please sign in or reset your password.'}});
   return route.fulfill({json:path==='/api/auth/session'?{authenticated:false,setupRequired:false}:path.startsWith('/api/explore/')?{feeds:[]}:{ok:true}});
  });
  await page.goto('/login?signup');
  const dialog=page.locator('.auth-dialog');
  await dialog.locator('input[type="email"]').fill('verified@example.invalid');
  await dialog.locator('input[autocomplete="username"]').fill('verified');
  await dialog.locator('input[autocomplete="new-password"]').fill('fixture-password');
  await dialog.locator('button[type="submit"]').click();
  if(entry==='resend')await dialog.locator('.auth-verification-actions button').last().click();
  const error=dialog.getByRole('alert');
  const link=error.locator(`a[href="${action==='login'?'/login':'/login?reset-password'}"]`);
  await expect(link).toBeVisible();
  await expect(dialog.locator('.auth-verification-actions button')).toHaveCount(0);
  await expect(link).toHaveCSS('text-decoration-line','underline');
  await expect(link).toHaveCSS('color',await error.evaluate(node=>getComputedStyle(node).color));
  await link.click();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect(dialog.locator('input[type="email"]')).toHaveValue('verified@example.invalid');
  await expect(dialog.locator('.auth-verification-actions button')).toHaveCount(0);
  await expect(dialog.locator('.auth-password-field')).toHaveCount(action==='login'?1:0);
  expect(requests.map(request=>request.path)).toEqual(entry==='register'?['/api/auth/register']:['/api/auth/register','/api/auth/verification/resend']);
  if(action==='forgot'){
   await dialog.locator('button[type="submit"]').click();
   await expect.poll(()=>requests.at(-1)?.path).toBe('/api/auth/password/forgot');
   expect(requests.at(-1)?.body.email).toBe('verified@example.invalid');
  }
 });
}
