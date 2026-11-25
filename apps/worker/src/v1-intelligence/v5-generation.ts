import type { BriefingGeneration } from '@distilled/briefing';

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

export function v5Generation(profile: string | undefined): BriefingGeneration | undefined {
  if (profile === undefined) return undefined;
  if (!Object.hasOwn(sources, profile)) throw Error('INVALID_BRIEFING_V5_GENERATION_PROFILE');
  return {
    ...sources[profile as keyof typeof sources],
    maxOutputTokens: 6_500,
    prompt: 'v5-source-first-v4',
  };
}
