import {expect,test} from '@playwright/test';

for(const width of [320,390,1280])for(const dark of [false,true])test(`unread catch-up stays compact and cached at ${width}px, ${dark?'dark':'light'}`,async({page},info)=>{
  await page.setViewportSize({width,height:850});
  await page.addInitScript(({dark})=>{localStorage.setItem('dn_theme',dark?'dark':'light');}, {dark});
  const feed={id:'news',ownerAccountId:'owner',ownerUsername:'owner',slug:'news',title:'AI news',stars:1,interestProfile:'AI news',publicFeedEnabled:true,paused:false,language:'en',nextBriefingAt:new Date(Date.now()+18*60000).toISOString(),briefingCadence:'daily',briefingTimezone:'UTC',retentionDays:15};
  const summary='OpenAI released a smaller model, while a separate university team published research on improving model efficiency. A proposed chip-export change still awaits approval. These are separate developments; the proposal has not taken effect.';
  const edition={id:'one',briefingId:'news',title:'AI developments',summary:'OpenAI released a smaller model. [1]',publishedAt:new Date().toISOString(),sections:[{title:'A smaller model',summary:'OpenAI released a smaller model.',evidence:[]}]};
  let calls=0;
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/sketch'))return route.fulfill({status:404});
    if(path.endsWith('/unread-summary')){calls++;expect(route.request().method()).toBe('POST');expect(route.request().postDataJSON()).toEqual({readIds:[]});return route.fulfill({json:{status:'ready',summary}});}
    return route.fulfill({json:path==='/api/auth/session'?{authenticated:true,account:{id:'owner',username:'owner',role:'user'}}:path==='/api/me/briefings'?{briefings:[feed]}:path==='/api/me/sources'?{sources:[]}:path.startsWith('/api/feed/')?{briefing:feed,editions:[edition],viewerHasStarred:false,unreadSummaryAvailable:true}:{}});
  });
  await page.goto('/owner/news/');
  const button=page.getByRole('button',{name:'Summarize unread',exact:true});
  await expect(button).toBeVisible();expect(calls).toBe(0);
  await button.click();
  const card=page.getByRole('region',{name:'Unread summary'});
  await expect(card).toContainText(summary);
  await expect(card.locator('p')).toHaveCount(1);
  expect(calls).toBe(1);
  await page.reload();
  await expect(card).toContainText(summary);
  expect(calls).toBe(1);
  const resultBounds = await card.boundingBox();
  const toolbarBounds = await page.locator('.feed-tools').boundingBox();
  expect(Math.abs(resultBounds!.width - toolbarBounds!.width)).toBeLessThan(2);
  expect(resultBounds!.x).toBeGreaterThanOrEqual(0);
  expect(resultBounds!.x + resultBounds!.width).toBeLessThanOrEqual(width);
  const closeBounds = await card.getByRole('button', { name: 'Close summary' }).boundingBox();
  expect(closeBounds!.width).toBeGreaterThanOrEqual(44);

  expect(await page.locator('.news-item.is-read').count()).toBe(0);
  await page.screenshot({path:`.local-reports/unread-summary/${info.project.name}-${width}-${dark?'dark':'light'}.png`,animations:'disabled'});
  const [search,action]=await Promise.all([page.locator('.feed-tools form').boundingBox(),button.boundingBox()]);
  expect(action!.height).toBeGreaterThanOrEqual(43.99);
  expect(action!.y+action!.height<=850).toBe(true);
  if(width>600) {
    expect(Math.abs(search!.y+search!.height/2-action!.y-action!.height/2)).toBeLessThan(3);
    expect(search!.width).toBeGreaterThan(action!.width * 2);
    expect(action!.width).toBeLessThan(280);
  }
  else {
    expect(action!.y).toBeGreaterThanOrEqual(search!.y+search!.height);
    const status=await page.locator('.feed-check-status').boundingBox();
    expect(Math.abs(status!.y-action!.y)).toBeLessThan(2);
    expect(status!.x+status!.width).toBeLessThanOrEqual(action!.x);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`.local-reports/unread-summary/${info.project.name}-${width}-${dark?'dark':'light'}.png`,animations:'disabled'});
  await page.getByRole('button',{name:'Close summary'}).click();await button.click();await expect(card).toContainText(summary);expect(calls).toBe(2);
  await page.getByRole('button',{name:'Close summary'}).click();
  await page.locator('.read-button').click();await expect(button).toBeDisabled();
});

test('Arabic catch-up fits a narrow reader with enlarged text',async({page},info)=>{
  await page.setViewportSize({width:320,height:900});
  await page.addInitScript(()=>{localStorage.setItem('dn_language','ar');localStorage.setItem('dn_theme','dark');});
  const feed={id:'news',ownerAccountId:'owner',ownerUsername:'owner',slug:'news',title:'أخبار لبنان',stars:0,interestProfile:'Lebanon',publicFeedEnabled:true,paused:false,language:'ar',briefingCadence:'daily',briefingTimezone:'UTC',retentionDays:15};
  const summary='اقترحت الحكومة خطة جديدة للكهرباء، لكنها ما زالت بحاجة إلى الموافقة.';
  await page.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/sketch'))return route.fulfill({status:404});
    if(path.endsWith('/unread-summary'))return route.fulfill({json:{status:'ready',summary}});
    return route.fulfill({json:path==='/api/auth/session'?{authenticated:true,account:{id:'owner',username:'owner',role:'user'}}:path==='/api/me/briefings'?{briefings:[feed]}:path.startsWith('/api/feed/')?{briefing:feed,editions:[{id:'one',briefingId:'news',title:'News',summary,publishedAt:new Date().toISOString(),sections:[{title:'الكهرباء',summary,evidence:[]}]}],unreadSummaryAvailable:true}:{}});
  });
  await page.goto('/owner/news/');
  await page.addStyleTag({content:'html { font-size: 200% !important; }'});
  await page.locator('.unread-summary-button').click();
  await expect(page.locator('.unread-summary-card')).toContainText(summary);
  await page.screenshot({path:`.local-reports/unread-summary/${info.project.name}-arabic-large.png`,animations:'disabled'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const [close,paragraph]=await Promise.all([page.locator('.unread-summary-close').boundingBox(),page.locator('.unread-summary-card p').boundingBox()]);
  expect(close!.x+close!.width).toBeLessThanOrEqual(paragraph!.x);
});
