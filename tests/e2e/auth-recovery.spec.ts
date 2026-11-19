import {expect,test} from '@playwright/test';

for(const mode of ['login','register'] as const){
 test(`verification recovery stays scoped to registration after ${mode}`,async({page})=>{
  const calls:Array<{path:string;body:Record<string,unknown>}>=[];let attempts=0;
  await page.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/api/auth/session')return route.fulfill({json:{authenticated:false,setupRequired:false}});
   if(path==='/api/explore/feeds')return route.fulfill({json:{feeds:[]}});
   if(route.request().method()==='POST')calls.push({path,body:route.request().postDataJSON()});
   if(path==='/api/auth/login')return route.fulfill({status:403,json:{error:'verify your email before logging in'}});
   if(path==='/api/auth/register')return route.fulfill({status:409,json:{error:'email is already registered'}});
   if(path==='/api/auth/verification/resend'){attempts++;return attempts===1?route.fulfill({status:503,json:{error:'internal server error'}}):route.fulfill({json:{ok:true}})}
   return route.fulfill({json:{ok:true}});
  });
  await page.goto('/');await page.getByRole('button',{name:'Create feed',exact:true}).click();
  if(mode==='register')await page.locator('.auth-choice button').click();
  const dialog=page.locator('.auth-dialog');await dialog.getByPlaceholder('Email address').fill('pending@example.invalid');
  if(mode==='login')await dialog.getByRole('button',{name:'Continue',exact:true}).click();
  if(mode==='register')await dialog.getByPlaceholder('Username').fill('pending');
  await dialog.getByPlaceholder('Password',{exact:true}).fill('original-password');
  await dialog.locator('button[type=submit]').click();
  await expect(dialog.getByRole('alert')).toBeVisible();const resend=dialog.getByRole('button',{name:'Resend verification email',exact:true});
  if(mode==='login'){
   await expect(resend).toHaveCount(0);
   await expect(dialog.getByRole('button',{name:'Enter verification code',exact:true})).toHaveCount(0);
   expect(calls.filter(v=>v.path==='/api/auth/register'||v.path==='/api/auth/verification/resend')).toHaveLength(0);
   return;
  }
  await expect(resend).toBeVisible();
  await resend.click();await expect(dialog.getByRole('alert')).toBeVisible();await expect(resend).toBeEnabled();await resend.click();
  await expect(dialog.locator('.auth-message')).toContainText('If this account needs verification');
  expect(calls.filter(v=>v.path==='/api/auth/verification/resend')).toHaveLength(2);
  expect(calls.at(-1)?.body).toEqual({email:'pending@example.invalid',language:'en',turnstileToken:''});
  expect(calls.filter(v=>v.path==='/api/auth/register')).toHaveLength(mode==='register'?1:0);
 });
}
test('password recovery explains verification fallback instead of promising delivery',async({page})=>{
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;return route.fulfill({json:path==='/api/auth/session'?{authenticated:false,setupRequired:false}:path==='/api/explore/feeds'?{feeds:[]}:{ok:true}})});
 await page.goto('/');await page.getByRole('button',{name:'Create feed',exact:true}).click();const dialog=page.locator('.auth-dialog');await dialog.getByPlaceholder('Email address').fill('pending@example.invalid');await dialog.getByRole('button',{name:'Continue',exact:true}).click();await dialog.getByRole('button',{name:'Forgot password?',exact:true}).click();await dialog.locator('button[type=submit]').click();
 await expect(dialog.locator('.auth-message')).toContainText('If the account is eligible, an email was requested.');
 await expect(dialog.locator('.auth-message')).toContainText('Unverified accounts receive a verification code first');
});


test('successful signup opens code entry and keeps resend available',async({page})=>{
 const requests:string[]=[];
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;if(route.request().method()==='POST')requests.push(path);return route.fulfill({json:path==='/api/auth/session'?{authenticated:false,setupRequired:false}:path==='/api/explore/feeds'?{feeds:[]}:{ok:true}})});
 await page.goto('/');await page.getByRole('button',{name:'Create feed',exact:true}).click();await page.locator('.auth-choice button').click();
 const dialog=page.locator('.auth-dialog');await dialog.getByPlaceholder('Email address').fill('pending@example.invalid');await dialog.getByPlaceholder('Username').fill('pending');await dialog.getByPlaceholder('Password',{exact:true}).fill('original-password');await dialog.locator('button[type=submit]').click();
 await expect(dialog.getByRole('heading',{name:'Verify your email',exact:true})).toBeVisible();
 const code=dialog.getByRole('group',{name:'Verification code',exact:true});
 await expect(code.locator('input')).toHaveCount(16);
 await expect(code.locator('input').first()).toBeFocused();
 await expect(dialog.locator('.auth-email-address')).toHaveText('pending@example.invalid');
 await expect(dialog.getByPlaceholder('Email address')).toHaveCount(0);
 await expect(dialog.getByPlaceholder('Password',{exact:true})).toHaveCount(0);
 await dialog.getByRole('button',{name:'Resend verification email',exact:true}).click();
 await expect(dialog.locator('.auth-message')).toContainText('If this account needs verification');
 expect(requests).toEqual(['/api/auth/register','/api/auth/verification/resend']);
 await code.locator('input').first().fill('ABCD-EFGH-JKLM-NPQR');
 await expect(code.locator('input').last()).toHaveValue('R');
 await dialog.locator('button[type=submit]').click();
 await expect(dialog.getByRole('heading',{name:'Welcome back',exact:true})).toBeVisible();
 await expect(dialog.getByPlaceholder('Email address')).toHaveValue('pending@example.invalid');
 await expect(dialog.getByPlaceholder('Password',{exact:true})).toHaveValue('');
 await expect(dialog.getByRole('button',{name:'Resend verification email',exact:true})).toHaveCount(0);
 expect(requests).not.toContain('/api/auth/login');
});

