import { expect, test } from '@playwright/test';

test('saved mixed sources appear in the feed with publisher logos and survive reopening', async ({page}) => {
  const feed={id:'mixed',ownerAccountId:'owner',ownerUsername:'joud',slug:'mixed',title:'Mixed news',interestProfile:'Lebanon and science',publicFeedEnabled:true,paused:false,language:'en',briefingCadence:'daily',briefingTimeOfDay:'08:00',briefingTimezone:'Asia/Beirut',updateIntervalMinutes:1440,stars:0};
  let sources=['https://mtv.com.lb/'];
  await page.route('https://www.google.com/s2/favicons**', route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="purple"/></svg>'}));
  await page.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/api/me/feeds' && route.request().method()==='POST') {
      sources=route.request().postDataJSON().sourceInputs;
      return route.fulfill({json:{briefing:feed}});
    }
    return route.fulfill({json:path==='/api/auth/session'?{authenticated:true,account:{id:'owner',username:'joud',role:'user'}}:path==='/api/me/briefings'?{briefings:[feed]}:path==='/api/me/sources'?{sources:sources.map((input,i)=>({id:String(i),briefingId:feed.id,title:new URL(input).hostname,input,sourceUrl:input,enabled:true}))}:path==='/api/feed/joud/mixed'?{briefing:feed,editions:[],viewerHasStarred:false}:{feeds:[]}});
  });
  await page.goto('/joud/mixed/');
  await expect(page.getByRole('button',{name:'Edit feed settings',exact:true})).toBeVisible();
  if(await page.getByRole('button',{name:'Overview',exact:true}).isVisible())await page.getByRole('button',{name:'Overview',exact:true}).click();
  if(await page.locator('.feed-selected-source').count()===0)await page.getByRole('button',{name:'Next overview',exact:true}).click();
  await expect(page.locator('.feed-selected-source')).toHaveCount(1);
  await page.getByRole('button',{name:'Edit feed settings',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Edit feed settings'});
  await dialog.getByPlaceholder('Search sources or paste a URL').fill('https://bbc.com/news');
  await dialog.getByRole('button',{name:'Add source',exact:true}).click();
  await expect(dialog.locator('.selected-source-row')).toHaveCount(2);
  await expect(dialog.locator('.selected-source-row .source-logo').last()).toHaveAttribute('src',/domain=bbc.com/);
  await dialog.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.feed-selected-source')).toHaveCount(2);
  await expect(page.locator('.feed-selected-source .source-logo').first()).toHaveAttribute('src',/domain=mtv.com.lb/);
  await expect(page.locator('.feed-selected-source .source-logo').last()).toHaveAttribute('src',/domain=bbc.com/);
  await page.reload();
  await expect(page.getByRole('button',{name:'Edit feed settings',exact:true})).toBeVisible();
  if(await page.getByRole('button',{name:'Overview',exact:true}).isVisible())await page.getByRole('button',{name:'Overview',exact:true}).click();
  if(await page.locator('.feed-selected-source').count()===0)await page.getByRole('button',{name:'Next overview',exact:true}).click();
  await expect(page.locator('.feed-selected-source')).toHaveCount(2);
  await page.getByRole('button',{name:'Edit feed settings',exact:true}).click();
  await expect(page.getByRole('dialog').locator('.selected-source-row')).toHaveCount(2);
});
