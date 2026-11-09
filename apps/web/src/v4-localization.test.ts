import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import {afterEach,it,expect,vi} from 'vitest';
import {translateInterface,setWebsiteLanguage} from './LanguageControl';
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
it.each(['ar','fr'] as const)('localizes unknown API failures in %s and retains the technical cause',async language=>{
 setWebsiteLanguage(language);vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:'Unexpected upstream code 531'},{status:502})));
 try{await getSession();throw Error('Expected failure');}catch(e){expect((e as Error).message).toBe(translateInterface('Could not complete the request. Try again.',language));expect(((e as Error).cause as Error).message).toBe('Unexpected upstream code 531');}
});
it('preserves English error details and localizes network failures without changing user data',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('Failed to fetch');}));await expect(getSession()).rejects.toThrow('Failed to fetch');
 setWebsiteLanguage('ar');await expect(getSession()).rejects.toThrow(translateInterface('Could not complete the request. Try again.','ar'));
 expect(translateInterface('Error: '+translateInterface('Search topic','ar'),'ar')).toBe('البحث عن موضوع');
});

it('keeps a known actionable authentication error localized rather than replacing it with a generic failure',async()=>{
 setWebsiteLanguage('ar');vi.stubGlobal('fetch',vi.fn(async()=>Response.json({error:'Invalid or expired token'},{status:400})));
 await expect(getSession()).rejects.toThrow(translateInterface('Invalid or expired token','ar'));
});
it('localizes unexpected non-JSON failures and keeps the response detail available',async()=>{
 setWebsiteLanguage('ar');vi.stubGlobal('fetch',vi.fn(async()=>new Response('upstream unavailable',{status:503,headers:{'content-type':'text/plain'}})));
 try{await getSession();throw Error('Expected failure');}catch(e){expect((e as Error).message).toBe(translateInterface('Could not complete the request. Try again.','ar'));expect(((e as Error).cause as Error).message).toContain('text/plain');}
});
