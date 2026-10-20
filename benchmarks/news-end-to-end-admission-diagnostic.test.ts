import {it} from 'vitest';
import {readFileSync,writeFileSync} from 'node:fs';import {join} from 'node:path';
import {evaluationD1} from '../scripts/validation-evaluation-d1.mjs';
import {modelSpendingStatements} from '../apps/worker/src/v1-intelligence/model-spending';
it.skipIf(process.env.NEWS_CORRECTNESS_READ_ONLY!=='1')('reads the denied exact reservation without executing any write',async()=>{
 const root='.local-reports/news-correctness-openrouter/',intent=JSON.parse(readFileSync(root+'openrouter-8209367908fba303ab7c-never-admitted.json','utf8')),c=readFileSync(join(process.env.APPDATA!,'xdg.config/.wrangler/config/default.toml'),'utf8'),token=c.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
 const db=evaluationD1(token!) as any;
 try {const statements=await modelSpendingStatements(db,intent.reservation);writeFileSync(root+'admission-diagnostic.json',JSON.stringify({statementCount:statements.length,at:new Date().toISOString(),guard:await db.prepare((statements[0] as any).sql.replace(/^INSERT INTO v1_model_spending_guards\(id,valid\) /,'')).bind(...(statements[0] as any).params).all(),table:await db.prepare("SELECT sql FROM sqlite_master WHERE name='v1_model_spending_reservations'").first()},null,2));}
 catch(e){writeFileSync(root+'admission-diagnostic.json',JSON.stringify({error:String(e)},null,2));throw e}
});
