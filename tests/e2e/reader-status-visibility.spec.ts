import {expect,test} from '@playwright/test';

for(const viewer of ['guest','owner','admin'] as const)for(const state of ['failed','quiet'] as const){
 test(`${viewer} sees the intended ${state} reader status`,async({page})=>{
  const feed={id:'status-feed',ownerAccountId:'owner',ownerUsername:'owner',slug:'news',title:'News',publicFeedEnabled:true,paused:false,language:'en',briefingCadence:'daily',briefingTimezone:'UTC',retentionDays:15};
  const account={id:viewer==='admin'?'admin':'owner',username:viewer==='admin'?'admin':'owner',role:viewer==='admin'?'admin':'user',email:'fixture@example.invalid'};
  await page.route('**/api/**',route=>{
   const path=new URL(route.request().url()).pathname;
   return route.fulfill({json:path==='/api/auth/session'?{authenticated:viewer!=='guest',setupRequired:false,...(viewer!=='guest'?{account}:{})}:path==='/api/me/briefings'?{briefings:[feed]}:path==='/api/feed/owner/news'?{briefing:feed,editions:[],publicationState:state,sourceAvailability:[{sourceId:'source',title:'Publisher',state:'UNAVAILABLE',providers:[],reason:'BUDGET_EXHAUSTED'}]}:{feeds:[]}});
  });
  await page.goto('/owner/news/');await expect(page.locator('.briefings-empty')).toBeVisible();
  if(viewer==='admin'){
   await expect(page.getByText('Source collection needs attention',{exact:true})).toBeVisible();
   if(state==='failed')await expect(page.locator('.feed-publication-status')).toContainText('Briefing delayed');
  }else{
   await expect(page.locator('.feed-publication-status')).toHaveCount(0);
   await expect(page.getByText('Source collection needs attention',{exact:true})).toHaveCount(0);
  }
  if(state==='quiet')await expect(page.getByText('No new developments in the latest scheduled briefing.',{exact:true})).toBeVisible();
 });
}
