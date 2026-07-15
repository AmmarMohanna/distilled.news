import type { BriefingConfig, BriefingEvidence, SummaryAdapter, SummaryInput } from "./types";
import { firstSentence, normalizeText, significantTokens } from "./text";

const INVALID_SUMMARY_PATTERNS = [
  /\bno new verified information\b/i,
  /\bnothing new to report\b/i,
  /\bno new updates?\b/i,
  /\bprovided evidence\b/i,
  /\bas an ai\b/i,
  /\bi (do not|don't) have enough information\b/i,
  /\bnot enough information\b/i,
  /\bunable to (determine|verify|summari[sz]e)\b/i,
  /\bcannot (determine|verify|summari[sz]e)\b/i,
  /\btoday'?s distilled\.?\s*news briefing\b/i,
  /\binclude in (today'?s|the) distilled\.?\s*news briefing\b/i,
  /^NO_POST$/i,
  /لا توجد معلومات جديدة/u,
  /لا يوجد(?:\s+\S+){0,4}\s+(?:معلومات|تحديثات|تطورات)/u,
  /لا تتوفر(?:\s+\S+){0,4}\s+(?:معلومات|تحديثات|تطورات)/u,
  /ـ\s*[./]/u,
  /(?:^|\s)\/\s*[\u0600-\u06FF]/u,
  /[\u0600-\u06FF]\d[\u0600-\u06FF]/u
];

const LOW_INFORMATION_SUMMARY_PATTERNS = [
  /آخر تصريحات/u,
  /التفاصيل/u,
  /للتفاصيل/u,
  /للمزيد/u,
  /شاهد(?:وا)?/u,
  /^(?:will|would|could|should|can|is|are|does|do|did|what|why|how|when|where|who)\b/i,
  /(?:^|[:–—-]\s*)(?:what|why|how|when|where|who)\b/i,
  /\b(?:what to know|predictions?|ahead of the (?:match|game|semifinal|final)|where to watch)\b/i,
  /^(?:est-ce|pourquoi|comment|quand|où|qui|quel(?:le|s|les)?)(?=$|[^\p{L}\p{N}_])/iu,
  /^(?:هل|لماذا|كيف|متى|أين|اين|مَن)(?:\s|$)/u,
  /^قبل\s+(?:توقيع|بدء|انطلاق|اجتماع|جلسة|زيارة|لقاء)(?:\s|$|[.،,])/u,
  /^بعد\s+(?:توقيع|بدء|انتهاء|انطلاق|اجتماع|جلسة|زيارة|لقاء)(?:\s|$|[.،,])/u
];

const ARTIFACT_SENTENCE_PATTERNS = [
  /لم ترد تفاصيل إضافية/u,
  /لا توجد تفاصيل إضافية/u,
  /لا تتوفر تفاصيل إضافية/u,
  /\bno further details\b/i,
  /\bno additional details\b/i
];

const CONTEXT_ONLY_SUMMARY_PATTERNS = [
  /^(?:after|before|following|ahead of|prior to|in the wake of)\b/i,
  /^(?:عقب|بعد|قبل|إثر|اثر|على خلفية)\s+/u
];

const INFORMATION_SIGNAL_PATTERNS = [
  /[:：]/,
  /\b\d+([.,]\d+)?\b/,
  /\b(?:confirmed|reported|said|signed|approved|authorized|cleared|announced|opened|closed|killed|injured|arrested|launched|released|introduced|adds?|added|halted|resumed|ended|expired|renewed|cancell?ed|affected|damaged|disrupted|improved|increased|decreased|rose|fell)\b/i,
  /(?:^|[^\p{L}\p{N}_])(?:a |ont )?(?:confirmé|rapporté|déclaré|signé|approuvé|autorisé|annoncé|ouvert|fermé|tué|blessé|arrêté|lancé|publié|introduit|ajouté|suspendu|repris|terminé|expiré|renouvelé|annulé|affecté|endommagé|perturbé|amélioré|augmenté|diminué)(?=$|[^\p{L}\p{N}_])/iu,
  /(?:أعلن|اعلن|أكد|اكد|أفاد|افاد|وقّع|وقع|سيوقع|قتل|استشهد|أصيب|اصيب|جرح|اعتقل|أقر|اقر|وافق|افتتح|أغلق|اغلق|استهدف|قصف|غارة|غاره|انفجار|انسحب|بدأ|بدا|استأنف|استانف|قطع|أوقف|اوقف|جريح|جريحين|جريحان|جرحى|قتيل|قتلى)/u,
  /(?:جريح|جريحان|جرحى|قتيل|قتلى|شهيد|شهداء)(?:\s+\S+){0,8}\s+(?:نتيجة|جراء|بسبب|إثر|اثر|تصادم|استهداف|غارة|قصف|إطلاق|انفجار|حريق)/u
];

export class DeterministicSummaryAdapter implements SummaryAdapter {
  async summarize(input: SummaryInput): Promise<string> {
    return createEvidenceOnlySummary(input.briefing, input.evidence);
  }
}

export function createEvidenceOnlySummary(
  briefing: BriefingConfig,
  evidence: BriefingEvidence[]
): string {
  const candidates = evidence
    .map((item) => sanitizeSummary(firstSentence(sanitizeEvidenceText(item.text, briefing.language)), briefing.language))
    .filter((summary) => summary && !isLowInformationSummary(summary))
    .sort((left, right) => summaryInformationScore(right) - summaryInformationScore(left));

  return candidates[0] ?? "";
}

export function buildSummaryPrompt(input: SummaryInput): string {
  const evidenceLines = uniqueEvidenceForSummary(input.evidence)
    .map((item, index) => {
      return `${index + 1}. ${item.sourceTitle} at ${item.postedAt}: ${item.text}`;
    })
    .join("\n");

  const summaryLanguage =
    input.briefing.language === "ar"
      ? "Arabic"
      : input.briefing.language === "fr"
        ? "French"
        : "English";

  return [
    "You write Distilled.news briefing items.",
    "Use only the evidence below.",
    "Use balanced wording.",
    "Only publish when the evidence contains a clear, standalone factual update with concrete informational value.",
    "Do not turn teasers, cliffhangers, headlines that require opening a link, vague reactions, or details-below captions into briefing items.",
    "If the evidence does not contain enough clear information/value to publish, return exactly NO_POST.",
    "If publishing, write one or two concise standalone sentences: state the useful fact, then add only essential evidence-supported context.",
    "Name the actor or subject and its action, decision, event, or measurable change. Do not replace a named subject with generic phrases such as it was announced, reports indicate, or this development.",
    "Do not end mid-word or with an incomplete sentence; if a source appears truncated, summarize only the complete verified facts.",
    "Do not include URLs, social handles, hashtags, emoji markers, or source-channel prefixes.",
    "For Arabic briefings, do not include English translations copied from bilingual source posts.",
    "Do not add political framing labels unless the user's instruction explicitly asks for them.",
    "Do not answer questions or speculate.",
    `Write the summary in ${summaryLanguage}.`,
    `Interest profile: ${input.briefing.interestProfile}`,
    input.briefing.styleInstruction ? `Style instruction: ${input.briefing.styleInstruction}` : "",
    "Evidence:",
    evidenceLines
  ]
    .filter(Boolean)
    .join("\n");
}

export function sanitizeSummary(summary: string, language?: BriefingConfig["language"]): string {
  const cleaned = sanitizeEvidenceText(summary, language);
  if (!cleaned) return "";
  if (isArtifactSummary(cleaned)) return "";
  if (isLowInformationSummary(cleaned)) return "";

  const uniqueSentences: string[] = [];
  const seen = new Set<string>();
  const sentences = cleaned.match(/[^.!?؟]+[.!?؟]?/gu) ?? [cleaned];

  for (const sentence of sentences.map((entry) => entry.trim()).filter(Boolean)) {
    if (isArtifactSentence(sentence) || isLowInformationSummary(sentence)) continue;
    const key = normalizeText(sentence);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueSentences.push(sentence);
  }

  return uniqueSentences.join(" ").trim();
}

export function isArtifactSummary(summary: string): boolean {
  const cleaned = stripSummaryArtifacts(summary);
  if (!cleaned) return true;
  return INVALID_SUMMARY_PATTERNS.some((pattern) => pattern.test(cleaned));
}

export function isLowInformationSummary(summary: string): boolean {
  const cleaned = stripSummaryArtifacts(summary);
  if (!cleaned) return true;
  if (LOW_INFORMATION_SUMMARY_PATTERNS.some((pattern) => pattern.test(cleaned))) return true;
  if (CONTEXT_ONLY_SUMMARY_PATTERNS.some((pattern) => pattern.test(cleaned))) return true;

  const tokens = significantTokens(cleaned);
  const hasInformationSignal = INFORMATION_SIGNAL_PATTERNS.some((pattern) => pattern.test(cleaned));
  if (!hasInformationSignal) return true;
  if (tokens.length <= 2) {
    return true;
  }

  return false;
}

function summaryInformationScore(summary: string): number {
  const cleaned = stripSummaryArtifacts(summary);
  const tokens = significantTokens(cleaned);
  const signalScore = INFORMATION_SIGNAL_PATTERNS.reduce(
    (score, pattern) => score + (pattern.test(cleaned) ? 4 : 0),
    0
  );
  const teaserPenalty = LOW_INFORMATION_SUMMARY_PATTERNS.some((pattern) => pattern.test(cleaned)) ? 12 : 0;
  return tokens.length + signalScore - teaserPenalty;
}

function isArtifactSentence(sentence: string): boolean {
  return ARTIFACT_SENTENCE_PATTERNS.some((pattern) => pattern.test(sentence));
}

export function sanitizeEvidenceText(text: string, language?: BriefingConfig["language"]): string {
  const withoutArtifacts = stripSummaryArtifacts(text);
  const languageCleaned = language === "ar" ? stripLatinTranslationFragments(withoutArtifacts) : withoutArtifacts;
  const punctuationCleaned = language === "ar"
    ? repairArabicSourceObfuscation(languageCleaned).replace(/\s*&\s*/gu, " ")
    : languageCleaned;
  return punctuationCleaned
    .replace(/([\u0600-\u06FF])&(?=\s|[\u0600-\u06FF])/gu, "$1 ")
    .replace(/\s+([,.;:!?؟،])/gu, "$1")
    .replace(/([:؛،,])\s*([.!؟?])/gu, "$2")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .trim();
}

/** Remove publisher-inserted punctuation only when it splits one Arabic word. */
function repairArabicSourceObfuscation(text: string): string {
  return text
    .replace(/([\u0600-\u06FF])(?:ـ|\/){1,3}\s*(?=[\u0600-\u06FF])/gu, "$1")
    .replace(/([\u0600-\u06FF]{2,})\.([\u0600-\u06FF])(?=\s|[،؛.!؟]|$)/gu, "$1$2");
}

function stripSummaryArtifacts(summary: string): string {
  return stripBoilerplateLines(decodeTextEntities(summary))
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu, "")
    .replace(/(?:[,،؛;]\s*)?(?:(?:دون|من دون|بدون)\s+تفاصيل(?:\s+إضافية)?|(?:لم ترد|لا توجد|لا تتوفر)\s+تفاصيل(?:\s+إضافية)?)[^.!؟?]*([.!؟?]|$)/gu, "$1")
    .replace(/(?:[,;]\s*)?(?:with\s+)?(?:no|without)\s+(?:further\s+|additional\s+)?(?:details|information|context)[^.!?]*([.!?]|$)/giu, "$1")
    .replace(/(?:[,;]\s*)?sans\s+(?:autres?\s+|plus\s+de\s+)?détails?[^.!?]*([.!?]|$)/giu, "$1")
    .replace(/\bBREAKING:?\s*/gi, "")
    .replace(/(\p{N})\.\s+(\p{N})/gu, "$1.$2")
    .replace(/https?:\/\/[A-Za-z0-9_-]+\.\s+[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+/gi, " ")
    .replace(/https?:\/\/[^\s]+/gi, " ")
    .replace(/\b(?:t|x|twitter)\s*\.\s*(?:co|com)\/\S+/gi, " ")
    .replace(/\bwww\.\S+/gi, " ")
    .replace(
      /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\s+at\s+\d{1,2}:\d{2}\s?(?:AM|PM)\b/gi,
      " "
    )
    .replace(/#[\p{L}\p{N}_-]+/gu, " ")
    .replace(/@[A-Za-z0-9_]{2,30}/g, " ")
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D\u{1F1E6}-\u{1F1FF}]+/gu, " ")
    .replace(/^\s*[\p{L}\p{N}_ .-]{2,48}\|/u, "")
    .replace(/\s*[ـ_─━—-]{4,}\s*[^.!؟?\n]{0,180}/gu, " ")
    .replace(/\s*(?:قناة\s+)?(?:موقع\s+)?بنت\s+جبيل\s+على\s+واتساب/gu, " ")
    .replace(/^[\s|:؛،,.-]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeTextEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    lrm: "",
    nbsp: " ",
    quot: '"',
    rlm: ""
  };
  let decoded = value;
  for (let pass = 0; pass < 2; pass += 1) {
    decoded = decoded
      .replace(/&([a-z]+);/giu, (match, name: string) => named[name.toLowerCase()] ?? match)
      .replace(/&#(x[0-9a-f]+|\d+);/giu, (match, code: string) => {
        const value = code.toLowerCase().startsWith("x")
          ? Number.parseInt(code.slice(1), 16)
          : Number.parseInt(code, 10);
        if (!Number.isFinite(value) || value <= 0 || value > 0x10ffff) return match;
        return String.fromCodePoint(value);
      });
  }
  return decoded;
}

