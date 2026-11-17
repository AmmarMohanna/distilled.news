import {readFileSync} from 'node:fs';
import {prepareArticles,selectPrior} from '../packages/briefing/src/prepare';
const s=JSON.parse(readFileSync('.local-reports/novelty-repair/input.private.json','utf8'));
const articles=prepareArticles(s.input.articles,{minChars:1,maxArticleChars:Number.MAX_SAFE_INTEGER,nearDuplicate:1.01}).prepared;
const chosen=selectPrior(s.input.prior,articles,new Date(s.input.windowEnd));
console.log(JSON.stringify({promptVersion:s.promptVersion,selected:chosen.map(p=>p.headline.split('\n')[0]),targets:s.input.prior.filter((p:any)=>/G7 foreign ministers|illegal internet/.test(p.headline)).map((p:any)=>({id:p.id,headline:p.headline,selected:chosen.some(c=>c.id===p.id)}))},null,2));
