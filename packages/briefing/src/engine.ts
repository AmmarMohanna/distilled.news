import {withSharedSchemas} from './schema-sharing';
import {editorAccountingSchema,normalizeEditorAccounting,STRUCTURED_ACCOUNTING_CONTRACT} from './structured-accounting';
import {BriefingOutputError} from './types';
import {arabicIdentityIssues} from './identity-fidelity';
import {verifySourceBoundClaims,independentBindingPolicy} from './source-bound-claims';
import {generateEvidenceBriefing} from './evidence-agent';
import {verificationMemory,exactPriorRepeat,redundantDrafts,occurrenceNovelty,OCCURRENCE_RULE} from './novelty';
import {completeStorySources} from './citation-coverage';
import { EDITOR_SYSTEM_V7, CONSOLIDATE_SYSTEM_V7, VERIFY_SYSTEM_V7, REPAIR_SYSTEM_V7 } from './prompts-v7';
import { auditEditorSourceAccounting,assertCompleteEditorAccounting,buildSourceDecisions } from './source-accounting';
import { callJson, UsageMeter, type ModelPort } from "./model";
import { chunkArticles, prepareArticles, selectPrior, type PrepareOptions, type PreparedArticle } from "./prepare";
import {
  CONSOLIDATE_SYSTEM,
  EDITOR_SYSTEM_V6,
  CONSOLIDATE_SYSTEM_V6,
  VERIFY_SYSTEM_V6,
  REPAIR_SYSTEM_V6,
  CONSOLIDATE_SYSTEM_V5,
  EDITOR_SYSTEM_V5,
  VERIFY_SYSTEM_V5,
  EDITOR_SYSTEM,
  EDITOR_SYSTEM_V4,
  REPAIR_SYSTEM,
  VERIFY_SYSTEM,
  LEGACY_VERIFY_SYSTEM,
  NOVELTY_RULE,
  consolidateUser,
  editorUser,
  repairUser,
  verifyUser,
  type PreviousReview
} from "./prompts";
import { significantNumbers } from "./text";
import {selectTopicSources} from './topic-selection';
import {wordingFidelity,wordingBase} from './wording-fidelity';
import {SUPPORTED_CORE_VERIFY,SUPPORTED_CORE_REPAIR,SUPPORTED_CORE_VERIFY_V2,SUPPORTED_CORE_REPAIR_V2,MATERIAL_RECOVERY,auditRepairCoverage,recoveryHistory,sourceBoundIdentityRepair} from './verification-recovery';
import type { BriefingInput, BriefingItem, BriefingModels, BriefingResult, DroppedItem, FeedSpec, ItemRelation, OmittedStory, PriorItem, UnaccountedSource } from "./types";

const READER_PRIORITIES='\n\nREADER PRIORITIES: The supplied feed interests are the selection authority. Do not silently narrow them to technical breakthroughs, benchmark records, enacted laws, or independently benchmarked products only. A relevant product release, coding tool, infrastructure finding or concrete policy proposal can be news without meeting those narrower gates; describe its actual significance and limitations. Prefer independent evidence where available without inventing a requirement for it. Exclude genuinely marginal items with an evidence-specific reason. For an already communicated occurrence, retain only material new facts, use update/correction with the exact prior ID, and lead the headline with what changed instead of announcing the original launch again.';
export interface EngineOptions {
  noveltyWirePolicy?:'consistent-links-v2';
  /** Consolidation combines editor-selected developments; it does not silently reselect. */
  editorSelectionPolicy?:'preserve-selected-developments-v1';
  /** Frozen only in new product snapshots; legacy paid requests retain their bytes. */
  editorAccountingPolicy?:'complete-source-decisions-v1'|'complete-source-decisions-v2'|'complete-source-decisions-v3';
  /** Select complete citations while editing; no separate full-input coverage call. */
  editorSourcePolicy?:'all-supporting-sources-v1';
  /** Frozen in new product inputs; unusable chunks carry forward while verified siblings publish. */
  editorFailurePolicy?: 'isolate-unusable-chunks-v1' | 'isolate-unaccounted-sources-v2';
  /** Versioned source association audit for all articles in a new snapshot. */
  citationCoverage?: boolean;
  /** Versioned by the product snapshot so retained paid requests remain unchanged. */
  noveltyGuard?: boolean;
  /** New snapshots compare cited occurrence evidence and timestamped reader memory. */
  noveltyPolicy?:'occurrence-aware-v1';
  /** Programmatic opt-in only; existing prompt versions and defaults remain unchanged. */
  architecture?: 'evidence-first-v1' | 'evidence-first-v2';
  /**
   * Deterministic publication guard candidates. They are deliberately opt-in:
   * old request bytes and the selected V4 path must remain replayable.
   */
  safetyGuard?: 'none' | 'relative-date-v1';
  /** Legacy frozen windows retain their original paid-request bytes. */
  promptVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /** Input size above which articles are edited in parallel chunks and then consolidated. */
  maxEditorChars: number;
  /** Source text budget for one verification call; larger briefings verify in parallel batches. */
  maxVerifyChars: number;
  /** Safety valve, not an editorial quota. */
  maxItems: number;
  /** Repair attempts per item before it is dropped; each costs one repair and one re-check call, only when needed. */
  maxRepairs: number;
  prepare: Partial<PrepareOptions>;
  now: () => Date;
}

export const DEFAULT_ENGINE: EngineOptions = {
  safetyGuard: 'none',
  promptVersion: 4,
  maxEditorChars: 90_000,
  maxVerifyChars: 80_000,
  maxItems: 30,
  maxRepairs: 2,
  prepare: {},
  now: () => new Date()
};

interface Draft {
  headline: string;
  body: string;
  relation: ItemRelation;
  importance: 1 | 2 | 3;
  /** Refs of prepared articles. */
  refs: string[];
  updatesId?: string;
}

const RELATIONS = new Set(["new", "update", "correction"]);

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function importanceOf(value: unknown): 1 | 2 | 3 {
  const n = Math.round(Number(value));
  return n <= 1 ? 1 : n >= 3 ? 3 : 2;
}

const OCCURRENCE_PROSE = '\n\nFor these occurrence-aware editions, return body:"" when the headline communicates the supported development. Do not add a sentence repeating that headline, counting sources, or saying that casualty figures, dates, causes or further details were not supplied. Preserve necessary attribution and uncertainty in the headline or essential body. Source publication metadata alone never establishes event date. This is a prose instruction, not permission to remove an essential qualification or relax factual verification.';

function validateRelation(item: Record<string, unknown>, priorIds: Set<string>): void {
  if (!RELATIONS.has(item.relation as string) ||
    (item.relation === "new" ? item.updates !== null && item.updates !== undefined :
      typeof item.updates !== "string" || !priorIds.has(item.updates))) {
    throw new Error('INVALID_ARTICLE_RELATION: use new with updates:null, or update/correction with an exact supplied prior ID');
  }
}