function stripBoilerplateLines(text: string): string {
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !isBoilerplateLine(line))
    .join(" ");
}

function isBoilerplateLine(line: string): boolean {
  const cleaned = line.replace(/[\sـ_\-–—]+/gu, " ").trim();
  if (!cleaned) return true;
  return [
    /^[ـ_\-–—\s]{4,}$/u,
    /^(?:قناة\s+)?(?:موقع\s+)?بنت\s+جبيل\s+على\s+واتساب/u,
    /\b(?:download telegram|view in telegram|join channel|subscribe)\b/i,
    /\b(?:read more|source|watch)\b/i,
    /^(?:انضم|تابعونا|لمتابعة|للمزيد|للتفاصيل)(?:\s|$)/u
  ].some((pattern) => pattern.test(line) || pattern.test(cleaned));
}

function stripLatinTranslationFragments(text: string): string {
  if (!/[\u0600-\u06FF]/u.test(text)) return text;
  return text
    .replace(/\b[A-Za-z][A-Za-z0-9_'’"(),:;!?./\- ]{2,}(?=\s|$|[.!؟?،])/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueEvidenceForSummary(evidence: BriefingEvidence[]): BriefingEvidence[] {
  const seen = new Set<string>();
  const unique: BriefingEvidence[] = [];

  for (const item of evidence) {
    const key = normalizeText(item.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  return unique.length > 0 ? unique : evidence;
}
