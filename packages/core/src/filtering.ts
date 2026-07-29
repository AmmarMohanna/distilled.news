import type { BriefingConfig, NormalizedMessage, SuppressedMessage } from "./types";
import { eventTokens, jaccardSimilarity, normalizeEventText, normalizeText, significantTokens } from "./text";

const RUMOR_PATTERNS = [
  /\brumou?rs?\b/i,
  /\bunconfirmed\b/i,
  /\breportedly\b/i,
  /\bsources claim\b/i,
  /\bnot verified\b/i,
  /\brumeur(?:s)?\b/iu,
  /(?:^|[^\p{L}\p{N}_])non confirm(?:é|ée|és|ées)(?=$|[^\p{L}\p{N}_])/iu
];

const PREDICTION_PATTERNS = [
  /\bi think\b/i,
  /\bwhat if\b/i,
  /\bwill probably\b/i,
  /\bcould happen\b/i,
  /\bmay happen\b/i,
  /\bmy prediction\b/i,
  /\bexpected to\b/i,
  /\bje pense\b/iu,
  /(?:^|[^\p{L}\p{N}_])(?:pourrait|devrait|probablement)(?=$|[^\p{L}\p{N}_])/iu
];

const POLITICAL_SPEECH_PATTERNS = [
  /\bsaid\b/i,
  /\bstated\b/i,
  /\bdeclared\b/i,
  /\bcalled for\b/i,
  /\bcondemned\b/i,
  /\bwarned\b/i,
  /(?:^|[^\p{L}\p{N}_])(?:a |ont )?(?:déclaré|affirmé|appelé à|condamné|averti)(?=$|[^\p{L}\p{N}_])/iu
];

const FACT_PATTERNS = [
  /\b(deploy|deployed|strike|strikes|hit|killed|injured|arrested|closed|opened|approved|authorized|cleared|signed|launched|released|introduced|adds?|added|resumed|halted|ended|expired|renewed|cancell?ed|evacuated|entered|left|announced)\b/i,
  /\b\d+([.,]\d+)?\b/,
  /\b(percent|%|usd|dollar|lira|euro|km|people|soldiers|civilians|hours|minutes)\b/i,
  /(?:^|[^\p{L}\p{N}_])(?:a |ont )?(?:déployé|frappé|tué|blessé|arrêté|fermé|ouvert|approuvé|autorisé|signé|lancé|publié|introduit|ajouté|repris|suspendu|terminé|expiré|renouvelé|annulé|évacué|annoncé)(?=$|[^\p{L}\p{N}_])/iu,
  /(?:^|[^\p{L}\p{N}_])(?:pour\s*cent|personnes?|soldats?|civils?|heures?|minutes?)(?=$|[^\p{L}\p{N}_])/iu,
  /(?:أعلن|اعلن|أكد|اكد|أفاد|افاد|وقّع|وقع|سيوقع|قتل|استشهد|أصيب|اصيب|جرح|اعتقل|أقر|اقر|وافق|افتتح|أغلق|اغلق|استهدف|قصف|غارة|غاره|انفجار|تفجير|فجّر|فجر|نفّذ|نفذ|تنفيذ|دمّر|دمر|اعترض|إسقاط|اسقاط|انسحب|انسحاب|بدأ|بدا|استأنف|استانف|قطع|أوقف|اوقف|علّق|علق|أطلق|اطلق|إطلاق|اطلاق|ألقى|القى|تلقي|قنبلة|مسيّرة|مسيرة|جريح|جريحين|جريحان|جرحى|قتيل|قتلى)/u
];

