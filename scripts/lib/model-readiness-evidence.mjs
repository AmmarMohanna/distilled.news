const SHA256_HEX = /^[a-f0-9]{64}$/;

export function assertModelReadinessEvidence(
  evidence,
  { now = Date.now(), maximumAgeMs = 5 * 60 * 1000 } = {}
) {
  const attempted = evidence?.attempted === true;
  const cached = evidence?.cached === true;
  const validatedAt = typeof evidence?.validatedAt === "string"
    ? Date.parse(evidence.validatedAt)
    : Number.NaN;
  const recent = Number.isFinite(validatedAt) &&
    validatedAt <= now &&
    now - validatedAt <= maximumAgeMs;
  if (
    evidence?.succeeded !== true ||
    attempted === cached ||
    !recent ||
    !SHA256_HEX.test(evidence?.inputFingerprint ?? "") ||
    !SHA256_HEX.test(evidence?.outputFingerprint ?? "") ||
    typeof evidence?.model !== "string" ||
    evidence.model.trim().length === 0
  ) {
    throw new Error("Fixed-input model readiness evidence is missing or invalid.");
  }
}
