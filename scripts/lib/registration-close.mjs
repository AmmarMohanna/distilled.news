export function planEmergencyRegistrationClose({
  currentVersionId,
  currentMode,
  currentReleaseSha,
  candidates,
  pinnedLegacyVersionId
}) {
  if (currentMode === "closed") {
    return {
      kind: "hardened",
      liveReleaseSha: requireReleaseSha(currentReleaseSha),
      rollbackVersionId: null,
      closedVersionId: currentVersionId
    };
  }
  if (currentMode === "open") {
    const liveReleaseSha = requireReleaseSha(currentReleaseSha);
    const closed = candidates.find((candidate) =>
      candidate.versionId !== currentVersionId &&
      candidate.releaseSha === liveReleaseSha &&
      candidate.registrationMode === "closed"
    );
    if (!closed) {
      throw new Error("No same-live-SHA closed registration version is available for emergency rollback.");
    }
    return {
      kind: "hardened",
      liveReleaseSha,
      rollbackVersionId: closed.versionId,
      closedVersionId: closed.versionId
    };
  }
  if (
    currentMode === undefined &&
    currentReleaseSha === undefined &&
    currentVersionId === pinnedLegacyVersionId
  ) {
    return {
      kind: "pinned-legacy",
      liveReleaseSha: null,
      rollbackVersionId: null,
      closedVersionId: currentVersionId
    };
  }
  throw new Error("Current production version has no recognized emergency-close contract.");
}

export function acceptEmergencyHttpClosure(result) {
  if (result === "closed" || result === "unavailable") return true;
  throw new Error("Live HTTP endpoints contradict the control-plane closed-registration state.");
}

function requireReleaseSha(value) {
  if (!/^[a-f0-9]{40,64}$/i.test(value ?? "")) {
    throw new Error("Live Worker version does not carry a full RELEASE_SHA.");
  }
  return value;
}
