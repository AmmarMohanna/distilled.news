import {expect,test} from '@playwright/test';
for(const size of [{width:320,height:568},{width:390,height:664},{width:667,height:375},{width:1280,height:593},{width:1440,height:900}])for(const empty of [false,true])test(`reader fits ${size.width}x${size.height} ${empty?'waiting':'published'}`,async({page},info)=>{
 await page.setViewportSize(size);
 const feed={id:'one',ownerUsername:'reader',slug:'news',title:'Personal Briefing',publicFeedEnabled:true,paused:false,language:'en',briefingCadence:'daily',stars:0};
 const editions=Array.from({length:20},(_,i)=>({id:String(i),title:'Technology and economic developments '+i,summary:'A detailed verified story with supporting sources. '.repeat(12),publishedAt:new Date(Date.now()-i*3600000).toISOString(),sections:[]}));
 await page.route('**/api/**',route=>route.fulfill({json:new URL(route.request().url()).pathname==='/api/feed/reader/news'?{briefing:feed,editions:empty?[]:editions,publicationState:empty?'quiet':'published',sourceAvailability:Array.from({length:5},(_,i)=>({sourceId:String(i),title:'Google News: publisher '+i,state:empty?'UNAVAILABLE':'AVAILABLE',reason:empty?'CONNECTORS_DISABLED':undefined,providers:empty?[]:['google_rss'],acquisition:{completed:30,pending:empty?5:0,failed:0}})),viewerHasStarred:false}:{authenticated:false,feeds:[]}}));
 await page.goto('/reader/news/');await expect(page.locator('.briefing-pages')).toBeVisible();
 const viewport=page.locator('.app-pages > .screen-page-viewport');
 await expect.poll(()=>viewport.evaluate(node=>node.scrollHeight-node.clientHeight)).toBeLessThanOrEqual(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(!empty){await expect(page.getByRole('button',{name:'Next stories',exact:true})).toBeVisible();const first=await page.locator('.briefing-story-title').first().textContent();await page.getByRole('button',{name:'Next stories',exact:true}).click();expect(await page.locator('.briefing-story-title').first().textContent()).not.toBe(first);}
 if(size.width<1000){await page.getByRole('button',{name:'Overview',exact:true}).click();await expect(page.locator('.briefing-sidebar')).toBeVisible();await expect.poll(()=>viewport.evaluate(node=>node.scrollHeight-node.clientHeight)).toBeLessThanOrEqual(1);await page.getByRole('button',{name:'Next overview',exact:true}).click();await expect.poll(()=>viewport.evaluate(node=>node.scrollHeight-node.clientHeight)).toBeLessThanOrEqual(1);}
 await page.screenshot({path:info.outputPath('reader.png')});
});
