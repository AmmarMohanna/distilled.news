// @vitest-environment node
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {expect,it,vi} from 'vitest';

const script=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
const origin='https://news.example',target=origin+'/admin/science/';
function harness(windows:unknown[],opened:unknown=null){
 const events:Record<string,(event:unknown)=>void>={},openWindow=vi.fn(async()=>opened);
 runInNewContext(script,{self:{location:{origin},addEventListener:(name:string,handler:(event:unknown)=>void)=>{events[name]=handler;},clients:{matchAll:async()=>windows,openWindow}},URL});
 return {openWindow,click:async(url=target)=>{let work:Promise<unknown>|undefined;events.notificationclick({notification:{close:vi.fn(),data:{url}},waitUntil:(promise:Promise<unknown>)=>{work=promise;}});await work;}};
}
it('foregrounds the existing app before navigation, then focuses the replacement client',async()=>{
 const order:string[]=[],replacement={focus:vi.fn(async()=>{order.push('replacement-focus');})};
 const client={url:origin+'/',focus:vi.fn(async()=>{order.push('focus');}),navigate:vi.fn(async()=>{order.push('navigate');return replacement;})};
 const test=harness([client]);await test.click();
 expect(order).toEqual(['focus','navigate','replacement-focus']);expect(client.navigate).toHaveBeenCalledWith(target);expect(test.openWindow).not.toHaveBeenCalled();
});
it('focuses the exact feed without opening or navigating another window',async()=>{
 const other={url:origin+'/',focused:true,focus:vi.fn()},feed={url:target,focus:vi.fn(async()=>{}),navigate:vi.fn()};
 const test=harness([other,feed]);await test.click();expect(feed.focus).toHaveBeenCalledOnce();expect(feed.navigate).not.toHaveBeenCalled();expect(other.focus).not.toHaveBeenCalled();
});
it.each(['closed','navigation-failed','navigation-null'])('opens and foregrounds the feed if the existing client is %s',async mode=>{
 const opened={focus:vi.fn(async()=>{})};
 const client={url:origin+'/',focus:vi.fn(async()=>{if(mode==='closed')throw Error('closed');}),navigate:vi.fn(async()=>{if(mode==='navigation-failed')throw Error('lost client');return null;})};
 const test=harness([client],opened);await test.click();expect(test.openWindow).toHaveBeenCalledWith(target);expect(opened.focus).toHaveBeenCalledOnce();
});
it('opens and explicitly focuses a new app window',async()=>{
 const opened={focus:vi.fn(async()=>{})},test=harness([],opened);await test.click();expect(test.openWindow).toHaveBeenCalledWith(target);expect(opened.focus).toHaveBeenCalledOnce();
});
it('does not open an external notification target',async()=>{
 const test=harness([]);await test.click('https://unrelated.example/');expect(test.openWindow).not.toHaveBeenCalled();
});