function parseDrafts(raw: unknown, known: Set<string>, priorIds: Set<string>, headlineOnly = false): Draft[] {
  const list = (raw as { items?: unknown })?.items;
  if (!Array.isArray(list)) throw new Error('missing "items" array');
  const drafts: Draft[] = [];
  for (const entry of list) {
    const item = entry as Record<string, unknown>;
    const headline = text(item?.headline);
    const body = text(item?.body);
    if (headlineOnly && !headline) {
      throw new Error('INVALID_ARTICLE_HEADLINE: every selected item requires a nonempty string headline; return the complete corrected items array');
    }
    const sources = Array.isArray(item?.sources) ? item.sources : [];
    // A selected current-format draft with unusable citations is malformed, not
    // an editorial omission. callJson already permits one accounted correction.
    if (headlineOnly && headline && (!sources.length || sources.some((s) => !known.has(text(s).toUpperCase())))) {
      throw new Error('INVALID_ARTICLE_CITATIONS: cite only the supplied article labels (S1, S2, etc.), never publisher IDs; return the complete corrected items array');
    }
    const refs = [...new Set(sources.map((s) => text(s).toUpperCase()).filter((ref) => known.has(ref)))];
    if (headlineOnly && headline && typeof item?.body !== "string") {
      throw new Error('INVALID_ARTICLE_BODY: return a string body for every selected item; use body:"" for a complete headline-only item');
    }
    if (!headline || (!body && !headlineOnly) || (headlineOnly && typeof item?.body !== "string") || !refs.length) continue; // uncited or empty drafts cannot be published
    if (headlineOnly) validateRelation(item, priorIds);
    const relation = RELATIONS.has(text(item.relation)) ? (text(item.relation) as ItemRelation) : "new";
    const updates = headlineOnly && typeof item.updates === "string" ? item.updates : text(item.updates);
    drafts.push({
      headline,
      body,
      relation,
      importance: importanceOf(item.importance),
      refs,
      updatesId: priorIds.has(updates) ? updates : undefined
    });
  }
  return drafts;
}

function parseLeftOut(raw: unknown, known: Set<string>, idsOf: Map<string, string[]>): OmittedStory[] {
  const list = (raw as { left_out?: unknown })?.left_out;
  if (!Array.isArray(list)) return [];
  const out: OmittedStory[] = [];
  for (const entry of list) {
    const row = entry as Record<string, unknown>;
    const refs = (Array.isArray(row?.sources) ? row.sources : []).map((r) => text(r).toUpperCase()).filter((r) => known.has(r));
    if (refs.length) out.push({ stage: "editor", reason: text(row.why) || "no reason given", sourceIds: [...new Set(refs.flatMap((r) => idsOf.get(r) ?? []))] });
  }
  return out;
}

function scriptProblem(draft: { headline: string; body: string }, language: FeedSpec["language"]): string | undefined {
  const sample = `${draft.headline} ${draft.body}`;
  if (language === "ar" && !/[؀-ۿ]/.test(sample)) return "item is not written in Arabic";
  if (language !== "ar" && /[؀-ۿ]/.test(sample) && !/[A-Za-z]{3}/.test(sample)) return `item is not written in ${language === "en" ? "English" : "French"}`;
  return undefined;
}

const READER_RELATIVE_DATE = /\b(?:today|yesterday|tomorrow)\b|(?:اليوم|أمس|امس|غدًا|غدا)/iu;

function utcDay(value: string): string | undefined {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString().slice(0, 10);
}

/**
 * A source published before the reporting-cutoff day cannot, on its own,
 * establish that a reader-facing "today" is the cutoff day. This is narrower
 * than a semantic fact checker: it does not interpret event time, and it only
 * intervenes when every cited source is unambiguously older.
 */
function relativeDateGuard(draft: Draft, byRef: Map<string, PreparedArticle>, windowEnd: string): string | undefined {
  if (!READER_RELATIVE_DATE.test(`${draft.headline} ${draft.body}`)) return undefined;
  const cutoffDay = utcDay(windowEnd);
  const sourceDays = draft.refs.map((ref) => utcDay(byRef.get(ref)?.publishedAt ?? ""));
  if (cutoffDay && sourceDays.length && sourceDays.every((day) => !!day && day < cutoffDay)) {
    return "reader-facing relative date is unsupported: every cited source predates the reporting-cutoff day; anchor it to a supported calendar date or omit it";
  }
  return undefined;
}

/** Mechanical flags handed to the verifier as hints; never a verdict on their own. */
function hintsFor(draft: Draft, byRef: Map<string, PreparedArticle>, feed: FeedSpec): string[] {
  const evidence = draft.refs.map((ref) => {
    const source = byRef.get(ref);
    return source ? `${source.title ?? ""} ${source.publishedAt} ${source.text}` : "";
  }).join("\n");
  const evidenceNumbers = new Set(significantNumbers(evidence));
  const missing = significantNumbers(`${draft.headline} ${draft.body}`).filter((n) => !evidenceNumbers.has(n));
  const hints: string[] = [];
  if (missing.length) hints.push(`numbers not found in cited sources: ${missing.join(", ")}`);
  const script = scriptProblem(draft, feed.language);
  if (script) hints.push(script);
  return hints;
}

