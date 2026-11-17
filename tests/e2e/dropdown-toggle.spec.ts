import {expect,test,type Page,type Locator} from '@playwright/test';

const feed={id:'news',ownerAccountId:'owner',ownerUsername:'owner',slug:'news',title:'News',stars:1,interestProfile:'News',publicFeedEnabled:true,paused:false,language:'en',briefingCadence:'daily',briefingTimezone:'UTC',retentionDays:15};
async function mock(page:Page,admin=false){
  await page.addInitScript(()=>{localStorage.setItem('dn_language','en');localStorage.setItem('dn_theme','dark')});
  await page.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/sketch'))return route.fulfill({status:404});
    return route.fulfill({json:path==='/api/auth/session'?{authenticated:true,account:{id:'owner',username:'owner',role:admin?'admin':'user'}}
      :path==='/api/me/briefings'?{briefings:[feed]}:path==='/api/explore/feeds'?{feeds:[feed]}
      :path==='/api/admin/accounts'?{accounts:[]}:path==='/api/me/sources'?{sources:[]}
      :path.startsWith('/api/feed/')?{briefing:feed,editions:[]}:{}});
  });
}
async function toggleRepeatedly(trigger:Locator,panel:Locator){
  for(let count=0;count<3;count++){
    await trigger.click();await expect(panel).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded','true');
    await trigger.click();await expect(panel).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded','false');
  }
}
for(const width of [390,1280]){
  test(`feed selectors toggle closed, retain keyboard selection and show the selected flag at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:850});await mock(page);await page.goto('/');
    await page.getByRole('button',{name:'Create feed',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Add feed'});
    const name=dialog.getByLabel('Feed name',{exact:true}),interests=dialog.getByLabel('What would you like to follow?',{exact:true});
    const heights=await Promise.all([name,interests].map(control=>control.evaluate(node=>node.closest('.voice-field')!.getBoundingClientRect().height)));
    expect(heights[0]).toBeGreaterThanOrEqual(44);expect(heights[1]).toBe(heights[0]);
    await interests.fill('A longer description\nwith several lines\nthat remains fully editable.');
    await expect(interests).toHaveValue('A longer description\nwith several lines\nthat remains fully editable.');
    expect((await interests.boundingBox())!.height).toBe((await name.boundingBox())!.height);
    await dialog.getByRole('button',{name:'Preferences',exact:true}).click();
    const language=dialog.locator('.feed-language-trigger'),languages=dialog.locator('.feed-language-menu');
    const rhythm=dialog.locator('.feed-rhythm-trigger'),rhythms=dialog.locator('.feed-rhythm-menu');
    await language.scrollIntoViewIfNeeded();
    await expect(language.locator('.feed-language-flag')).toHaveCount(1);
    await expect(language.locator('.feed-language-badge,.lucide-globe')).toHaveCount(0);
    const englishFlag=await language.locator('.feed-language-flag').innerHTML();
    await toggleRepeatedly(language,languages);
    await language.click();await languages.getByRole('option',{name:'French',exact:true}).click();
    await expect(language).toContainText('French');
    expect(await language.locator('.feed-language-flag').innerHTML()).not.toBe(englishFlag);
    await language.focus();await language.press('ArrowDown');
    await expect(languages.getByRole('option',{name:'French',exact:true})).toBeFocused();
    await languages.press('Escape');await expect(languages).toBeHidden();await expect(language).toBeFocused();
    await language.press('Space');await expect(languages).toBeVisible();
    await language.focus();await language.press('Enter');await expect(languages).toBeHidden();
    await rhythm.scrollIntoViewIfNeeded();await toggleRepeatedly(rhythm,rhythms);
    await rhythm.click();await page.keyboard.press('Escape');await expect(rhythms).toBeHidden();
    await language.click();await rhythm.click();await expect(languages).toBeHidden();await expect(rhythms).toBeVisible();
    await dialog.getByLabel('Sources',{exact:true}).click();await expect(rhythms).toBeHidden();
  });
  test(`admin role dropdown closes on the same trigger at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:850});await mock(page,true);await page.goto('/');
    await page.locator('.bottom-navigation .navigation-settings').click();await page.locator('.accounts-summary').click();
    const trigger=page.locator('.feed-role-trigger'),panel=page.locator('.feed-role-menu');
    await toggleRepeatedly(trigger,panel);
    await trigger.click();await panel.getByRole('option',{name:'Admin',exact:true}).click();
    await expect(trigger).toContainText('Admin');await expect(panel).toBeHidden();
  });
  test(`feed options close on their open trigger at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:850});await mock(page);await page.goto('/');
    const details=page.locator('.personal-feed-grid .feed-options').first(),trigger=details.locator('summary'),panel=details.locator('.feed-options-popover');
    await trigger.click();await expect(panel).toBeVisible();await trigger.click();await expect(panel).toBeHidden();
  });
}
