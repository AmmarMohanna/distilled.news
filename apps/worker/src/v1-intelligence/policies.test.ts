import {expect,it} from 'vitest';
import {classifyRole,duplicateSimilarity,eventSimilarity,features} from './policies';
it('distinguishes role judgments and preserves copy detection separately from event matching',()=>{
 expect(classifyRole('Opinion: why the banking reform matters').role).toBe('OPINION');
 expect(classifyRole('Sponsored: subscribe now for a special offer').role).toBe('PROMOTION');
 const a='Lebanon Parliament approved the banking reform legislation after a debate on Tuesday.';
 const b='Lebanon legislature passed banking reform law following negotiations.';
 expect(duplicateSimilarity(a,b)).toBeLessThan(.9);
 expect(eventSimilarity(features(a),features(b))).toBeGreaterThanOrEqual(.4);
 expect(eventSimilarity(features(a),features('Lebanon earthquake destroyed homes in Beirut.'))).toBeLessThan(.4);
});
it('same entity with a different development phase is a new event, while copied text is a duplicate',()=>{
 const a='Lebanon Parliament proposed banking reform legislation.';
 const b='Lebanon Parliament approved banking reform legislation.';
 expect(eventSimilarity(features(a),features(b))).toBe(0);
 expect(duplicateSimilarity(a,a)).toBe(1);
});
