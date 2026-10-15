import { it, expect } from 'vitest';
// @ts-expect-error The dependency-free operator CLI is JavaScript.
import { formatPipelineTrace } from '../../../../scripts/pipeline-trace.mjs';
it('readable report never displays unavailable counts or unknown costs as zero', () => {
    const report = formatPipelineTrace({ feed: { id: 'f' }, view: 'overview', page: { total: 0 }, items: [], summary: { collection: {}, editorial: {}, publication: {}, spending: { reportedCostUsd: null, heldExposureUsd: .02 } } });
    expect(report).toContain('NOT_OBSERVABLE');
    expect(report).toContain('reported $NOT_OBSERVABLE; held $0.02');
    expect(report).not.toContain('0 selected');
});
it('reports the whitelisted briefingRequest while preserving legacy report compatibility',()=>{
 for(const key of ['briefingRequest','request']){
  const report=formatPipelineTrace({feed:{id:'f'},view:'overview',page:{total:0},items:[],summary:{publication:{[key]:{diagnosticState:'BLOCKED',reason:'INCOMPLETE_INTAKE_COVERAGE'}}}});
  expect(report).toContain('Request: BLOCKED INCOMPLETE_INTAKE_COVERAGE');
 }
});