const IMPORTANT_PATTERNS = [
  /\b(minister|official|government|army|police|court|central bank|reuters|associated press|ap news|afp)\b/i,
  /\b(killed|injured|casualties|strike|missile|explosion|evacuated|closed|halted|resumed|cut all contact|sanction|approved|signed|announced)\b/i,
  /\b(currency|central bank|lira|dollar|euro|inflation|fuel|electricity|power|water|airport|port|border)\b/i,
  /(?:^|[^\p{L}\p{N}_])(?:ministre|gouvernement|armée|police|tribunal|banque centrale|agence france-presse|afp|reuters)(?=$|[^\p{L}\p{N}_])/iu,
  /(?:^|[^\p{L}\p{N}_])(?:tué|blessé|frappe|missile|explosion|évacué|fermé|suspendu|repris|sanction|approuvé|signé|annoncé)(?=$|[^\p{L}\p{N}_])/iu,
  /(?:^|[^\p{L}\p{N}_])(?:monnaie|inflation|carburant|électricité|eau|aéroport|port|frontière)(?=$|[^\p{L}\p{N}_])/iu,
  /(?:وزير|مسؤول|الحكومة|الجيش|الشرطة|قوى الامن|مصرف لبنان|رويترز|فرانس برس)/u,
  /(?:قتل|قتيل|قتلى|استشهد|شهيد|شهداء|جرح|جريح|جرحى|أصيب|اصيب|غارة|قصف|انفجار|إخلاء|اخلاء|اغلاق|أغلق|قطع|عقوبات|وقّع|وقع|أعلن|اعلن|أكد|اكد|استهداف|قنبلة|مسيّرة|مسيرة|انسحاب)/u,
  /(?:كهرباء|مياه|مطار|مرفأ|حدود|دولار|ليرة|مصرف|وقود)/u
];

