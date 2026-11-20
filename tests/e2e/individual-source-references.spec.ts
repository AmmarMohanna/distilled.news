import {expect,test} from '@playwright/test';

for(const language of ['en','fr','ar'])test(`each supporting source opens separately in ${language}`,async({page})=>{
 const feed={id:'source-reference-feed',ownerUsername:'owner',slug:'news',title:'News',publicFeedEnabled:true,language,briefingCadence:'daily',briefingTimezone:'UTC'};
 const evidence=(id:number)=>({messageId:`message-${id}`,sourceId:`source-${id}`,sourceType:'channel',sourceProvider:'rss',sourceTitle:`Publisher ${id}`,headline:`Article ${id}`,sourceUrl:`https://publisher${id}.example/feed`,postedAt:'2026-11-17T12:00:00Z',text:`Retained source ${id}`,links:[`https://publisher${id}.example/article`],media:[]});
 const sections=[{title:'',summary:'First headline\nFirst explanation.',evidence:[evidence(1),evidence(2),evidence(3)]},{title:'',summary:'Second headline\nSecond explanation.',evidence:[evidence(4)]}];
 const edition={id:'source-reference-edition',briefingId:feed.id,title:'Edition',summary:sections.map((section,index)=>`${section.summary} [${index+1}]`).join('\n\n'),publishedAt:'2026-11-17T12:00:00Z',sections};
 await page.addInitScript(language=>localStorage.setItem('dn_language',language),language);
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/auth/session')return route.fulfill({json:{authenticated:false,setupRequired:false}});
  if(path.endsWith('/sketch'))return route.fulfill({status:404});
  if(path.includes('/editions/'))return route.fulfill({json:{edition}});
  if(path.startsWith('/api/feed/'))return route.fulfill({json:{briefing:feed,editions:[edition],viewerHasStarred:false}});
  return route.fulfill({json:{feeds:[],briefings:[]}});
 });
 await page.goto('/owner/news/');
 const first=page.locator('.news-story').first();
 await expect(first.locator('.briefing-reference > bdi')).toHaveText(['[1]','[2]','[3]']);
 const third=first.locator('.briefing-reference').nth(2);
 await third.focus();
 await expect(third.getByRole('tooltip')).toHaveText('publisher3.example');
 await expect(third.getByRole('tooltip').locator('img,svg')).toHaveCount(1);
 await expect(third).toHaveAttribute('href','https://publisher3.example/article');
 await page.context().route('https://publisher3.example/**',route=>route.fulfill({body:'Article 3'}));
 const opened=page.waitForEvent('popup');await third.click();const article=await opened;
 await expect(article).toHaveURL('https://publisher3.example/article');await article.close();
 await expect(page.locator('.news-briefing-dialog')).toHaveCount(0);
 await first.locator('.briefing-read-more > summary').click();
 await expect(first.locator('.briefing-expanded-text')).toContainText('First explanation.');
 await expect(first.locator('.briefing-extra-sources')).toHaveCount(0);
 for(let index=0;index<3;index++){
  await expect(first.locator('.briefing-reference').nth(index)).toHaveAttribute('href',`https://publisher${index+1}.example/article`);
 }
 await expect(page.locator('.news-briefing-dialog')).toHaveCount(0);
 await expect(page.locator('.news-story').nth(1).locator('.briefing-reference')).toHaveAttribute('href','https://publisher4.example/article');
});
