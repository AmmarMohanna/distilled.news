import {expect,test} from '@playwright/test';
for(const width of [390,1440])test(`feed reading dashboard works at ${width}px`,async({page},info)=>{
 await page.setViewportSize({width,height:940});
 const feed={id:'reference',ownerUsername:'reader',slug:'news',title:'Personal Briefing',publicFeedEnabled:true,paused:false,language:'en',briefingCadence:'daily',stars:0};
 const editions=Array.from({length:6},(_,i)=>({id:String(i),title:['Lebanon economic reform','Technology infrastructure expands','Climate and energy investment'][i%3]+' '+i,summary:'A verified development with supporting evidence.',publishedAt:new Date(Date.now()-i*3600000).toISOString(),sections:[]}));
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;return route.fulfill({json:path==='/api/feed/reader/news'?{briefing:feed,editions,viewerHasStarred:false}:path==='/api/auth/session'?{authenticated:false}:path.endsWith('/editions/0')?{edition:editions[0]}:{feeds:[]}})});
 await page.goto('/reader/news/');await expect(page.locator('.briefing-story-title').first()).toBeVisible();
 if(width<1000)await page.getByRole('button',{name:'Overview',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Feed Summary',exact:true})).toBeVisible();
 if(width<1000)await page.getByRole('button',{name:'Briefings',exact:true}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(width>1000){const main=(await page.locator('.briefing-main').boundingBox())!,side=(await page.locator('.briefing-sidebar').boundingBox())!;expect(side.x).toBeGreaterThan(main.x+main.width);}
 await page.screenshot({path:info.outputPath("before.png")});
 await page.getByRole('button',{name:'Save '+editions[0].title,exact:true}).click();
 await page.getByRole('tab',{name:'Saved',exact:true}).click();await expect(page.locator('.news-item')).toHaveCount(1);
 await page.reload();await page.getByRole('tab',{name:'Saved',exact:true}).click();await expect(page.locator('.news-item')).toHaveCount(1);
 await page.getByRole('tab',{name:'Latest',exact:true}).click();
 await page.getByRole('combobox',{name:'Sort by',exact:true}).selectOption('oldest');await expect(page.locator('.briefing-story-title').first()).toHaveText(editions[5].title);
 await page.getByRole('button',{name:'mark '+editions[5].title+' read',exact:true}).click();
 await page.getByRole('tab',{name:'Read',exact:true}).click();await expect(page.locator('.news-item')).toHaveCount(1);
 await page.getByRole('tab',{name:'Latest',exact:true}).click();
 await page.screenshot({path:info.outputPath('dashboard.png'),fullPage:true});
});
for(const language of ['fr','ar'])for(const width of [390,1440])test(`translated dashboard fits ${language} at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.addInitScript(lang=>localStorage.setItem('dn_language',lang),language);
 await page.route('**/api/**',route=>route.fulfill({json:new URL(route.request().url()).pathname==='/api/feed/reader/news'?{briefing:{id:'translated',ownerUsername:'reader',slug:'news',title:'Personal Briefing',publicFeedEnabled:true,paused:false,language,stars:0},editions:[],viewerHasStarred:false}:{authenticated:false,feeds:[]}}));
 await page.goto('/reader/news/');await expect(page.locator('.briefing-sidebar')).toBeAttached();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(width===1440){const nav=(await page.locator('.bottom-navigation').boundingBox())!,content=(await page.locator('.briefing-main').boundingBox())!,side=(await page.locator('.briefing-sidebar').boundingBox())!;expect(Math.min(content.x,side.x)).toBeGreaterThanOrEqual(nav.x+nav.width);}
});
