// @vitest-environment node
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {expect,it,vi} from 'vitest';
const source=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
function worker(){
 const events:Record<string,(event:any)=>void>={},showNotification=vi.fn(async()=>{});
 runInNewContext(source,{self:{addEventListener:(name:string,fn:any)=>{events[name]=fn;},registration:{showNotification}},fetch:async()=>{throw Error('offline');},Response});
 return {events,showNotification};
}
it('renders the offline Wi-Fi illustration without requesting any external logo',async()=>{
 const {events}=worker();let response:Promise<Response>|undefined;
 events.fetch({request:{mode:'navigate',headers:new Headers({'Accept-Language':'fr'})},respondWith:(value:Promise<Response>)=>{response=value;}});
 const html=await (await response!).text();
 expect(html).toContain('offline-wifi');expect(html).toContain('Distilled.News');expect(html).toContain('Vous êtes hors ligne');
 expect(html).not.toContain('<img');
});
it('uses transparent notification art and a monochrome transparent badge independently of installation icons',async()=>{
 const {events,showNotification}=worker();let completion:Promise<unknown>|undefined;
 events.push({data:{json:()=>({title:'A briefing'})},waitUntil:(value:Promise<unknown>)=>{completion=value;}});await completion;
 expect(showNotification).toHaveBeenCalledWith('A briefing',expect.objectContaining({icon:'/notification-icon.png?v=transparent-1',badge:'/notification-badge.png?v=transparent-1'}));
});
