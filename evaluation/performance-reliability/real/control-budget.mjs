import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {writePrivate,journal} from './client.mjs';
export function reserveControlPlane(m,dir,kind){
 const path=resolve(dir,'control-plane-budget.private.json');const count=(existsSync(path)?JSON.parse(readFileSync(path,'utf8')).requests:0)+1;
 if(count>m.controlPlaneRequestBudget)throw Error('CONTROL_PLANE_REQUEST_BUDGET');
 writePrivate(dir,'control-plane-budget.private.json',{requests:count});journal(dir,{category:'control-plane-request',kind,requestNumber:count});
}