const FLUFF_PATTERNS = [
  /\bbreaking\b/i,
  /\bstay tuned\b/i,
  /\bwatch now\b/i,
  /\byou won't believe\b/i,
  /\bshocking\b/i,
  /\bmust watch\b/i,
  /\b(?:à suivre|regardez maintenant|vous n'allez pas croire|incroyable)\b/iu,
  /آخر تصريحات/u,
  /شاهد(?:وا)?/u,
  /للمزيد/u,
  /للتفاصيل/u,
  /التفاصيل/u
];

const NO_UPDATE_PATTERNS = [
  /\bno new (developments?|updates?)\b/i,
  /\bno new verified information\b/i,
  /\bnothing new to report\b/i,
  /\bno major regional events\b/i,
  /\baucun(?:e)? (?:nouveau|nouvelle) (?:développement|mise à jour|information)\b/iu,
  /\brien de nouveau à signaler\b/iu
];

export function isRelevantToInterest(message: NormalizedMessage, briefing: BriefingConfig): boolean {
  if (isLebanonScopedBriefing(briefing) && !hasLebanonAnchor(message)) return false;
  const profileTokens = expandInterestTokens(significantTokens(briefing.interestProfile));
  if (profileTokens.length === 0) return true;

  const messageTokens = expandInterestTokens(significantTokens(message.text));
  const overlap = profileTokens.filter((token) => messageTokens.includes(token));

  if (overlap.length > 0) return true;

  const profile = normalizeText(briefing.interestProfile);
  const text = normalizeText(message.text);

  return profileTokens.some((token) => text.includes(token)) || text.includes(profile);
}

function isLebanonScopedBriefing(briefing: BriefingConfig): boolean {
  return /\b(?:lebanon|lebanese|liban|libanais|libanaise)\b|(?:لبنان|لبناني|لبنانية)/iu.test(
    `${briefing.title} ${briefing.interestProfile}`
  );
}

function hasLebanonAnchor(message: NormalizedMessage): boolean {
  const text = message.text;
  return /\b(?:lebanon|lebanese|liban|libanais|libanaise|beirut|tripoli|sidon|tyre|nabatieh|baalbek|bint\s*jbeil|south\s+lebanon|hezbollah|unifil|litani)\b/iu.test(text) ||
    /(?:لبنان|لبناني|لبنانية|بيروت|طرابلس|صيدا|صور|النبطية|بعلبك|بنت\s*جبيل|الجنوب(?:\s+اللبناني)?|جنوب\s+لبنان|حزب\s*الله|اليونيفيل|الليطاني|الجيش\s+اللبناني|رئاسة\s+الجمهورية)/u.test(text);
}

function expandInterestTokens(tokens: string[]): string[] {
  const expanded = new Set(tokens);
  const synonyms: Record<string, string[]> = {
    lebanese: ["lebanon", "liban", "beirut", "south", "لبنان", "لبناني", "بيروت", "الجنوب", "جنوب", "النبطية", "صيدا", "صور", "طرابلس", "بعلبك"],
    lebanon: ["lebanese", "liban", "beirut", "south", "لبنان", "لبناني", "بيروت", "الجنوب", "جنوب", "النبطية", "صيدا", "صور", "طرابلس", "بعلبك"],
    liban: ["lebanon", "lebanese", "لبنان", "لبناني", "بيروت", "الجنوب", "النبطية"],
    beirut: ["lebanon", "lebanese", "بيروت", "لبنان"],
    economy: ["economic", "currency", "bank", "lira", "dollar", "economy", "اقتصاد", "اقتصادي", "عملة", "بنك", "مصرف", "ليرة", "دولار", "نفط", "برنت"],
    infrastructure: [
      "power",
      "electricity",
      "water",
      "internet",
      "road",
      "airport",
      "port",
      "كهرباء",
      "مياه",
      "انترنت",
      "طريق",
      "أوتوستراد",
      "بنية",
      "تحتية",
      "مطار",
      "مرفأ"
    ],
    security: [
      "army",
      "border",
      "strike",
      "safety",
      "incident",
      "security",
      "أمن",
      "أمني",
      "الجيش",
      "حدود",
      "غارة",
      "ضربة",
      "حادث",
      "تصادم",
      "جريح",
      "جريحان",
      "قتيل",
      "قتلى",
      "إصابة"
    ],
    public: ["public", "civil", "مدني", "عام", "عامة"],
    safety: ["safety", "incident", "accident", "injury", "أمن", "سلامة", "حادث", "تصادم", "إصابة", "جريح", "جريحان"],
    regional: ["regional", "region", "middleeast", "iran", "syria", "israel", "إقليمي", "المنطقة", "إيران", "إيراني", "سوريا", "إسرائيل", "أميركي", "الولايات"],
    events: ["event", "events", "developments", "تطور", "تطورات", "حدث", "أحداث"],
    لبنان: ["lebanon", "lebanese", "liban", "beirut", "south", "لبناني", "بيروت", "الجنوب", "جنوب", "النبطية", "صيدا", "صور", "طرابلس", "بعلبك", "بنت", "جبيل"],
    لبناني: ["lebanon", "lebanese", "لبنان", "بيروت", "الجنوب", "النبطية", "بنت", "جبيل"],
    بيروت: ["beirut", "lebanon", "lebanese", "لبنان"],
    اقتصاد: ["economy", "economic", "currency", "bank", "lira", "dollar", "اقتصادي", "عملة", "بنك", "مصرف", "ليرة", "دولار"],
    امني: ["security", "safety", "incident", "army", "border", "امن", "جيش", "حادث", "غارة", "ضربة"],
    امن: ["security", "safety", "incident", "army", "border", "امني", "جيش", "حادث", "غارة", "ضربة"],
    بنية: ["infrastructure", "power", "electricity", "water", "internet", "road", "airport", "port", "تحتية", "كهرباء", "مياه", "طريق", "مطار", "مرفأ"],
    تحتيه: ["infrastructure", "power", "electricity", "water", "internet", "road", "airport", "port", "بنية", "كهرباء", "مياه", "طريق", "مطار", "مرفأ"],
    اقليمي: ["regional", "region", "middleeast", "iran", "syria", "israel", "المنطقة", "ايران", "ايراني", "سوريا", "اسرائيل", "اميركي"]
  };

  for (const token of tokens) {
    const canonical = canonicalInterestToken(token);
    expanded.add(canonical);
    for (const synonym of synonyms[canonical] ?? []) {
      expanded.add(canonicalInterestToken(synonym));
    }
  }

  return Array.from(expanded);
}

/** Normalize the limited Arabic morphology that matters for topic matching. */
function canonicalInterestToken(token: string): string {
  if (!/[\u0600-\u06FF]/u.test(token)) return token;
  const normalized = token
    .normalize("NFKD")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/gu, "")
    .replace(/ـ/gu, "")
    .replace(/[أإآٱ]/gu, "ا")
    .replace(/ى/gu, "ي")
    .replace(/ة$/u, "")
    .replace(/^ال(?=\p{L}{3,}$)/u, "");
  return normalized;
}

