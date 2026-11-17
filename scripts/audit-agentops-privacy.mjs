import ts from 'typescript';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {join,relative} from 'node:path';
const root='apps/worker/src',sites=[];
function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())walk(path);else if(path.endsWith('.ts')&&!path.endsWith('.test.ts')&&!path.endsWith('.d.ts')){
 const text=readFileSync(path,'utf8'),source=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true);
 function visit(node){if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.expression.getText(source)==='console'){
   const statement=node.getText(source),risks=[];
   if(/error(?:Message)?|String\(error\)|message|stack/.test(statement))risks.push('unrestricted-error-or-message-review');
   if(/accountId|emailDomain|senderDomain/.test(statement))risks.push('account-or-email-metadata');
   if(/visibleEvidence|structuralEvidence|headline|prompt|reason|progress/.test(statement))risks.push('source-or-provider-text-review');
   if(/feedId|bodyId|messageId|windowId|operationId|key/.test(statement))risks.push('private-identity-or-object-key');
   const file=path.replaceAll('\\','/');sites.push({file,line:source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,method:node.expression.name.text,policy:file.endsWith('/agentops.ts')?'fixed-metadata-emitter-tested':'legacy-export-denied',risks});
 }ts.forEachChild(node,visit);}visit(source);
}}}
walk(root);mkdirSync('.local-reports/agentops-collector',{recursive:true});
const report={scope:'static AST inventory; risk indicators require contextual review, not confirmed disclosures',consoleSites:sites.length,legacyLogExport:'disabled',source:relative('.',root).replaceAll('\\','/'),sites};
writeFileSync('.local-reports/agentops-collector/privacy-inventory.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({consoleSites:sites.length,fixedMetadataSites:sites.filter(s=>s.policy==='fixed-metadata-emitter-tested').length,legacySites:sites.filter(s=>s.policy==='legacy-export-denied').length,exportEnabled:false}));
