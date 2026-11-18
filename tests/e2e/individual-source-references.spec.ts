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
 await expect(first.locator('.briefing-reference')).toHaveText(['[1]','[2]','[3]']);
 await first.locator('.briefing-reference').nth(2).click();
 const dialog=page.locator('.news-briefing-dialog');
 await expect(dialog.locator('.news-briefing-publisher')).toHaveText('Publisher 3');
 await expect(dialog.locator('.news-briefing-read')).toHaveAttribute('href','https://publisher3.example/article');
 await expect(dialog.locator('.news-briefing-additional-sources')).toHaveCount(0);
 await dialog.locator('.news-briefing-references button').nth(1).click();
 await expect(dialog.locator('.news-briefing-publisher')).toHaveText('Publisher 2');
 await expect(dialog.locator('.news-briefing-read')).toHaveAttribute('href','https://publisher2.example/article');
 await dialog.locator('.news-briefing-header > button').click();
 await page.locator('.news-story').nth(1).locator('.briefing-reference').click();
 await expect(dialog.locator('h3')).toHaveText('Second headline');
 await expect(dialog.locator('.news-briefing-read')).toHaveAttribute('href','https://publisher4.example/article');
});