export function classifyNoise(message: NormalizedMessage): SuppressedMessage | null {
  const text = message.text.trim();
  if (!text) {
    return {
      messageId: message.id,
      reason: "empty",
      detail: "Message has no supported text or caption."
    };
  }

  if (RUMOR_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      messageId: message.id,
      reason: "rumor",
      detail: "Message appears to be unverified or rumor-based."
    };
  }

  const concreteFact = hasConcreteFact(text);

  if (FLUFF_PATTERNS.some((pattern) => pattern.test(text)) && text.length < 180 && (!concreteFact || isDanglingDetailsTeaser(text))) {
    return {
      messageId: message.id,
      reason: "fluff",
      detail: "Message looks like engagement-oriented filler."
    };
  }

  const hasPrediction = PREDICTION_PATTERNS.some((pattern) => pattern.test(text));
  const authoritySignal = hasAuthoritySignal(text);
  if (hasPrediction && !authoritySignal) {
    return {
      messageId: message.id,
      reason: "non_authoritative_prediction",
      detail: "Prediction is not tied to an authoritative source."
    };
  }

  const politicalSpeech = POLITICAL_SPEECH_PATTERNS.some((pattern) => pattern.test(text));
  if (politicalSpeech && !concreteFact) {
    return {
      messageId: message.id,
      reason: "political_statement_without_new_facts",
      detail: "Statement does not add concrete facts."
    };
  }

  if (NO_UPDATE_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      messageId: message.id,
      reason: "repeated_update",
      detail: "Message says there is no meaningful new development."
    };
  }

  return null;
}

function isDanglingDetailsTeaser(text: string): boolean {
  return /(?:إذا|اذا|لو|هل|ماذا|لماذا|كيف|[.؟?]{2,}|…|\|).{0,100}(?:للتفاصيل|للمزيد)/u.test(text);
}

export function hasConcreteFact(text: string): boolean {
  return FACT_PATTERNS.some((pattern) => pattern.test(text));
}

export function hasAuthoritySignal(text: string): boolean {
  return /\bminister|agency|central bank|army|police|court|company|official|government|reuters|associated press|ap news|afp\b/i.test(text) ||
    /(?:^|[^\p{L}\p{N}_])(?:ministre|agence|banque centrale|armée|police|tribunal|entreprise|responsable|gouvernement|reuters|afp)(?=$|[^\p{L}\p{N}_])/iu.test(text) ||
    /(?:وزير|وكالة|مصرف لبنان|الجيش|الشرطة|قوى الامن|محكمة|شركة|مسؤول|الحكومة|رويترز|فرانس برس)/u.test(text);
}

export function hasImportantSignal(text: string): boolean {
  return IMPORTANT_PATTERNS.some((pattern) => pattern.test(text));
}

export function isImportantToInterest(message: NormalizedMessage, briefing: BriefingConfig): boolean {
  if (!hasConcreteFact(message.text) || !hasImportantSignal(message.text)) return false;
  return isRelevantToInterest(message, briefing);
}

export function isImportantReviewCandidate(message: NormalizedMessage, briefing: BriefingConfig): boolean {
  if (!hasConcreteFact(message.text) && !hasImportantSignal(message.text)) return false;
  return isRelevantToInterest(message, briefing);
}

export function findDuplicate(
  message: NormalizedMessage,
  acceptedMessages: NormalizedMessage[]
): NormalizedMessage | undefined {
  const normalized = normalizeText(message.text);
  if (!normalized) return undefined;
  const eventNormalized = normalizeEventText(message.text);
  const tokens = eventTokens(message.text);

  return acceptedMessages.find((candidate) => {
    if (normalizeText(candidate.text) === normalized) return true;
    if (normalizeEventText(candidate.text) === eventNormalized) return true;
    const similarity = Math.max(
      jaccardSimilarity(significantTokens(candidate.text), significantTokens(message.text)),
      jaccardSimilarity(eventTokens(candidate.text), tokens)
    );
    return similarity >= 0.92;
  });
}

function interestOverlap(text: string, interestProfile: string): number {
  const profileTokens = expandInterestTokens(significantTokens(interestProfile));
  if (profileTokens.length === 0) return 1;
  const messageTokens = new Set(expandInterestTokens(significantTokens(text)));
  return profileTokens.filter((token) => messageTokens.has(token)).length;
}
