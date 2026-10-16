import {expect,test} from '@playwright/test';
for(const scenario of [
 {reason:'CONNECTORS_DISABLED',message:'Source collection is disabled on this deployment.'},
 {reason:'PRIVATE_SERVICE_UNAVAILABLE',message:'This source requires the private collection service.'},
 {reason:undefined,message:'No new developments in the latest scheduled briefing.'}
])test(`quiet feed accurately reports ${scenario.reason??'successful quiet collection'}`,async({page})=>{
 await page.route('**/api/**',route=>route.fulfill({json:new URL(route.request().url()).pathname==='/api/feed/reader/news'?{briefing:{id:'one',ownerUsername:'reader',slug:'news',title:'Personal Briefing',publicFeedEnabled:true,paused:false,language:'en',briefingCadence:'daily',stars:0},editions:[],publicationState:'quiet',viewerHasStarred:false,sourceAvailability:[{sourceId:'google',title:'Google News: bbc',state:scenario.reason?'UNAVAILABLE':'AVAILABLE',providers:scenario.reason?[]:['google_rss'],reason:scenario.reason,acquisition:{completed:scenario.reason?0:1,pending:0,failed:0}}]}:{authenticated:false,feeds:[]}}));
 await page.goto('/reader/news/');await expect(page.getByText(scenario.message,{exact:false})).toBeVisible();
 if(scenario.reason){await expect(page.getByText('No new developments in the latest scheduled briefing.',{exact:true})).toHaveCount(0);await expect(page.locator('.feed-empty-state')).toContainText('this does not mean there is no news');}
});
