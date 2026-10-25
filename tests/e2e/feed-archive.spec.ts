import { expect, test } from '@playwright/test';

test('Home archive resumes owned feeds; Explore shows active community feeds only', async ({page}, info) => {
  const errors: string[]=[];
  page.on('pageerror', error=>errors.push(error.message));
  const base={ownerAccountId:'reader',ownerUsername:'reader',stars:0,interestProfile:'News',styleInstruction:'Calm',publicFeedEnabled:true,paused:false,language:'en',intensity:'low',briefingCadence:'interval',updateIntervalMinutes:30,briefingTimezone:'Asia/Beirut',retentionDays:15};
  let owned=[{...base,id:'active',slug:'active',title:'Active news'},{...base,id:'paused',slug:'paused',title:'Archived news',paused:true}];
  const community={...base,id:'community',ownerAccountId:'other',ownerUsername:'other',slug:'world',title:'Community news'};
  let fail=true;
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/sketch'))return route.fulfill({status:404});
    if(path==='/api/auth/session')return route.fulfill({json:{authenticated:true,setupRequired:false,account:{id:'reader',username:'reader',email:'reader@example.test',role:'user'}}});
    if(path==='/api/me/briefings' || path==='/api/me/feeds'){
      if(route.request().method()==='POST'){
        if(fail){fail=false;return route.fulfill({status:500,json:{error:'Could not save'}});}
        const input=route.request().postDataJSON();
        expect(input.id).toBe('paused');expect(input.paused).toBe(false);
        owned=owned.map(feed=>feed.id===input.id?{...feed,...input}:feed);
        return route.fulfill({json:{briefing:owned.find(feed=>feed.id===input.id)}});
      }
      return route.fulfill({json:{briefings:owned}});
    }
    if(path==='/api/explore/feeds')return route.fulfill({json:{feeds:[...owned,community],nextOffset:null}});
    if(path.startsWith('/api/feed/'))return route.fulfill({json:{briefing:[...owned,community].find(feed=>path===`/api/feed/${feed.ownerUsername}/${feed.slug}`)??community,editions:[],viewerHasStarred:false}});
    if(path==='/api/me/sources')return route.fulfill({json:{sources:[]}});
    if(path==='/api/me/health')return route.fulfill({json:{health:{processing:{queued:0,completed:0,failed:0}}}});
    return route.fulfill({json:{}});
  });
  await page.goto('/');
  await expect(page.locator('.personal-feed-grid')).toContainText('Active news');
  await expect(page.locator('.personal-feed-grid')).not.toContainText('Archived news');
  const archive=page.getByRole('button',{name:'Archived feeds',exact:true});
  await archive.click();
  const dialog=page.getByRole('dialog',{name:'Archived feeds'});
  await expect(dialog).toContainText('Archived news');
  const resume=dialog.getByRole('button',{name:'Resume feed: Archived news'});
  await resume.click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(resume).toBeEnabled();
  await page.screenshot({path:`.local-reports/feed-archive/${info.project.name}-archive.png`});
  await resume.click();
  await expect(dialog.getByRole('status')).toHaveText('Feed resumed.');
  await expect(dialog).toContainText('No archived feeds');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(archive).toBeFocused();
  await expect(page.locator('.personal-feed-grid')).toContainText('Archived news');
  await page.getByRole('button',{name:'Explore',exact:true}).click();
  await expect(page.locator('.explore-view .curated-feed-grid')).toContainText('Community news');
  await expect(page.locator('.explore-view')).not.toContainText('Active news');
  await expect(page.locator('.explore-view')).not.toContainText('Archived news');
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await page.setViewportSize({width:320,height:740});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const [a,b]=await Promise.all([archive.boundingBox(),page.getByRole('button',{name:'Create feed',exact:true}).boundingBox()]);
  expect(a!.width).toBeGreaterThanOrEqual(44);
  expect(a!.x+a!.width).toBeLessThanOrEqual(b!.x);
  await page.screenshot({path:`.local-reports/feed-archive/${info.project.name}-home-320.png`});
  await page.evaluate(()=>{
    localStorage.setItem('dn_language','ar');
    window.dispatchEvent(new Event('dn-language'));
    document.documentElement.dataset.theme='dark';
    document.documentElement.style.fontSize='200%';
  });
  await page.locator('.home-archive-button').click();
  await expect(page.getByRole('dialog')).toContainText('لا توجد خلاصات مؤرشفة');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const bounds=await page.getByRole('dialog').boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(321);
  await page.screenshot({path:`.local-reports/feed-archive/${info.project.name}-archive-arabic-200.png`});
  expect(errors).toEqual([]);
});