async function edit(
  port: ModelPort,
  meter: UsageMeter,
  models: BriefingModels,
  input: BriefingInput,
  articles: PreparedArticle[],
  prior: PriorItem[],
  partial = false,
  promptVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7 = 2,
  accountingPolicy?:EngineOptions['editorAccountingPolicy'],
  sourcePolicy?:EngineOptions['editorSourcePolicy'],
  noveltyPolicy?:EngineOptions['noveltyPolicy'],
  failurePolicy?:EngineOptions['editorFailurePolicy'],
  selectionPolicy?:EngineOptions['editorSelectionPolicy']
): Promise<{ drafts: Draft[]; omitted: OmittedStory[]; unaccounted: UnaccountedSource[] }> {
  const known = new Set(articles.map((a) => a.ref));
  const priorIds = new Set(prior.map((p) => p.id));
  const idsOf = new Map(articles.map((a) => [a.ref, [a.id, ...a.alsoIds]]));
  const recovery:{value?:{drafts:Draft[];omitted:OmittedStory[];unaccounted:UnaccountedSource[]}}={};
  try { return await callJson(
    port,
    meter,
    {
      model: models.editor,
      system: (promptVersion === 7 ? EDITOR_SYSTEM_V7 : promptVersion >= 6 ? EDITOR_SYSTEM_V6 : promptVersion >= 5 ? EDITOR_SYSTEM_V5 : promptVersion >= 4 ? EDITOR_SYSTEM_V4 : EDITOR_SYSTEM)+(noveltyPolicy?'\n\n'+OCCURRENCE_RULE:'')+wordingFidelity(input.feed)+(selectionPolicy?READER_PRIORITIES:'')+(accountingPolicy==='complete-source-decisions-v3'?STRUCTURED_ACCOUNTING_CONTRACT:''),
      user: editorUser({ feed: input.feed, windowStart: input.windowStart, windowEnd: input.windowEnd, prior, articles, partial, promptVersion })+(accountingPolicy==='complete-source-decisions-v1'
        ?'\n\nSOURCE ACCOUNTING CONTRACT: Every supplied article label must appear either in a selected item or in left_out with a nonempty, source-specific reason. Account for all labels even when items is empty. For each exclusion explain the actual source content: identify the unrelated topic/location, the fact already told, or what makes it non-news. Bare labels such as off-topic, routine, or not important are invalid. Group exclusions only when the same specific reason genuinely applies. A source must not be both selected and excluded. Report what the source actually says; a crime or investigative development is not routine official commentary. Coverage is bookkeeping, not a requirement to publish anything. Labels: '+articles.map(a=>a.ref).join(', '):'')+(accountingPolicy==='complete-source-decisions-v2'?'\n\nSOURCE ACCOUNTING CONTRACT: Account for every supplied article label in a selected item or left_out with a nonempty reason. Concise categories such as off-topic, routine or unchanged are valid. Group sources with the same reason. Give detail where the decision is ambiguous. Do not label a supporting report as excluded merely because another outlet covers the same development. Labels: '+articles.map(a=>a.ref).join(', '):'')+(sourcePolicy?'\n\nALL SUPPORTING SOURCES: While reading these articles, group reports of the SAME occurrence, decision or statement into ONE item and cite EVERY supplied source that directly supports it, including translations, shorter reports and repeated outlet coverage. Do not choose just one representative outlet. An additional supporting report is a citation, not a separate heading and not an editorial omission. Do not attach sources about a different occurrence, earlier status, proposal, or mere shared entities. Preserve meaningful attribution and uncertainty. Sources need not contain every supplementary detail. There is no later full-input source audit, so complete the sources array here.'+(partial?' PARTIAL CHUNK: Another chunk may contain the fuller report. Propose a concise, attributed draft for an on-topic supporting report even when this fragment is not a sufficient standalone story. Preserve only what this source establishes. For a fragment without an explicit action, describe its reported subject only; do not invent a discussion, decision, full name, title or location to make it a standalone story. Do not exclude an on-topic report as off-topic or redundant merely because it is short or lacks the complete decision; let consolidation combine its source with fuller reports of this same occurrence. This does not require publishing it as a separate story.':''):'')+(noveltyPolicy?OCCURRENCE_PROSE:''),
      maxTokens: accountingPolicy?Math.max(4000,articles.length*48):4000,
      ...(accountingPolicy==='complete-source-decisions-v3'?{responseSchema:editorAccountingSchema(articles.map(a=>a.ref))}:{}),
    },
    (raw) => {
      recovery.value=undefined;
      const drafts=parseDrafts(raw,known,priorIds,promptVersion>=4);
      if(accountingPolicy==='complete-source-decisions-v3')raw=normalizeEditorAccounting(raw,articles.map(a=>a.ref));
      if(accountingPolicy){
        try{assertCompleteEditorAccounting(raw,articles,accountingPolicy!=='complete-source-decisions-v1');}
        catch(error){
          const missing=auditEditorSourceAccounting(raw,articles);
          if(failurePolicy==='isolate-unaccounted-sources-v2'&&missing.length){
            const absent=new Set(missing.map(a=>a.ref));
            // Validate every received decision independently of the missing refs.
            // Conflicts, fabricated refs and invalid exclusions still fail closed.
            assertCompleteEditorAccounting(raw,articles.filter(a=>!absent.has(a.ref)),accountingPolicy!=='complete-source-decisions-v1');
            recovery.value={drafts,omitted:parseLeftOut(raw,known,idsOf),unaccounted:missing};
          }
          throw error;
        }
      }
      return {drafts,omitted:parseLeftOut(raw,known,idsOf),unaccounted:auditEditorSourceAccounting(raw,articles)};
    }
  ); }catch(error){
    // Only exhausted, received missing-reference output is recoverable. The
    // existing correction still runs; transport/payment/scope errors propagate.
    if(error instanceof BriefingOutputError&&recovery.value&&error.validationFailure?.startsWith('INCOMPLETE_EDITOR_ACCOUNTING: explicitly select or exclude every supplied source; missing '))return recovery.value;
    throw error;
  }
}

