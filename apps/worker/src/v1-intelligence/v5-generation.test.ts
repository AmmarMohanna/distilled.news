import { describe, expect, it } from 'vitest';
import { modelStage, type ModelRequest, type BriefingRoute } from '@distilled/briefing';
import { productV3Models } from './v3-window';
import { flashPairModels, frozenRouteError, v5StageRouting } from './v5-generation';
import type { Env } from '../types';

describe('V5 stage routing', () => {
  it('applies the V5 writer and stage routes only to feeds created at or after the rollout cutoff', () => {
    const cutoff = '2026-12-01T00:00:00.000Z';
    const env = {
      BRIEFING_V5_FEEDS_CREATED_FROM: cutoff,
      BRIEFING_V5_GENERATION_PROFILE: 'deepseek-flash-wafer',
      BRIEFING_V5_STAGE_ROUTES_JSON: '{"default":{"novelty":"deepseek-flash-wafer"}}',
      BRIEFING_SOURCE_BINDINGS_ENABLED: 'true',
      BRIEFING_SOURCE_BINDINGS_MODEL: 'fixture-verifier',
    } as Env;
    const v3 = { editor: 'openai/gpt-4.1', verifier: 'fixture-verifier' };
    expect(productV3Models(env, '2026-11-30T23:59:59.999Z')).toEqual(v3);
    expect(productV3Models(env)).toEqual(v3);
    expect(productV3Models(env, 'invalid')).toEqual(v3);
    expect(productV3Models(env, cutoff)).toMatchObject({
      ...v3,
      generation: { provider: 'wafer/us' },
      stageRoutes: { novelty: { provider: 'wafer/us' } },
    });
    expect(productV3Models({ ...env, BRIEFING_V5_FEEDS_CREATED_FROM: undefined }).generation)
      .toMatchObject({ provider: 'wafer/us' });
    expect(() => productV3Models({ ...env, BRIEFING_V5_FEEDS_CREATED_FROM: '2026-02-30T00:00:00.000Z' }, cutoff))
      .toThrow('INVALID_BRIEFING_V5_FEEDS_CREATED_FROM');
  });

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

it('pins every Flash-only stage and its recovery to frozen routes', () => {
  const models = flashPairModels();
  expect(models.editorialPolicy).toBe('interest-and-evidence-v1');
  const [deepseek, gemini] = models.recoveryRoutes!;
  expect(models.developmentSelection).toBe('individual-developments-v1');
  expect(models.generation).toMatchObject({model:gemini.model, provider:gemini.provider});
  const writer = {model:gemini.model, generation:models.generation, system:'', user:'', maxTokens:4000};
  expect(frozenRouteError(models, 'en', writer)).toBeUndefined();
  expect(frozenRouteError(models, 'en', {...writer, model:deepseek.model,
    generation:{...deepseek, prompt:models.generation!.prompt}})).toBeUndefined();
  const cutoff = '2026-11-26T19:54:12.096Z';
  const env = {BRIEFING_V5_GENERATION_PROFILE:'flash-pair', BRIEFING_SOURCE_BINDINGS_ENABLED:'true',
    BRIEFING_V5_FEEDS_CREATED_FROM:cutoff} as Env;
  expect(productV3Models(env, cutoff)).toEqual(models);
  expect(productV3Models(env, '2026-11-26T19:54:12.095Z').generation).toBeUndefined();
  expect(models.stageRoutes?.factualReview).toEqual(gemini);
  expect(models.stageRoutes?.readerInventory).toEqual(deepseek);
  expect(models.languageStageRoutes?.ar?.correction).toEqual(gemini);
  for (const language of ['en','ar','fr'] as const) {
    for (const [stage, route] of Object.entries({...models.stageRoutes,...models.languageStageRoutes?.[language]})) {
      expect([deepseek,gemini]).toContainEqual(route);
      const request: ModelRequest = {model:'openai/gpt-4.1', system:'', user:'', maxTokens:1,
        stageRoute:{stage:stage as NonNullable<ModelRequest['stageRoute']>['stage'],route:{...route,model:'openai/gpt-4.1'}}};
      expect(frozenRouteError(models,language,request)).toBe('V5_STAGE_SCOPE_MISMATCH');
    }
  }
  for (const route of [gemini, deepseek]) {
    const request: ModelRequest = {model:route.model, system:'', user:'', maxTokens:2000, stageRoute:{stage:'factualReview',route}};
    expect(frozenRouteError(models, 'en', request)).toBeUndefined();
    expect(frozenRouteError(models, 'en', {...request, model:'openai/gpt-4.1'})).toBeTruthy();
    expect(frozenRouteError(models, 'en', {...request, maxTokens:route.maxOutputTokens+1})).toBeTruthy();
  }
  expect(frozenRouteError(models,'en',{model:'openai/gpt-4.1',system:'',user:'',maxTokens:1})).toBeTruthy();
});
