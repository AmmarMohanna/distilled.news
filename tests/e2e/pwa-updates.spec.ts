import {expect,test} from '@playwright/test';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';

for(const editing of [false,true]) test(`an open controlled app adopts a deployment${editing?' after editing finishes':''}`,async({page})=>{
  const directory=resolve('apps/web/dist');
  const html=readFileSync(resolve(directory,'index.html'),'utf8');
  const script=html.match(/src="(\/assets\/[^" ]+\.js)"/)![1];
  let release=1,initialReads=0,navigations=0;
  const server=createServer((request,response)=>{
    const path=new URL(request.url!,'http://localhost').pathname;
    if(path.startsWith('/api/')){
      response.setHeader('Content-Type','application/json');
      response.end(JSON.stringify(path==='/api/auth/session'?{authenticated:true,setupRequired:false,account:{id:'owner',username:'owner',role:'user'}}:{briefings:[],feeds:[],sources:[]}));return;
    }
    if(path==='/'){
      initialReads++;
      if(request.headers['sec-fetch-mode']==='navigate')navigations++;
      response.setHeader('Content-Type','text/html');response.setHeader('Cache-Control','no-store');
      response.end(html.replace('<html',`<html data-test-release="${release}"`).replace(script,`/assets/release-${release}.js`));return;
    }
    const asset=/^\/assets\/release-\d\.js$/.test(path)?script:path;
    if(asset.includes('..')){response.writeHead(400).end();return;}
    try{
      const data=readFileSync(resolve(directory,'.'+asset));
      response.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'} as Record<string,string>)[extname(asset)]??'application/octet-stream');
      response.end(data);
    }catch{response.writeHead(404).end();}
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=(server.address() as {port:number}).port;
  try{
    await page.goto(`http://127.0.0.1:${port}/`);
    await expect(page.locator('.home-view')).toBeVisible();
    await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
    await expect.poll(()=>initialReads).toBeGreaterThanOrEqual(2);
    const worker=await page.evaluate(()=>navigator.serviceWorker.controller!.scriptURL);
    if(editing){
      await page.getByRole('button',{name:'Create feed',exact:true}).click();
      await page.getByRole('textbox',{name:'Feed name',exact:true}).fill('Keep my draft');
    }
    release=2;
    await page.clock.install();
    await page.clock.fastForward(61_000);
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    if(editing){
      await expect.poll(()=>initialReads).toBeGreaterThanOrEqual(3);
      await expect(page.locator('html')).toHaveAttribute('data-test-release','1');
      await expect(page.getByRole('textbox',{name:'Feed name',exact:true})).toHaveValue('Keep my draft');
      await page.keyboard.press('Escape');
    }
    await expect(page.locator('html')).toHaveAttribute('data-test-release','2');
    expect(navigations).toBe(2);
    await expect(page.locator('.home-view')).toBeVisible();
    expect(await page.evaluate(()=>navigator.serviceWorker.controller!.scriptURL)).toBe(worker);
    await page.clock.fastForward(61_000);
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await expect(page.locator('html')).toHaveAttribute('data-test-release','2');
    expect(navigations).toBe(2);
  }finally{
    server.closeAllConnections();
    await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});
