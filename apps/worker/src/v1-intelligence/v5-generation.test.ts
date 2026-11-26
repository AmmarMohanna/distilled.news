import { describe, expect, it } from 'vitest';
import { modelStage, type ModelRequest, type BriefingRoute } from '@distilled/briefing';
import { productV3Models } from './v3-window';
import { v5StageRouting } from './v5-generation';
import type { Env } from '../types';

describe('V5 stage routing', () => {
  it('accepts only explicit supported stages, languages and pinned profiles', () => {
    expect(v5StageRouting(undefined)).toEqual({});
    expect(v5StageRouting('{"default":{"novelty":"deepseek-flash-wafer"}}').stageRoutes?.novelty)
      .toMatchObject({ model: 'deepseek/deepseek-v4.1-flash-1017', provider: 'wafer/us' });
    expect(() => v5StageRouting('{"fr":{"factualReview":"anything/free"}}')).toThrow('INVALID_V5_STAGE_ROUTE');
    expect(() => v5StageRouting('{"de":{"novelty":"deepseek-flash-wafer"}}')).toThrow('INVALID_V5_STAGE_LANGUAGE');
    expect(() => productV3Models({ BRIEFING_V5_STAGE_ROUTES_JSON: '{}' } as Env))
      .toThrow('V5_STAGE_ROUTING_REQUIRES_V5');
  });

  it('keeps the original request untouched and refuses a route too small for its proof', async () => {
    const calls: ModelRequest[] = [];
    const port = {
      complete: async (request: ModelRequest) => {
        calls.push(request);
        return { text: '{}', inputTokens: 1, outputTokens: 1 };
      },
    };
    const route: BriefingRoute = {
      model: 'pinned', provider: 'test', contextTokens: 8192,
      maxOutputTokens: 100, price: { prompt: 1, completion: 1 },
    };
    const request = { model: 'legacy', system: 'System', user: 'User', maxTokens: 100 };
    expect(modelStage(port, undefined, 'correction')).toBe(port);
    const stage = modelStage(port, { correction: route }, 'correction');
    await stage.complete(request);
    expect(calls).toEqual([{ ...request, model: 'pinned', stageRoute: { stage: 'correction', route } }]);
    expect(() => stage.complete({ ...request, maxTokens: 101 })).toThrow('BRIEFING_STAGE_OUTPUT_CAPACITY');
    expect(calls).toHaveLength(1);
  });
});
