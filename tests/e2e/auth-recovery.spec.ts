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


test('reset password requires matching entries before making the reset request', async ({ page }) => {
  const resetRequests: unknown[] = [];
  await page.route('**/api/explore/**', route => route.fulfill({ json: { feeds: [] } }));
  await page.route('**/api/auth/session', route => route.fulfill({ json: { authenticated: false, setupRequired: false } }));
  await page.route('**/api/auth/password/reset', async route => {
    resetRequests.push(route.request().postDataJSON());
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/reset-password?token=reset-fixture');
  const resetDialog = page.getByRole('dialog', { name: 'Reset Password' });
  await expect(resetDialog).toBeVisible();
  await expect(resetDialog.getByRole('img', { name: 'Distilled.News' })).toHaveCount(0);
  await expect(resetDialog.locator('.reset-password-lock')).toHaveCount(2);
  const textColors = await resetDialog.evaluate(dialog => {
    const sample = document.createElement('span');
    sample.style.color = 'var(--muted)';
    dialog.append(sample);
    const muted = getComputedStyle(sample).color;
    sample.remove();
    return ['.email-verification-description', '.reset-password-hint'].map(selector => getComputedStyle(dialog.querySelector(selector)!).color === muted);
  });
  expect(textColors).toEqual([true, true]);
  await expect(page.locator('.guest-landing')).toBeVisible();
  await expect(page).toHaveTitle('Reset Password · Distilled.News');
  await expect(resetDialog.getByRole('link', { name: 'Back to sign in' })).toBeInViewport();
  const password = resetDialog.getByLabel('New password', { exact: true });
  const confirmation = resetDialog.getByLabel('Confirm password', { exact: true });
  await password.fill('example-password');
  await confirmation.fill('different-password');
  await resetDialog.getByRole('button', { name: 'Show confirmation password' }).click();
  await expect(confirmation).toHaveAttribute('type', 'text');
  await expect(password).toHaveAttribute('type', 'password');

  const save = resetDialog.getByRole('button', { name: 'Save new password' });
  await save.click();
  await expect(resetDialog.getByRole('alert')).toHaveText('Passwords do not match.');
  expect(resetRequests).toHaveLength(0);

  await confirmation.fill('example-password');
  await save.click();
  await expect(resetDialog.getByRole('status')).toHaveText('Password reset successfully.');
  expect(resetRequests).toEqual([{ token: 'reset-fixture', password: 'example-password' }]);
  await resetDialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('dialog', { name: 'Login or sign up' })).toBeVisible();
});

test('signup verifies a six-digit code and shows the Distilled.News welcome card',async({page})=>{
 const requests:Array<{path:string;body:Record<string,unknown>}>=[];
 await page.route('**/api/**',route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  if(request.method()==='POST')requests.push({path,body:request.postDataJSON()});
  if(path==='/api/auth/session')return route.fulfill({json:{authenticated:false,setupRequired:false}});
  if(path.startsWith('/api/explore/'))return route.fulfill({json:{feeds:[]}});
  if(path==='/api/auth/register')return route.fulfill({json:{ok:true,verificationMethod:'code'}});
  return route.fulfill({json:{ok:true}});
 });
 await page.goto('/');
 await page.getByRole('button',{name:'Create feed',exact:true}).click();
 const dialog=page.locator('.auth-dialog');
 await dialog.getByRole('button',{name:'Create an account',exact:true}).click();
 await dialog.getByPlaceholder('Email address').fill('pending@example.invalid');
 await dialog.getByPlaceholder('Username').fill('pending');
 await dialog.getByPlaceholder('Password',{exact:true}).fill('original-password');
 await dialog.locator('button[type=submit]').click();

 await expect(dialog.getByRole('heading',{name:'Enter your verification code',exact:true})).toBeVisible();
 await expect(dialog.locator('.auth-email-address')).toHaveText('pending@example.invalid');
 await expect(dialog.locator('.auth-code-cells > span')).toHaveCount(6);
 await expect(dialog.getByPlaceholder('Password',{exact:true})).toHaveCount(0);
 await expect(dialog.getByRole('button',{name:'Verify email',exact:true})).toBeDisabled();
 await expect(dialog.getByRole('img',{name:'Distilled.News',exact:true})).toBeVisible();
 await expect(dialog.getByRole('link',{name:'Get help'})).toHaveCount(0);
 await dialog.getByRole('button',{name:'Request a new code',exact:true}).click();
 await expect(dialog.locator('.auth-message')).toContainText('If this account needs verification');
 const viewport = dialog.locator('.screen-page-viewport');
 await expect.poll(() => viewport.evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);

 await dialog.getByRole('textbox',{name:'Verification code',exact:true}).fill('012 345');
 await dialog.getByRole('button',{name:'Verify email',exact:true}).click();
 await expect(dialog.getByRole('heading',{name:'Welcome to Distilled.News',exact:true})).toBeVisible();
 await expect(dialog.getByRole('img',{name:'Distilled.News',exact:true})).toBeVisible();
 await expect(dialog.getByText('Sign in to build your first briefing.',{exact:true})).toBeVisible();
 expect(requests.map(request=>request.path)).toEqual(['/api/auth/register','/api/auth/verification/resend','/api/auth/verify-email']);
 expect(requests.at(-1)?.body).toEqual({email:'pending@example.invalid',code:'012345'});
 await dialog.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(dialog.getByRole('heading',{name:'Welcome back',exact:true})).toBeVisible();
 await expect(dialog.getByPlaceholder('Email address')).toHaveValue('pending@example.invalid');
 await expect(dialog.getByPlaceholder('Password',{exact:true})).toHaveValue('');
});
