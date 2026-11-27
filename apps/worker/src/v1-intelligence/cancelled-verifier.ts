/** The shared V3 operation kind also covers writers and inventories. Match the
 * explicit route or the fixed verifier system prefix in older frozen requests. */
export async function confirmedVerifierCancellation(db:D1Database,feedId:string,operationId:string):Promise<{costUsd:number}|null>{
 const reservationId='semantic_intents:'+operationId;
 return db.prepare(`SELECT s.cost_usd AS costUsd FROM v1_feed_documents i
  JOIN v1_model_spending_reservations r ON r.id=? AND r.feed_id=i.feed_id AND r.token=json_extract(i.json,'$.token')
  JOIN v1_model_spending_settlements s ON s.id=r.id AND s.token=r.token AND s.reported=1
  JOIN v1_feed_documents h ON h.kind='model_provider_receipts' AND h.id IN (json_array(r.id,'HEADERS'),json_array(r.id,'GENERATION')) AND h.feed_id=i.feed_id
  JOIN v1_feed_documents p ON p.kind='model_provider_recoveries' AND p.feed_id=i.feed_id
   AND p.id=json_array(r.id,json_extract(h.json,'$.generationId'),'provider-metadata-v1')
  WHERE i.kind='semantic_intents' AND i.id=? AND i.feed_id=? AND json_extract(i.json,'$.input.kind')='V3_EDITOR_VERIFIER'
   AND json_extract(i.json,'$.input.state.cancelledVerifierId') IS NULL
   AND (json_extract(i.json,'$.input.state.request.stageRoute.stage')='factualReview'
    OR instr(json_extract(i.json,'$.input.state.request.system'),'You are a meticulous source-grounded verifier.')=1
    OR instr(json_extract(i.json,'$.input.state.request.system'),'You are an independent factual verifier.')=1
    OR instr(json_extract(i.json,'$.input.state.request.system'),'You are a meticulous fact-checker for a news briefing.')=1)
   AND json_extract(p.json,'$.source')='OPENROUTER_GENERATION_METADATA'
   AND json_extract(p.json,'$.finishReason')='cancelled' AND json_extract(p.json,'$.model')=r.model
   AND json_extract(p.json,'$.costUsd')=s.cost_usd
   AND NOT EXISTS (SELECT 1 FROM v1_feed_documents d WHERE d.feed_id=i.feed_id AND d.id=i.id
    AND d.kind IN ('semantic_results','semantic_settlements') AND (json_extract(d.json,'$.status')='SUCCEEDED'
     OR json_extract(d.json,'$.responseCheckpoint') IS NOT NULL))`).bind(reservationId,operationId,feedId).first<{costUsd:number}>();
}
