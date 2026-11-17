import type {ConstructionIssue} from './v1-intelligence/construction-diagnostics';
export class DuplicateModelKeyError extends Error {
 constructor(readonly rawResponse:string,readonly mechanicalIssues:ConstructionIssue[]){super('MODEL_DUPLICATE_JSON_KEY')}
}
/** Inspect original JSON tokens before exposing a parsed object. Escaped-equivalent
 * property names compare after JSON string decoding, within each object scope. */
export function parseUniqueModelJson(raw:string):Record<string,unknown>{
 let at=0;const issues:ConstructionIssue[]=[];
 const ws=()=>{while(/\s/.test(raw[at]??'')&&at<raw.length)at++};
 const fail=():never=>{throw new SyntaxError('Invalid model JSON')};
 const string=():string=>{const start=at;if(raw[at++]!=='"')return fail();while(at<raw.length){const c=raw[at++];if(c==='\\'){at++;continue}if(c==='"')return JSON.parse(raw.slice(start,at))}return fail()};
 const value=(path:string,depth:number):void=>{
  if(depth>128)return fail();ws();const c=raw[at];
  if(c==='{'){
   at++;ws();const seen=new Set<string>();if(raw[at]==='}'){at++;return}
   while(at<raw.length){ws();const key=string(),pointer=path+'/'+key.replace(/~/g,'~0').replace(/\//g,'~1');
    if(seen.has(key))issues.push({code:'DUPLICATE_JSON_KEY',pointer,observed:key,invariant:'JSON object keys must be unique before parsing.'});seen.add(key);ws();if(raw[at++]!==':')return fail();value(pointer,depth+1);ws();if(raw[at]==='}'){at++;return}if(raw[at++]!==',')return fail();
   }return fail();
  }
  if(c==='['){at++;ws();if(raw[at]===']'){at++;return}let i=0;while(at<raw.length){value(path+'/'+i++,depth+1);ws();if(raw[at]===']'){at++;return}if(raw[at++]!==',')return fail()}return fail()}
  if(c==='"'){string();return}
  const token=raw.slice(at).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/)?.[0];if(!token)return fail();at+=token.length;
 };
 value('',0);ws();if(at!==raw.length)fail();if(issues.length)throw new DuplicateModelKeyError(raw,issues);
 return JSON.parse(raw);
}