async function consolidate(
  port: ModelPort,
  meter: UsageMeter,
  models: BriefingModels,
  input: BriefingInput,
  drafts: Draft[],
  prior: PriorItem[],
  idsOfRefs: (refs: string[]) => string[],
  promptVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7,
  sourcePolicy?:EngineOptions['editorSourcePolicy'],
  noveltyPolicy?:EngineOptions['noveltyPolicy'],
  selectionPolicy?:EngineOptions['editorSelectionPolicy']
): Promise<{ drafts: Draft[]; omitted: OmittedStory[] }> {
  const priorIds = new Set(prior.map((p) => p.id));
  return callJson(
    port,
    meter,
    {
      model: models.editor,
      system: (promptVersion === 7 ? CONSOLIDATE_SYSTEM_V7 : promptVersion >= 6 ? CONSOLIDATE_SYSTEM_V6 : promptVersion >= 5 ? CONSOLIDATE_SYSTEM_V5 : CONSOLIDATE_SYSTEM)+(noveltyPolicy?'\n\n'+OCCURRENCE_RULE:'')+wordingFidelity(input.feed)+(selectionPolicy?READER_PRIORITIES+'\nCONSOLIDATION SCOPE: Preserve every editor-selected development. Merge only equivalent reports of the same occurrence, keeping all supporting from indices; never merge away a distinct development or cut it merely as routine/background. Shorten prose, not the set of selected developments. Later novelty and factual checks remain authoritative.':''),
      user: consolidateUser({
        promptVersion,
        feed: input.feed,
        prior,
        drafts: drafts.map((d) => ({ headline: d.headline, body: d.body, relation: d.relation, updates: d.updatesId, importance: d.importance }))
      })+(sourcePolicy?'\n\nPreserve every draft supporting the same development in the merged item: list ALL corresponding draft indices in from, including shorter or translated reports. Citations are the union of those drafts. Do not cut a supporting duplicate just to retain one representative outlet. A short supporting fragment can add a citation without adding a sentence. Preserve the supported wording of the fuller report and do not narrate that reports exist, details may be available elsewhere, or that something may have been discussed merely to describe a fragment. Do not turn preparation notes into reader text. Keep different occurrences and proposals separate.':'')+(noveltyPolicy?OCCURRENCE_PROSE:''),
      maxTokens: 4000
    },
    (raw) => {
      const list = (raw as { items?: unknown })?.items;
      if (!Array.isArray(list)) throw new Error('missing "items" array');
      const out: Draft[] = [];
      const order=new Map<Draft,number>();
      const used = new Set<number>();
      for (const entry of list) {
        const item = entry as Record<string, unknown>;
        const from = (Array.isArray(item?.from) ? item.from : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < drafts.length);
        const headline = text(item?.headline);
        const body = text(item?.body);
        if (promptVersion >= 4) {
          if (!headline) throw new Error('INVALID_ARTICLE_HEADLINE: every consolidated item requires a nonempty string headline');
          if (typeof item?.body !== "string") throw new Error('INVALID_ARTICLE_BODY: every consolidated item requires a string body; use body:"" for a complete headline-only item');
          if (!Array.isArray(item?.from) || !item.from.length || item.from.some((n) => typeof n !== "number" || !Number.isInteger(n) || n < 0 || n >= drafts.length)) {
            throw new Error('INVALID_CONSOLIDATION_FROM: every selected item requires a nonempty array of supplied integer draft indices');
          }
        }
        if (!from.length || !headline || (!body && promptVersion < 4) || (promptVersion >= 4 && typeof item?.body !== "string")) continue;
        // Sources are the union of the merged drafts: the model cannot invent a citation here.
        const refs = [...new Set(from.flatMap((n: number) => drafts[n].refs))];
        const updates = promptVersion >= 4 && typeof item.updates === "string" ? item.updates : text(item.updates);
        if (promptVersion >= 4) validateRelation(item, priorIds);
        out.push({
          headline,
          body,
          relation: RELATIONS.has(text(item.relation)) ? (text(item.relation) as ItemRelation) : drafts[from[0]].relation,
          importance: importanceOf(item.importance),
          refs,
          updatesId: priorIds.has(updates) ? updates : promptVersion >= 4 ? undefined : drafts[from[0]].updatesId
        });
        for (const n of from) used.add(n);
        order.set(out[out.length-1],Math.min(...from));
      }
      const omitted: OmittedStory[] = [];
      const cutIndexes = new Set<number>();
      const cuts = Array.isArray((raw as { cut?: unknown })?.cut) ? ((raw as { cut: unknown[] }).cut) : [];
      for (const entry of cuts) {
        const row = entry as Record<string, unknown>;
        const from = (Array.isArray(row?.from) ? row.from : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < drafts.length && !used.has(n));
        for (const n of from) {
          if (drafts[n].importance === 1 || selectionPolicy) continue; // restored below
          cutIndexes.add(n);
          omitted.push({ stage: "consolidation", reason: text(row.why) || "cut for reading budget", headline: drafts[n].headline, sourceIds: idsOfRefs(drafts[n].refs) });
        }
      }
      const restored: Draft[] = [];
      drafts.forEach((draft, n) => {
        if (used.has(n) || cutIndexes.has(n)) return;
        // A lead story is never lost to the cut; anything else the model silently dropped is recorded as such.
        if (draft.importance === 1 || selectionPolicy){restored.push(draft);order.set(draft,n);}
        else omitted.push({ stage: "consolidation", reason: "dropped by consolidation without a reason", headline: draft.headline, sourceIds: idsOfRefs(draft.refs) });
      });
      const retained=[...restored,...out];
      return { drafts: selectionPolicy?retained.sort((a,b)=>order.get(a)!-order.get(b)!):retained, omitted };
    }
  );
}

interface Verdict {
  verdict: "ok" | "fix" | "drop" | "redundant";
  issues: string[];
}

export function batchesBySourceSize(indices: number[], drafts: Draft[], byRef: Map<string, PreparedArticle>, maxChars: number,proofAware=false): number[][] {
  const batches: Array<{ indices: number[]; refs: Set<string>; chars: number;proof:number }> = [];
  for (const index of indices) {
    const refs = drafts[index].refs;
    // Planning estimate for the existing 8k verification reply, not a cap on
    // stories/evidence. The measured 147-facet reply exceeded that allowance.
    // Preserve an oversized individual story intact; every index is processed.
    const proof=2*(drafts[index].headline.length+drafts[index].body.length)+128*refs.length+256;
    let placed = false;
    for (const batch of batches) {
      const added = refs.filter((ref) => !batch.refs.has(ref)).reduce((sum, ref) => sum + (byRef.get(ref)?.text.length ?? 0), 0);
      if (batch.chars + added <= maxChars&&(!proofAware||batch.proof+proof<=8000)) {
        batch.indices.push(index);
        for (const ref of refs) batch.refs.add(ref);
        batch.chars += added;
        batch.proof += proof;
        placed = true;
        break;
      }
    }
    if (!placed) {
      batches.push({ indices: [index], refs: new Set(refs), chars: refs.reduce((s, ref) => s + (byRef.get(ref)?.text.length ?? 0), 0),proof });
    }
  }
  return batches.map((batch) => batch.indices);
}

