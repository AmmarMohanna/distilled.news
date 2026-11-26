import { BRIEFING_MODEL_STAGES, type BriefingGeneration, type BriefingModelStage, type BriefingRoute, type BriefingStageRoutes, type FeedSpec } from '@distilled/briefing';

// OpenRouter endpoint metadata checked 2026-11-25. Cap reservations at the
// maximum tier, including completion-priced reasoning. Only one endpoint is
// eligible per profile, including retries of received, invalid model output.
const sources = {
  'gemini-ai-studio-flex': {
    model: 'google/gemini-3.8-flash',
    provider: 'google-ai-studio/flex',
    contextTokens: 1_048_576,
    price: { prompt: 0.375, completion: 1.875 },
    reasoning: { effort: 'low', exclude: true },
    serviceTier: 'flex',
    temperature: 0.1,
  },
  'deepseek-flash-wafer': {
    model: 'deepseek/deepseek-v4.1-flash-1017',
    provider: 'wafer/us',
    contextTokens: 1_048_576,
    price: { prompt: 0.036, completion: 0.5 },
    reasoning: { enabled: false },
    temperature: 0.1,
  },
} as const satisfies Record<string, Omit<BriefingGeneration,'prompt'|'maxOutputTokens'>>;

const profiles: Record<string, BriefingRoute> = {
  ...Object.fromEntries(Object.entries(sources).map(([key, route]) => [key, { ...route, maxOutputTokens: 8_000 }])),
  'gpt-41-openai': {
    model: 'openai/gpt-4.1', provider: 'openai', contextTokens: 1_047_576,
    price: { prompt: 2, completion: 8 }, maxOutputTokens: 8_000, temperature: 0.1,
  },
};

export function v5StageRouting(json: string | undefined): {
  stageRoutes?: BriefingStageRoutes;
  languageStageRoutes?: Partial<Record<FeedSpec['language'], BriefingStageRoutes>>;
} {
  if (json === undefined) return {};
  const object = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('INVALID_V5_STAGE_ROUTING');
    return value as Record<string, unknown>;
  };
  const routes = (value: unknown): BriefingStageRoutes => Object.fromEntries(Object.entries(object(value)).map(([stage, profile]) => {
    if (!BRIEFING_MODEL_STAGES.includes(stage as BriefingModelStage) ||
        typeof profile !== 'string' || !Object.hasOwn(profiles, profile)) throw Error('INVALID_V5_STAGE_ROUTE');
    return [stage, profiles[profile]];
  }));
  const settings = object(JSON.parse(json));
  if (Object.keys(settings).some(key => !['default', 'en', 'ar', 'fr'].includes(key))) throw Error('INVALID_V5_STAGE_LANGUAGE');
  return {
    ...(Object.hasOwn(settings, 'default') ? { stageRoutes: routes(settings.default) } : {}),
    languageStageRoutes: Object.fromEntries(['en', 'ar', 'fr'].filter(lang => Object.hasOwn(settings,lang)).map(lang => [lang, routes(settings[lang])])),
  };
}

export function v5Generation(profile: string | undefined): BriefingGeneration | undefined {
  if (profile === undefined) return undefined;
  if (!Object.hasOwn(sources, profile)) throw Error('INVALID_BRIEFING_V5_GENERATION_PROFILE');
  return {
    ...sources[profile as keyof typeof sources],
    maxOutputTokens: 6_500,
    prompt: 'v5-source-first-v5',
  };
}
