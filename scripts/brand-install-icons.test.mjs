import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
test('install icons keep opaque light backgrounds in either appearance',async()=>{
 const browser=await chromium.launch();try{
 for(const mode of ['light','dark']){const page=await browser.newPage({colorScheme:mode});
 for(const name of ['icon-192.png','icon-512.png','apple-touch-icon.png']){
 const data='data:image/png;base64,'+(await readFile(new URL('../apps/web/public/'+name,import.meta.url))).toString('base64');
 const corners=await page.evaluate(async data=>{const img=new Image();img.src=data;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);return [[0,0],[img.width-1,0],[0,img.height-1],[img.width-1,img.height-1]].map(([x,y])=>Array.from(ctx.getImageData(x,y,1,1).data));},data);
 for(const pixel of corners)assert.deepEqual(pixel,[255,255,255,255],name+' '+mode);
 }await page.close();}
 }finally{await browser.close();}
});
