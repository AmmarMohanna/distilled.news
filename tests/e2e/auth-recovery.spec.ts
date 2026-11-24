import {expect,test} from '@playwright/test';

for(const mode of ['login','register'] as const){
 test(`does not offer verification recovery after rejected ${mode}`,async({page})=>{
  const calls:Array<{path:string;body:Record<string,unknown>}>=[];
  await page.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path==='/api/auth/session')return route.fulfill({json:{authenticated:false,setupRequired:false}});
   if(path==='/api/explore/feeds')return route.fulfill({json:{feeds:[]}});
   if(route.request().method()==='POST')calls.push({path,body:route.request().postDataJSON()});
   if(path==='/api/auth/login')return route.fulfill({status:403,json:{error:'verify your email before logging in'}});
   if(path==='/api/auth/register')return route.fulfill({status:409,json:{error:'email is already registered'}});

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
  await expect(resend).toHaveCount(0);
  await expect(dialog.getByRole('button',{name:'Enter verification code',exact:true})).toHaveCount(0);
  expect(calls.filter(v=>v.path==='/api/auth/verification/resend')).toHaveLength(0);
  expect(calls.filter(v=>v.path==='/api/auth/register')).toHaveLength(mode==='register'?1:0);
 });
}
test('password recovery explains where to look for a reset link',async({page})=>{
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;return route.fulfill({json:path==='/api/auth/session'?{authenticated:false,setupRequired:false}:path==='/api/explore/feeds'?{feeds:[]}:{ok:true}})});
 await page.goto('/');await page.getByRole('button',{name:'Create feed',exact:true}).click();const dialog=page.locator('.auth-dialog');await dialog.getByPlaceholder('Email address').fill('pending@example.invalid');await dialog.getByRole('button',{name:'Continue',exact:true}).click();await dialog.getByRole('button',{name:'Forgot password?',exact:true}).click();await dialog.locator('button[type=submit]').click();
 await expect(dialog.locator('.auth-message')).toContainText('If the account is eligible, check your inbox and spam folder for a password-reset link.');

});


test('successful signup asks the user to open the emailed link and keeps resend available',async({page})=>{
 const requests:string[]=[];
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;if(route.request().method()==='POST')requests.push(path);return route.fulfill({json:path==='/api/auth/session'?{authenticated:false,setupRequired:false}:path==='/api/explore/feeds'?{feeds:[]}:{ok:true}})});
 await page.goto('/');await page.getByRole('button',{name:'Create feed',exact:true}).click();await page.locator('.auth-choice button').click();
 const dialog=page.locator('.auth-dialog');await dialog.getByPlaceholder('Email address').fill('pending@example.invalid');await dialog.getByPlaceholder('Username').fill('pending');await dialog.getByPlaceholder('Password',{exact:true}).fill('original-password');await dialog.locator('button[type=submit]').click();
 await expect(dialog.getByRole('heading',{name:'Check your email',exact:true})).toBeVisible();
 await expect(dialog.getByText('Open the verification link sent to your email.',{exact:true})).toBeVisible();
 await expect(dialog.locator('.auth-email-address')).toHaveText('pending@example.invalid');
 await expect(dialog.getByPlaceholder('Email address')).toHaveCount(0);
 await expect(dialog.getByPlaceholder('Password',{exact:true})).toHaveCount(0);
 await dialog.getByRole('button',{name:'Resend verification email',exact:true}).click();
 await expect(dialog.locator('.auth-message')).toContainText('If this account needs verification');
 expect(requests).toEqual(['/api/auth/register','/api/auth/verification/resend']);
});