async function verify(
  port: ModelPort,
  meter: UsageMeter,
  models: BriefingModels,
  input: BriefingInput,
  drafts: Draft[],
  indices: number[],
  byRef: Map<string, PreparedArticle>,
  prior: PriorItem[],
  maxChars: number,
  previousReviews: Map<number, Omit<PreviousReview, "index">>,
  promptVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7,
  noveltyGuard = false,
  sourcePolicy?:EngineOptions['editorSourcePolicy'],
  noveltyPolicy?:EngineOptions['noveltyPolicy']
): Promise<Map<number, Verdict>> {
  const priorById = new Map(prior.map((p) => [p.id, p]));
  const results = new Map<number, Verdict>();
  const batches = batchesBySourceSize(indices, drafts, byRef, maxChars,input.feed.verificationOutputPolicy==='reader-load-batches-v1');
  await Promise.all(
    batches.map(async (batch) => {
      const refs = [...new Set(batch.flatMap((i) => drafts[i].refs))];
      const sources = refs.map((ref) => byRef.get(ref)!).filter(Boolean);
      if(input.feed.identityFidelityPolicy==='source-bound-claims-v1'||independentBindingPolicy(input.feed.identityFidelityPolicy)){
        const verified=await verifySourceBoundClaims(port,meter,{model:models.verifier,language:input.feed.language,
          items:batch.map(index=>drafts[index]),sources,prior,verificationInputPolicy:input.feed.verificationInputPolicy,sourceInventoryPolicy:input.feed.sourceInventoryPolicy,sourceSchemaSharing:input.feed.schemaSharingPolicy==='source-definitions-v1',verificationSchemaPolicy:input.feed.verificationSchemaPolicy,strictLegacyInventory:input.feed.identityFidelityPolicy==='source-bound-claims-v1',independentSourceBindings:independentBindingPolicy(input.feed.identityFidelityPolicy),atomicReaderAssertions:input.feed.identityFidelityPolicy==='source-bound-claims-v3',
          context:JSON.stringify({windowEnd:input.windowEnd,previousReviews:batch.map(index=>previousReviews.get(index)??null)})});
        for(const [local,decision]of verified)results.set(batch[local],decision);
        return;
      }
      const parsed = await callJson(
        port,
        meter,
        {
          model: models.verifier,
          system: wordingBase(input.feed,'verify',(promptVersion === 7 ? VERIFY_SYSTEM_V7 : promptVersion >= 6 ? VERIFY_SYSTEM_V6 : promptVersion >= 5 ? VERIFY_SYSTEM_V5 : promptVersion >= 3 ? VERIFY_SYSTEM : LEGACY_VERIFY_SYSTEM))+(noveltyGuard?`\n\n${NOVELTY_RULE}`:'')+(noveltyPolicy?'\n\n'+OCCURRENCE_RULE:'')+wordingFidelity(input.feed,true)+(input.feed.verificationRecoveryPolicy?'\n\n'+(input.feed.verificationRecoveryPolicy==='supported-core-v2'?SUPPORTED_CORE_VERIFY_V2:SUPPORTED_CORE_VERIFY):''),
          user: verifyUser({
            promptVersion,
            previousReviews: batch.flatMap((index, localIndex) => {
              const previous = previousReviews.get(index);
              return previous ? [{ index: localIndex, ...previous }] : [];
            }),
            windowEnd: input.windowEnd,
            prior,
            sources,
            items: batch.map((index, localIndex) => {
              const d = drafts[index];
              const earlier = d.updatesId ? priorById.get(d.updatesId) : undefined;
              return {
                index: localIndex,
                headline: d.headline,
                body: d.body,
                relation: d.relation,
                sources: d.refs,
                updatesText: earlier ? `${earlier.headline}: ${earlier.body}` : undefined,
                hints: hintsFor(d, byRef, input.feed)
              };
            })
          })+(sourcePolicy?'\n\nCheck EACH cited source: it must directly support this same central occurrence, decision or statement, rather than just share a topic or entity. Translations and shorter reports qualify even without every supplementary detail. Flag unrelated or conflicting citations with their exact labels; do not approve an item with unsupported citations. Check all factual claims against the cited evidence as usual.':'')+(noveltyPolicy?OCCURRENCE_PROSE:''),
          maxTokens: 3000
        },
        (raw) => {
          const list = (raw as { results?: unknown })?.results;
          if (!Array.isArray(list)) throw new Error('missing "results" array');
          const out = new Map<number, Verdict>();
          for (const entry of list) {
            const row = entry as Record<string, unknown>;
            const i = row?.i;
            const verdict = text(row?.verdict).toLowerCase();
            if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= batch.length) throw new Error('invalid verifier item index');
            if (out.has(batch[i])) throw new Error('duplicate verifier item index');
            if (promptVersion >= 4 &&
              (!["ok", "fix", "drop", "redundant"].includes(row?.verdict as string) ||
                (row.issues !== undefined && (!Array.isArray(row.issues) || row.issues.some((issue) => typeof issue !== "string"))))) {
              throw new Error('INVALID_VERIFIER_VERDICT: use an exact verdict enum and an optional array of string issues');
            }
            if (!["ok", "fix", "drop", "redundant"].includes(verdict)) continue;
            const issues = (Array.isArray(row.issues) ? row.issues : []).map(text).filter(Boolean);
            out.set(batch[i], { verdict: verdict as Verdict["verdict"], issues });
          }
          return out;
        }
      );
      for (const [i, verdict] of parsed) results.set(i, verdict);
    })
  );
  return results;
}

