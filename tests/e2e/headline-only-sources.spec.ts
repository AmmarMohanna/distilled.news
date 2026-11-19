import {expect,test} from '@playwright/test';

test('headline-only stories retain access to related links and attachments',async({page})=>{
 const evidence={messageId:'m',sourceId:'s',sourceType:'channel',sourceTitle:'Publisher',sourceUrl:'https://publisher.example/article',postedAt:'2026-11-19T12:00:00Z',text:'Retained evidence',links:['https://publisher.example/article','https://publisher.example/related'],media:[{type:'image',url:'https://publisher.example/photo.jpg'}]};
 const section={title:'',summary:'Headline only\n',evidence:[evidence]};
 const edition={id:'headline-only',briefingId:'feed',title:'Edition',summary:section.summary+' [1]',sections:[section],publishedAt:'2026-11-19T12:00:00Z'};
 const feed={id:'feed',ownerAccountId:'owner',ownerUsername:'owner',slug:'news',title:'News',publicFeedEnabled:true,language:'en',briefingCadence:'daily',briefingTimezone:'UTC',retentionDays:15};
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;return route.fulfill({json:path==='/api/auth/session'?{authenticated:false,setupRequired:false}:path.startsWith('/api/feed/')?{briefing:feed,editions:[edition],viewerHasStarred:false}:{feeds:[],briefings:[]}})});
 await page.goto('/owner/news/');
 await expect(page.locator('.briefing-read-more')).toHaveCount(0);
 await page.getByRole('button',{name:'Source details',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'News Briefing'});
 await expect(dialog.locator('a[href="https://publisher.example/related"]')).toBeVisible();
 await expect(dialog.locator('a[href="https://publisher.example/photo.jpg"]')).toBeVisible();
});
