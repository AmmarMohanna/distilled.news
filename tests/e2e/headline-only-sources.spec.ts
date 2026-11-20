import {expect,test} from '@playwright/test';

for(const body of ['', 'Extra briefing detail.'])test(`stories omit source-details controls and keep article citations (${body ? 'with detail' : 'headline only'})`,async({page})=>{
 const evidence={messageId:'m',sourceId:'s',sourceType:'channel',sourceTitle:'Publisher',sourceUrl:'https://publisher.example/article',postedAt:'2026-11-19T12:00:00Z',text:'Retained evidence',links:['https://publisher.example/article','https://publisher.example/related'],media:[{type:'image',url:'https://publisher.example/photo.jpg'}]};
 const section={title:'',summary:'Headline only\n'+body,evidence:[evidence]};
 const edition={id:'headline-only',briefingId:'feed',title:'Edition',summary:section.summary+' [1]',sections:[section],publishedAt:'2026-11-19T12:00:00Z'};
 const feed={id:'feed',ownerAccountId:'owner',ownerUsername:'owner',slug:'news',title:'News',publicFeedEnabled:true,language:'en',briefingCadence:'daily',briefingTimezone:'UTC',retentionDays:15};
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;return route.fulfill({json:path==='/api/auth/session'?{authenticated:false,setupRequired:false}:path.startsWith('/api/feed/')?{briefing:feed,editions:[edition],viewerHasStarred:false}:{feeds:[],briefings:[]}})});
 await page.goto('/owner/news/');
 if(body){
  await page.getByText('Read more',{exact:false}).click();
  await expect(page.locator('.briefing-expanded-text')).toContainText(body);
 }else await expect(page.locator('.briefing-read-more')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Source details',exact:true})).toHaveCount(0);
 await expect(page.locator('.briefing-extra-sources')).toHaveCount(0);
 await expect(page.locator('a[href="https://publisher.example/article"]').first()).toBeVisible();
 await expect(page.getByRole('dialog',{name:'News Briefing'})).toHaveCount(0);
});
