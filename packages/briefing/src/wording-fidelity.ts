import type {FeedSpec} from './types';

/** Frozen wording for faithful-compression-v1. New rules need a new policy ID:
 * old model requests and their paid identities must remain replayable. */
export const WORDING_FIDELITY_V1 = `MEANING-PRESERVING COMPRESSION
Apply these rules to the headline independently as well as the body, in every output language, including translation from a different source language.
- Preserve the strength and scope of comparisons and quantifiers. "One of the most", "among", "could", "some" and "nearly" must not become an absolute record, "unprecedented", "the most", "all" or a certainty. A projected ranking is not an official result. Omit an optional comparison if its qualification cannot fit.
- Preserve the exact action and what it applies to. Criticising a proposal, calling an appeal a bluff, declining one condition, rejecting a coalition arrangement and ending negotiations are different developments. Report the evidenced response without inferring a refusal, agreement or end to talks. Preserve separately reported continuing discussions, even when public criticism is sharp.
- Natural paraphrase is welcome; stronger factual meaning is not. Do not infer intent, finality, exclusivity, causation or historical uniqueness from rhetoric or compression. When the evidence is nuanced, use a short neutral description of the supported action rather than a stronger conclusion. Do not add routine caveats or background to otherwise accurate news.`;

export const VERIFY_WORDING_FIDELITY_V1 = WORDING_FIDELITY_V1 + `
For each item compare the headline and body separately with the cited source's actual meaning. Check translated qualifiers, degree, scope, action and object, not just matching names and numbers. Return fix for a stronger or different claim even if a weaker claim appears elsewhere in the item. Quote the problematic wording and identify the supported alternative. Do not flag harmless idiomatic paraphrases or demand qualifications the evidence does not require.`;

export function wordingFidelity(feed:FeedSpec,verify=false):string{
 return feed.wordingFidelityPolicy==='faithful-compression-v1'?'\n\n'+(verify?VERIFY_WORDING_FIDELITY_V1:WORDING_FIDELITY_V1):'';
}
