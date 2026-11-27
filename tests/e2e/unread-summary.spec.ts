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
    if(path.endsWith('/editions/one'))return route.fulfill({json:{briefing:feed,edition}});
    if(path.endsWith('/unread-summary')){calls++;expect(route.request().method()).toBe('POST');expect(route.request().postDataJSON()).toEqual({readIds:[]});return route.fulfill({json:{status:'ready',summary}});}
    return route.fulfill({json:path==='/api/auth/session'?{authenticated:true,account:{id:'owner',username:'owner',role:'user'}}:path==='/api/me/briefings'?{briefings:[feed]}:path==='/api/me/sources'?{sources:[]}:path.startsWith('/api/feed/')?{briefing:feed,editions:[edition],viewerHasStarred:false,unreadSummaryAvailable:true}:{}});
  });
  await page.goto('/owner/news/');
  const button=page.getByRole('button',{name:'Summarize',exact:true});
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
  // The summary belongs to the reader column; the controls intentionally stay narrower.
  const readerBounds = await page.locator('.news-line').boundingBox();
  expect(Math.abs(resultBounds!.width - readerBounds!.width)).toBeLessThan(2);
  expect(Math.abs(resultBounds!.x - readerBounds!.x)).toBeLessThan(2);
  expect(resultBounds!.x).toBeGreaterThanOrEqual(0);
  expect(resultBounds!.x + resultBounds!.width).toBeLessThanOrEqual(width);
  const closeBounds = await card.getByRole('button', { name: 'Close summary' }).boundingBox();
  expect(closeBounds!.width).toBeGreaterThanOrEqual(44);

  expect(await page.locator('.news-item.is-read').count()).toBe(0);
  await page.screenshot({path:`.local-reports/unread-summary/${info.project.name}-${width}-${dark?'dark':'light'}.png`,animations:'disabled'});
  const action=(await button.boundingBox())!;
  const status=(await page.locator('.page-heading > .feed-check-status').boundingBox())!;
  expect(action.height).toBeGreaterThanOrEqual(43.99);
  expect(action.y+action.height).toBeLessThanOrEqual(850);
  expect(status.y+status.height).toBeLessThan(action.y);
  await expect(page.locator('.feed-tools form')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`.local-reports/unread-summary/${info.project.name}-${width}-${dark?'dark':'light'}.png`,animations:'disabled'});
  await page.getByRole('button',{name:'Close summary'}).click();await button.click();await expect(card).toContainText(summary);expect(calls).toBe(2);
  await page.getByRole('button',{name:'Close summary'}).click();
  await page.locator('.briefing-headline-link').click();
  await expect(page.locator('.briefing-detail-hero')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('dn_read:v3:'+JSON.stringify([['account','owner'],'news'])))).toContain('one');
  await page.getByRole('link',{name:'Back to feed'}).click();
  await expect(button).toBeDisabled();
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
