import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import {afterEach,it,expect,vi} from 'vitest';
import {translateInterface,setWebsiteLanguage,useLanguage} from './LanguageControl';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {ApiError,toUiError,renderApiError,type UiMessage} from './api-errors';
import {getSession} from './api';
afterEach(()=>{localStorage.clear();vi.unstubAllGlobals();});
it('has Arabic and French translations for static product calls, including source examples',()=>{
 const keys=new Set(['Telegram URL','X URL','Search topic']);
 const src=existsSync('src/main.tsx')?resolve('src'):resolve('apps/web/src');
 for(const name of readdirSync(src).filter(x=>/\.(ts|tsx)$/.test(x)&&!x.includes('.test.'))){
  const source=ts.createSourceFile(name,readFileSync(resolve(src,name),'utf8'),ts.ScriptTarget.Latest,true,name.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const collect=(node:ts.Node)=>{if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))keys.add(node.text);else if(ts.isConditionalExpression(node)){collect(node.whenTrue);collect(node.whenFalse);}};
  const visit=(n:ts.Node)=>{if(ts.isVariableDeclaration(n)&&['translations','interfaceTranslations'].includes(n.name.getText(source))&&n.initializer&&ts.isObjectLiteralExpression(n.initializer)){for(const p of n.initializer.properties)if(ts.isPropertyAssignment(p))keys.add(ts.isStringLiteral(p.name)?p.name.text:p.name.getText(source));}if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='t'&&n.arguments[0])collect(n.arguments[0]);ts.forEachChild(n,visit);};visit(source);
 }
 expect(keys.size).toBeGreaterThan(240);
 for(const key of keys){expect(translateInterface(key,'ar'),key).toMatch(/[\u0600-\u06ff]/);expect(translateInterface(key,'ar'),key).not.toMatch(/\?{2}|\uFFFD/);expect(translateInterface(key,'fr'),key).not.toMatch(/\?{2}|\uFFFD/);expect(translateInterface(key,'fr'),key).toBeTruthy();}
});

it('keeps API error state canonical and safe in every locale',async()=>{
 for(const language of ['en','ar','fr'] as const){
  setWebsiteLanguage(language);vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:'Unexpected private upstream detail'},{status:502})));
  try{await getSession();throw Error('Expected failure');}catch(e){
   expect(e).toBeInstanceOf(ApiError);const state=toUiError(e);expect(state).toEqual({id:'REQUEST_FAILED',details:{status:502}});
   expect(JSON.stringify(state)).not.toContain('private');expect((e as Error).message).toBe('REQUEST_FAILED');expect((e as Error).cause).toBeUndefined();
   expect(translateInterface(state,language)).toBe(translateInterface('Could not complete the request. Try again.',language));
  }
 }
});
it('uses a safe canonical fallback for network and non-JSON failures',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('Private connection detail');}));await expect(getSession()).rejects.toMatchObject({id:'REQUEST_FAILED',uiMessage:{details:{}}});
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('private upstream detail',{status:503,headers:{'content-type':'text/plain'}})));
 await expect(getSession()).rejects.toMatchObject({id:'REQUEST_FAILED',uiMessage:{details:{status:503}}});
});
it('updates an already-displayed structured auth error across en/ar/fr immediately without another request',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const fetcher=vi.fn(async()=>Response.json({error:'verify your email before logging in'},{status:403}));vi.stubGlobal('fetch',fetcher);
 const host=document.createElement('div'),root=createRoot(host);let stored:UiMessage='';
 function Form(){const {t}=useLanguage();const [error,setError]=React.useState<UiMessage>('');stored=error;
  return React.createElement(React.Fragment,null,React.createElement('button',{onClick:async()=>{try{await getSession();}catch(cause){setError(toUiError(cause));}}},'Trigger'),error?React.createElement('p',{role:'alert'},t(error)):null);}
 try{
  await act(async()=>{setWebsiteLanguage('en');root.render(React.createElement(Form));});
  await act(async()=>{host.querySelector('button')!.click();});
  expect(stored).toEqual({id:'AUTH_EMAIL_VERIFICATION_REQUIRED',details:{status:403}});
  for(const language of ['ar','fr','en','fr','ar'] as const){
   await act(async()=>setWebsiteLanguage(language));expect(host.querySelector('[role="alert"]')?.textContent).toBe(renderApiError({id:'AUTH_EMAIL_VERIFICATION_REQUIRED',details:{}},language));
   expect(document.documentElement.lang).toBe(language);expect(document.documentElement.dir).toBe(language==='ar'?'rtl':'ltr');
  }
  expect(fetcher).toHaveBeenCalledTimes(1);
 }finally{await act(async()=>root.unmount());}
});