async function repair(
  port: ModelPort,
  meter: UsageMeter,
  models: BriefingModels,
  input: BriefingInput,
  drafts: Draft[],
  flagged: Map<number, string[]>,
  byRef: Map<string, PreparedArticle>,
  headlineOnly = false,
  promptVersion: 1 | 2 | 3 | 4 | 5 | 6 | 7 = 4,
  noveltyPolicy?:EngineOptions['noveltyPolicy'],
  history:Map<number,Array<Omit<PreviousReview,'index'>>>=new Map(),
  finalRepair=false
): Promise<Map<number, { headline: string; body: string } | null>> {
  // Model-facing numbers are local to this subset; translate back mechanically.
  const exact=new Map<number,{headline:string;body:string}|null>();
  if(input.feed.identityFidelityPolicy==='source-bound-claims-v3')for(const [index,issues]of flagged){
    const fixed=sourceBoundIdentityRepair({...drafts[index],issues},[...byRef.values()]);
    if(fixed)exact.set(index,fixed);
  }
  const indices = [...flagged.keys()].filter(index=>!exact.has(index));
  if(!indices.length)return exact;
  const refs = [...new Set(indices.flatMap((i) => drafts[i].refs))];
  const sources = refs.map((ref) => byRef.get(ref)!).filter(Boolean);
  const generated=await callJson(
    port,
    meter,
    {
      model: models.editor,
      system: wordingBase(input.feed,'repair',(promptVersion === 7 ? REPAIR_SYSTEM_V7 : promptVersion >= 6 ? REPAIR_SYSTEM_V6 : headlineOnly ? REPAIR_SYSTEM + '\nReturn body:"" when the headline alone preserves the supported development and all essential qualifications.' : REPAIR_SYSTEM))+wordingFidelity(input.feed)+(input.feed.verificationRecoveryPolicy?'\n\n'+(input.feed.verificationRecoveryPolicy==='supported-core-v2'?SUPPORTED_CORE_REPAIR_V2:SUPPORTED_CORE_REPAIR):''),
      user: repairUser({
        windowEnd: input.windowEnd,
        sources,
        items: indices.map((index, localIndex) => ({
          index: localIndex,
          headline: drafts[index].headline,
          body: drafts[index].body,
          relation: drafts[index].relation,
          sources: drafts[index].refs,
          issues: flagged.get(index)!
        }))
      })+(noveltyPolicy?OCCURRENCE_PROSE:'')+(input.feed.verificationRecoveryPolicy?recoveryHistory(history,indices,input.feed.verificationRecoveryPolicy==='supported-core-v2'?false:finalRepair)+(input.feed.verificationRecoveryPolicy==='supported-core-v2'?'\n\n'+(finalRepair?'FINAL SUPPORTED-CORE REPAIR: ':'')+MATERIAL_RECOVERY:'')+(independentBindingPolicy(input.feed.identityFidelityPolicy)?'\n\nIDENTITY REPAIR SCOPE: Restore the complete original story from the FIRST repair-history draft, correcting only each demonstrated unsupported name/role or other factual defect against the original evidence. Retain its independently supported actions, quantities, material conditions and developments. Do not repeatedly summarize the last shortened repair. Keep the original body when it contains supported developments beyond the headline. A name/title correction must not erase the body. When an unsupported added given name is the ONLY defect, remove ONLY that given-name expansion and preserve every other supported word, including an independently supported role/title; do not rewrite the whole headline or delete the role merely to shorten it. When a role is explicitly contradicted, replace ONLY that role with the independently source-bound role, keeping the rest of the story unchanged. Earlier reviewer prose is not evidence; preserve only source-supported material. If the role/name is unsupported, use the source-established identity rather than deleting the story context. This instruction takes priority over optional headline-only compression.':''):''),
      maxTokens: 3000
    },
    (raw) => {
      const list = (raw as { items?: unknown })?.items;
      if (!Array.isArray(list)) throw new Error('missing "items" array');
      const out = new Map<number, { headline: string; body: string } | null>();
      for (const entry of list) {
        const row = entry as Record<string, unknown>;
        // A malformed repair is not a decision to omit supported news. Keep
        // local subset ownership exact and use the existing format correction.
        if (promptVersion >= 4 &&
          (typeof row?.i !== 'number' || !Number.isInteger(row.i) || row.i < 0 || row.i >= indices.length ||
            out.has(indices[row.i]) || (row.drop !== undefined && typeof row.drop !== 'boolean'))) {
          throw new Error('INVALID_REPAIR_ITEM: use each supplied integer index once and a boolean drop flag when present');
        }
        const i = Number(row?.i);
        if (!Number.isInteger(i) || i < 0 || i >= indices.length) continue;
        const headline = text(row.headline);
        const body = text(row.body);
        if (promptVersion >= 4 && row.drop !== true &&
          (typeof row.headline !== 'string' || !headline || typeof row.body !== 'string')) {
          throw new Error('INVALID_REPAIR_TEXT: return the repaired headline and body, or explicitly use drop:true');
        }
        out.set(indices[i], row.drop === true || !headline || (!body && !headlineOnly) || (headlineOnly && typeof row.body !== "string") ? null : { headline, body });
      }
      if (promptVersion >= 4 && out.size !== indices.length) {
        throw new Error('INCOMPLETE_REPAIR: return every supplied item index, using drop:true only for intentional omissions');
      }
      return out;
    }
  );
  return new Map([...exact,...generated]);
}

/**
 * Turns the window's articles into a verified briefing.
 *
 * Calls in a normal run: one editor call and one verification call. Flagged items get one
 * targeted rewrite and one re-check; an item that still fails is dropped on its own, so a
 * single bad sentence never blocks the rest of the briefing. Throws only when the model
 * cannot be reached or keeps returning unusable output, in which case nothing has been
 * persisted and the window can simply be retried.
 */
