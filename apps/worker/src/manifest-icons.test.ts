import {expect,it} from 'vitest';
import {createApp} from './app';
import {InMemoryRepository} from './repository';
type Manifest={name:string;id:string;icons:{src:string}[]};
it('keeps installed mobile icons white-backed and desktop icons transparent with the same app identity',async()=>{
 const app=createApp({repository:new InMemoryRepository()});
 const desktop=await (await app.request('/manifest.webmanifest',{headers:{'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}})).json() as Manifest;
 const mobile=await (await app.request('/manifest.webmanifest',{headers:{'user-agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'}})).json() as Manifest;
 const hinted=await (await app.request('/manifest.webmanifest',{headers:{'sec-ch-ua-mobile':'?1'}})).json() as Manifest;
 expect(desktop.name).toBe('Distilled.News');expect(desktop.id).toBe(mobile.id);
 expect(desktop.icons[0].src).toContain('/desktop-icon-192.png');
 expect(mobile.icons[0].src).toBe('/icon-192.png?v=light-5');
 expect(hinted.icons).toEqual(mobile.icons);
});
