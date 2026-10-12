/** Historical accounting summary only. Admission belongs to the account ledger. */
export type SemanticWorkClass='PRIMARY'|'RETRY'|'PROTECTED';
export const isSemanticProcessing=(input:{kind:string;budgetKey:string})=>/^semantic:\d{4}-\d{2}-\d{2}$/.test(input.budgetKey)&&['RELATION','RELATION_EFFECT','SEMANTIC_CONSTRUCTION'].includes(input.kind);
export interface SemanticWallet {reportedCostUsd:number;heldCostUsd:number;calls:number;unknown:number;inFlight:number}
export function summarizeSemanticWallet(intents:{id:string;reservedCostUsd:number;leaseUntil:number}[],results:Map<string,{usage:{reported:boolean;costUsd:number}}>,now=Date.now()):SemanticWallet{
 const wallet:SemanticWallet={reportedCostUsd:0,heldCostUsd:0,calls:intents.length,unknown:0,inFlight:0};
 for(const intent of intents){const result=results.get(intent.id);
  if(result?.usage.reported&&Number.isFinite(result.usage.costUsd)&&result.usage.costUsd>=0)wallet.reportedCostUsd+=result.usage.costUsd;
  else{wallet.heldCostUsd+=Math.max(intent.reservedCostUsd,result?.usage.costUsd??0);if(result||intent.leaseUntil<=now)wallet.unknown++;else wallet.inFlight++}
 }
 return wallet;
}
