import { expect, test, type Locator, type Page } from '@playwright/test';

async function contrast(locator: Locator, pseudo: string | null = null) {
  return locator.evaluate((element,pseudo)=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const ctx=canvas.getContext('2d')!;
    const rgb=(color:string)=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};
    const chain:Element[]=[];for(let node:Element|null=element;node;node=node.parentElement)chain.unshift(node);
    let background=[255,255,255];
    for(const node of chain){const c=rgb(getComputedStyle(node).backgroundColor),alpha=c[3]/255;background=background.map((v,i)=>c[i]*alpha+v*(1-alpha));}
    const c=rgb(getComputedStyle(element,pseudo).color),alpha=c[3]/255,foreground=background.map((v,i)=>c[i]*alpha+v*(1-alpha));
    const luminance=(color:number[])=>color.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
    const a=luminance(foreground),b=luminance(background);
    return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  },pseudo);
}

async function mock(page:Page) {
  const feed={id:'news',ownerAccountId:'owner',ownerUsername:'owner',slug:'news',title:'World news',stars:3,interestProfile:'Important news',styleInstruction:'Concise',publicFeedEnabled:true,paused:false,language:'en',intensity:'low',briefingCadence:'daily',briefingTimeOfDay:'09:00',briefingTimezone:'UTC',retentionDays:15};
  const edition={id:'edition',briefingId:'news',title:'Latest news',summary:'The team published its findings and outlined the next steps. [1]',publishedAt:new Date().toISOString(),sections:[{title:'Research team publishes new findings',summary:'The team published its findings and outlined the next steps. [1]',evidence:[{messageId:'m1',sourceTitle:'Original source',sourceUrl:'https://example.test/research',text:'The team published its findings and outlined the next steps.',postedAt:new Date().toISOString(),links:[],media:[]}]}]};
  await page.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/sketch'))return route.fulfill({status:404});
    return route.fulfill({json:path==='/api/auth/session'?{authenticated:true,setupRequired:false,account:{id:'owner',username:'owner',email:'owner@example.test',role:'user'}}
      :path==='/api/me/briefings'?{briefings:[feed]}
      :path==='/api/me/sources'?{sources:[]}
      :path==='/api/explore/feeds'?{feeds:[{...feed,id:'other',ownerAccountId:'other',ownerUsername:'other'}],nextOffset:null}
      :path.startsWith('/api/feed/')?{briefing:feed,editions:[edition],viewerHasStarred:false}
      :path==='/api/me/health'?{health:{processing:{queued:0,completed:0,failed:0}}}:{}});
  });
}

test('dark Home, Explore and creation controls retain readable contrast',async({page},info)=>{
  await mock(page);
  await page.addInitScript(()=>localStorage.setItem('dn_theme','dark'));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  expect(await contrast(page.locator('.welcome-copy h1'))).toBeGreaterThanOrEqual(7);
  expect(await contrast(page.locator('.home-add-feed'))).toBeGreaterThanOrEqual(4.5);
  expect(await contrast(page.locator('.personal-feed-grid .topic-name strong'))).toBeGreaterThanOrEqual(7);
  await page.getByRole('button',{name:'Explore',exact:true}).click();
  await expect(page.locator('.curated-feed-grid .topic-card')).toHaveCount(1);
  expect(await contrast(page.locator('.curated-feed-grid .topic-name strong'))).toBeGreaterThanOrEqual(7);
  await page.screenshot({path:`.local-reports/dark-mode/${info.project.name}-explore.png`});
  await page.getByRole('button',{name:'Create feed',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  expect(await contrast(dialog.getByRole('textbox').first())).toBeGreaterThanOrEqual(4.5);
  expect(await contrast(dialog.getByRole('textbox').first(),'::placeholder')).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({path:`.local-reports/dark-mode/${info.project.name}-create.png`,animations:'disabled'});
});

test('dark reader text, metadata, citations and actions meet contrast thresholds',async({page},info)=>{
  await mock(page);
  await page.addInitScript(()=>localStorage.setItem('dn_theme','dark'));
  await page.goto('/owner/news/');
  await expect(page.locator('.news-summary')).toBeVisible();
  expect(await contrast(page.locator('.news-summary'))).toBeGreaterThanOrEqual(7);
  expect(await contrast(page.locator('.news-sources'))).toBeGreaterThanOrEqual(4.5);
  expect(await contrast(page.locator('.inline-reference').first())).toBeGreaterThanOrEqual(4.5);
  expect(await contrast(page.locator('.feed-header-actions > button').first())).toBeGreaterThanOrEqual(4.5);
  expect(await contrast(page.locator('.news-head time'))).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({path:`.local-reports/dark-mode/${info.project.name}-reader.png`});
  await page.locator('.read-button').click();
  expect(await contrast(page.locator('.news-summary'))).toBeGreaterThanOrEqual(4.5);
  await page.emulateMedia({contrast:'more',reducedMotion:'reduce'});
  expect(await contrast(page.locator('.news-summary'))).toBeGreaterThanOrEqual(4.5);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