export async function generateBriefing(
  input: BriefingInput,
  port: ModelPort,
  models: BriefingModels,
  overrides: Partial<EngineOptions> = {}
): Promise<BriefingResult> {
  if(input.feed.schemaSharingPolicy==='shared-definitions-v1')port=withSharedSchemas(port);
  if ('v7Experiment' in overrides && overrides.v7Experiment !== undefined) throw new Error('UNSUPPORTED_V7_EXPERIMENT');
  const options: EngineOptions = { ...DEFAULT_ENGINE, ...overrides };
  if(input.feed.topicSelectionPolicy&&options.architecture)throw Error('TOPIC_SELECTION_ARCHITECTURE_UNQUALIFIED');
  if(input.feed.wordingFidelityPolicy&&options.architecture)throw Error('WORDING_FIDELITY_ARCHITECTURE_UNQUALIFIED');
  if(options.editorSourcePolicy&&options.citationCoverage)throw Error('CONFLICTING_SOURCE_POLICIES');
  if (options.architecture !== undefined) {
    if (options.architecture !== 'evidence-first-v1' && options.architecture !== 'evidence-first-v2') throw new Error('UNSUPPORTED_BRIEFING_ARCHITECTURE');
    return generateEvidenceBriefing(input, port, models, options);
  }
  const meter = new UsageMeter();
  const started = Date.now();
  const stages: Record<string, number> = {};
  const timed = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
    const t = Date.now();
    try {
      return await run();
    } finally {
      stages[name] = (stages[name] ?? 0) + Date.now() - t;
    }
  };
  const omittedStories: OmittedStory[] = [];
  const unaccounted: UnaccountedSource[] = [];
  const finish = (partial: Pick<BriefingResult, "status" | "items" | "skipped" | "dropped">): BriefingResult => ({
    ...partial,
    omitted: omittedStories,
    unaccounted,
    ...(options.editorAccountingPolicy?{sourceDecisions:buildSourceDecisions(input.articles.map(a=>a.id),prepared,{...partial,omitted:omittedStories})}:{}),
    usage: meter.usage,
    timings: { totalMs: Date.now() - started, stages }
  });

  const { prepared, skipped } = prepareArticles(input.articles, options.prepare);
  if (!prepared.length) return finish({ status: "empty", items: [], skipped, dropped: [] });

  const byRef = new Map(prepared.map((a) => [a.ref, a]));
  const prior = selectPrior(input.prior ?? [], prepared, options.now());
  const priorIds = new Set((options.noveltyGuard?input.prior??[]:prior).map((p) => p.id));
  const sourceIdsOfRefs = (refs: string[]) => [...new Set(refs.flatMap((ref) => [byRef.get(ref)!.id, ...byRef.get(ref)!.alsoIds]))];

  // 1. Edit: choose and write.
  const editorialFailures: DroppedItem[] = [];
  let eligible=prepared;
  if(input.feed.topicSelectionPolicy==='reader-topic-boundaries-v1'){
    const decisions=await timed('topic_selection',()=>selectTopicSources(port,meter,models.verifier,input.feed,prepared,options.maxVerifyChars));
    eligible=prepared.filter(article=>{
      const decision=decisions.get(article.ref)!;
      if(decision.relation==='direct')return true;
      const sourceIds=sourceIdsOfRefs([article.ref]);
      if(decision.relation==='uncertain')editorialFailures.push({headline:article.title??'Unresolved topic relevance',reason:'Topic relevance unresolved: '+decision.reason,carry:true,sourceIds});
      else omittedStories.push({stage:'editor',reason:'Off-topic: '+decision.reason,sourceIds});
      return false;
    });
    if(!eligible.length)return finish({status:editorialFailures.length?'rejected':'empty',items:[],skipped,dropped:editorialFailures});
  }
  const editChunk=async(chunk:PreparedArticle[],partial:boolean)=>{
    try{
      const edited=await edit(port,meter,models,input,chunk,prior,partial,options.promptVersion,options.editorAccountingPolicy,options.editorSourcePolicy,options.noveltyPolicy,options.editorFailurePolicy,options.editorSelectionPolicy);
      if(options.editorFailurePolicy==='isolate-unaccounted-sources-v2'&&edited.unaccounted.length)editorialFailures.push({headline:'Unaccounted source decisions',reason:'EDITOR_ACCOUNTING_INCOMPLETE: editor sources unaccounted after bounded correction; retained for a later window',carry:true,sourceIds:edited.unaccounted.flatMap(a=>a.sourceIds)});
      return edited;
    }
    catch(error){
      if(!options.editorAccountingPolicy||!options.editorFailurePolicy||!(error instanceof BriefingOutputError)||!partial&&!/EDITOR_ACCOUNTING/.test(error.validationFailure??''))throw error;
      editorialFailures.push({headline:'Unprocessed source batch',reason:'editor output unusable after correction: '+error.message.split('; last reply began:')[0],carry:true,sourceIds:sourceIdsOfRefs(chunk.map(a=>a.ref))});
      return {drafts:[],omitted:[],unaccounted:auditEditorSourceAccounting({},chunk)};
    }
  };
  const chunks = chunkArticles(eligible, options.maxEditorChars);
  let drafts: Draft[];
  const omitted: OmittedStory[] = [];
  if (chunks.length === 1) {
    const edited = await timed("edit", () => editChunk(eligible,false));
    drafts = edited.drafts;
    omitted.push(...edited.omitted);
    unaccounted.push(...edited.unaccounted);
  } else {
    const parts = await timed("edit", async () => {
      const outcomes=await Promise.allSettled(chunks.map(chunk=>editChunk(chunk,true)));
      return outcomes.map((outcome,i)=>{
        if(outcome.status==='fulfilled')return outcome.value;
        if(!options.editorFailurePolicy||!(outcome.reason instanceof BriefingOutputError))throw outcome.reason;
        editorialFailures.push({headline:'Unprocessed source batch',reason:'editor output unusable after correction',carry:true,sourceIds:sourceIdsOfRefs(chunks[i].map(a=>a.ref))});
        return {drafts:[],omitted:[],unaccounted:auditEditorSourceAccounting({},chunks[i])};
      });
    });
    const merged = parts.flatMap((part) => part.drafts);
    omitted.push(...parts.flatMap((part) => part.omitted));
    unaccounted.push(...parts.flatMap((part) => part.unaccounted));
    if (merged.length > 1) {
      const consolidated = await timed("consolidate", () => consolidate(port, meter, models, input, merged, prior, sourceIdsOfRefs, options.promptVersion,options.editorSourcePolicy,options.noveltyPolicy,options.editorSelectionPolicy));
      drafts = consolidated.drafts;
      omitted.push(...consolidated.omitted);
    } else {
      drafts = merged;
    }
  }
  omittedStories.push(...omitted);
  drafts = drafts
    .map((d, order) => ({ d, order }))
    .sort((a, b) => a.d.importance - b.d.importance || a.order - b.order)
    .map(({ d }) => d);
  for (const d of drafts.slice(options.maxItems)) {
    omittedStories.push({ stage: "safety_cap", reason: `over the safety limit of ${options.maxItems} items`, headline: d.headline, sourceIds: sourceIdsOfRefs(d.refs) });
  }
  drafts = drafts.slice(0, options.maxItems);
  const repeatReasons=new Map<Draft,string>();
  const exactRepeats=options.noveltyGuard&&!options.noveltyPolicy?drafts.filter(d=>exactPriorRepeat(d,input.prior??[])):[];
  if(options.noveltyGuard&&!options.noveltyPolicy)drafts=drafts.filter(d=>!exactPriorRepeat(d,input.prior??[]));
  if(options.noveltyGuard&&drafts.length){
    const memory=verificationMemory(input.prior??[],drafts,options.now());
    const redundant=options.noveltyPolicy?await timed('novelty',async()=>{
      // Reuse evidence-size batching; every draft and its complete cited evidence is retained.
      const decisions=(await Promise.all(batchesBySourceSize(drafts.map((_,i)=>i),drafts,byRef,options.maxVerifyChars).map(async batch=>{
        const selected=batch.map(i=>drafts[i]);
        const rows=await occurrenceNovelty(port,meter,models.editor,selected.map(d=>({headline:d.headline,body:d.body,sources:d.refs.flatMap(ref=>{const a=byRef.get(ref);return a?[{id:a.id,publishedAt:a.publishedAt,text:a.text}]:[]})})),verificationMemory(input.prior??[],selected,options.now()),input.windowEnd,Boolean(options.editorSelectionPolicy),options.noveltyWirePolicy);
        return rows.map(row=>({...row,i:batch[row.i]}));
      }))).flat();
      for(const d of decisions)if(d.redundant)repeatReasons.set(drafts[d.i],`Same occurrence already covered in ${d.priorIds.join(', ')}: ${d.sameOccurrence}`);
      if(options.editorSelectionPolicy)for(const d of decisions)if(!d.redundant&&d.relation&&d.relation!=='repeat'){
        drafts[d.i].relation=d.relation;
        drafts[d.i].updatesId=d.relation==='new'?undefined:d.priorIds[0];
      }
      return new Set(decisions.filter(d=>d.redundant).map(d=>d.i));
    }):await timed('novelty',()=>redundantDrafts(port,meter,models.editor,drafts,memory));
    exactRepeats.push(...drafts.filter((_,i)=>redundant.has(i)));
    drafts=drafts.filter((_,i)=>!redundant.has(i));
  }
  if (!drafts.length) return finish({ status: editorialFailures.length ? "rejected" : "empty", items: [], skipped, dropped: [...editorialFailures,...exactRepeats.map(d=>({headline:d.headline,reason:repeatReasons.get(d)??'repeats published reader information without material change',carry:false,sourceIds:sourceIdsOfRefs(d.refs)}))] });

  // 2. Verify, repair what is repairable once, drop what is not.
  const dropped: DroppedItem[] = [...editorialFailures,...exactRepeats.map(d=>({headline:d.headline,reason:repeatReasons.get(d)??'repeats published reader information without material change',carry:false,sourceIds:sourceIdsOfRefs(d.refs)}))];
  const verifierPrior=options.noveltyGuard?verificationMemory(input.prior??[],drafts,options.now()):prior;
  if(options.citationCoverage){
    const refs=await timed('source_coverage',()=>completeStorySources(port,meter,models.editor,drafts,prepared,options.maxEditorChars));
    drafts=drafts.map((d,i)=>({...d,refs:refs[i]}));
  }
  const accepted = new Set<number>();
  const previousReviews = new Map<number, Omit<PreviousReview, "index">>();
  const repairHistory = new Map<number,Array<Omit<PreviousReview,'index'>>>();
  let todo = drafts.map((_, i) => i);
  for (let round = 0; round <= options.maxRepairs && todo.length; round += 1) {
    const verdicts = await timed("verify", () => verify(port, meter, models, input, drafts, todo, byRef, verifierPrior, options.maxVerifyChars, previousReviews, options.promptVersion, options.noveltyGuard,options.editorSourcePolicy,options.noveltyPolicy));
    const flagged = new Map<number, string[]>();
    const unchecked: number[] = [];
    for (const index of todo) {
      const verdict = verdicts.get(index);
      const dateIssue = options.safetyGuard === 'relative-date-v1'
        ? relativeDateGuard(drafts[index], byRef, input.windowEnd)
        : undefined;
      const identityIssues=input.feed.identityFidelityPolicy==='arabic-person-role-v1'
        ?arabicIdentityIssues(`${drafts[index].headline}\n${drafts[index].body}`,drafts[index].refs.flatMap(ref=>{const a=byRef.get(ref);return a?[`${a.title??''}\n${a.text}`]:[]})):[];
      const guardIssue=dateIssue??(identityIssues.length?identityIssues.map(x=>x.code==='ARABIC_ROLE_TEMPORAL_UNRESOLVED'?`${x.code}: only explicitly historical cited bindings establish "${x.quote}". Preserve the historical qualification or omit the role; do not infer a current office.`:`${x.code}: reader identity "${x.quote}" is not bound to that name/role in the cited sources. Preserve the supported identity, use the supported surname only, or withhold; do not import prior text or outside knowledge.`).join(' '):undefined);
      if (!verdict) unchecked.push(index);
      // Admission checks, not a general truth oracle: an explicit date
      // contradiction or unbound person/role requires repair or withholding.
      // A fallible model's "ok" cannot override that source-binding requirement.
      else if (guardIssue && round < options.maxRepairs) flagged.set(index, [guardIssue]);
      else if (guardIssue) dropped.push({ headline: drafts[index].headline, reason: `still flagged after repair: ${guardIssue}`, carry: true, sourceIds: sourceIdsOfRefs(drafts[index].refs) });
      else if (verdict.verdict === "ok") accepted.add(index);
      else if (verdict.verdict === "redundant") dropped.push({ headline: drafts[index].headline, reason: verdict.issues.join(" | ") || "repeats what the reader was already told", carry: false, sourceIds: sourceIdsOfRefs(drafts[index].refs) });
      else if (verdict.verdict === "drop") dropped.push({ headline: drafts[index].headline, reason: verdict.issues.join(" | ") || "judged unsupported", carry: true, sourceIds: sourceIdsOfRefs(drafts[index].refs) });
      else if (round < options.maxRepairs) flagged.set(index, verdict.issues.length ? verdict.issues : ["verifier flagged this item"]);
      else dropped.push({ headline: drafts[index].headline, reason: `still flagged after repair: ${verdict.issues.join(" | ")}`, carry: true, sourceIds: sourceIdsOfRefs(drafts[index].refs) });
    }
    todo = unchecked; // a verifier that skipped an item has not approved it; ask again
    if (flagged.size && round < options.maxRepairs) {
      for(const [index,issues]of flagged)repairHistory.set(index,[...(repairHistory.get(index)??[]),{headline:drafts[index].headline,body:drafts[index].body,issues:[...issues]}]);
      const fixes = await timed("repair", () => repair(port, meter, models, input, drafts, flagged, byRef, options.promptVersion >= 4, options.promptVersion,options.noveltyPolicy,repairHistory,round===options.maxRepairs-1));
      for (const index of flagged.keys()) {
        const fixed = fixes.get(index);
        if (!fixed) {
          dropped.push({ headline: drafts[index].headline, reason: `could not be repaired: ${flagged.get(index)!.join(" | ")}`, carry: true, sourceIds: sourceIdsOfRefs(drafts[index].refs) });
          continue;
        }
        previousReviews.set(index, { headline: drafts[index].headline, body: drafts[index].body, issues: [...flagged.get(index)!] });
        drafts[index] = { ...drafts[index], ...fixed };
        todo.push(index);
      }
    }
  }
  for (const index of todo) dropped.push({ headline: drafts[index].headline, reason: "never confirmed by the verifier", carry: true, sourceIds: sourceIdsOfRefs(drafts[index].refs) });

  if(input.feed.verificationRecoveryPolicy==='supported-core-v2'){
    const repaired=[...accepted].filter(index=>repairHistory.has(index));
    for(const batch of batchesBySourceSize(repaired,drafts,byRef,options.maxVerifyChars)){
      const refs=[...new Set(batch.flatMap(index=>drafts[index].refs))];
      let issues:Map<number,string>;
      try{
        issues=await timed('recovery_coverage',()=>auditRepairCoverage(port,meter,models.editor,input,batch.map(index=>({index,...drafts[index],history:repairHistory.get(index)!})),refs.map(ref=>byRef.get(ref)!)));
      }catch(error){
        // Only received output that exhausted correction is isolatable. Provider,
        // accounting, scope and uncertain-payment failures must still propagate.
        if(!(error instanceof BriefingOutputError)||error.uncertain)throw error;
        const reason='EDITORIAL_RECOVERY_COVERAGE: unusable after correction: '+error.message.split('; last reply began:')[0];
        issues=new Map(batch.map(index=>[index,reason]));
      }
      for(const [index,reason]of issues){accepted.delete(index);dropped.push({headline:drafts[index].headline,reason,carry:true,sourceIds:sourceIdsOfRefs(drafts[index].refs)});}
    }
  }

  const items: BriefingItem[] = [...accepted]
    .sort((a, b) => a - b)
    .map((index) => {
      const d = drafts[index];
      const ids = d.refs.flatMap((ref) => [byRef.get(ref)!.id, ...byRef.get(ref)!.alsoIds]);
      return {
        headline: d.headline,
        body: options.promptVersion >= 4 && d.body === d.headline ? "" : d.body,
        relation: d.relation,
        importance: d.importance,
        sourceIds: [...new Set(ids)],
        ...(d.updatesId && priorIds.has(d.updatesId) ? { updatesId: d.updatesId } : {})
      };
    });
  return finish({ status: items.length ? "published" : "rejected", items, skipped, dropped });
}
