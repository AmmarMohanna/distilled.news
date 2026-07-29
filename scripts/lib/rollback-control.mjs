export function singleFullTrafficVersion(deployment) {
  if (!deployment || typeof deployment !== "object" || Array.isArray(deployment)) {
    throw new Error("Wrangler did not return a current deployment object.");
  }
  const versions = deployment.versions;
  if (!Array.isArray(versions) || versions.length !== 1) {
    throw new Error("Release control requires exactly one currently deployed Worker version.");
  }
  const version = versions[0];
  if (Number(version?.percentage) !== 100) {
    throw new Error("Release control requires the current Worker version to receive 100% of traffic.");
  }
  return {
    versionId: assertVersionId(version.version_id),
    percentage: 100
  };
}

export function plainTextBinding(details, name) {
  const binding = (details?.resources?.bindings ?? []).find((candidate) =>
    candidate?.type === "plain_text" && candidate.name === name
  );
  return binding?.text;
}

export function closedVersionIdentity(details, expectedVersionId) {
  const versionId = assertVersionId(details?.id ?? expectedVersionId);
  if (expectedVersionId && versionId !== expectedVersionId) {
    throw new Error(`Worker version response "${versionId}" does not match "${expectedVersionId}".`);
  }
  if (plainTextBinding(details, "REGISTRATION_MODE") !== "closed") {
    throw new Error(`Worker version ${versionId} is not a closed-registration rollback target.`);
  }
  const releaseSha = plainTextBinding(details, "RELEASE_SHA");
  if (!/^[a-f0-9]{40,64}$/i.test(releaseSha ?? "")) {
    throw new Error(`Worker version ${versionId} does not carry a full RELEASE_SHA.`);
  }
  return {
    versionId,
    releaseSha,
    createdOn: details?.metadata?.created_on ?? null
  };
}

export function validateRollbackBaseline(baseline, expected) {
  if (!baseline || typeof baseline !== "object" || Array.isArray(baseline)) {
    throw new Error("Rollback baseline evidence is not an object.");
  }
  if (baseline.schemaVersion !== 1) {
    throw new Error(`Unsupported rollback baseline schema "${baseline.schemaVersion}".`);
  }
  if (baseline.environment !== expected.environment) {
    throw new Error(
      `Rollback baseline environment "${baseline.environment}" does not match "${expected.environment}".`
    );
  }
  if (baseline.workerName !== expected.workerName) {
    throw new Error(
      `Rollback baseline Worker "${baseline.workerName}" does not match "${expected.workerName}".`
    );
  }
  if (baseline.baseUrl !== expected.baseUrl) {
    throw new Error(
      `Rollback baseline URL "${baseline.baseUrl}" does not match "${expected.baseUrl}".`
    );
  }
  if (baseline.registrationMode !== "closed" || baseline.d1RegistrationEnabled !== false) {
    throw new Error("Rollback baseline evidence does not prove both registration gates were closed.");
  }
  if (!/^[a-f0-9]{40,64}$/i.test(baseline.releaseSha ?? "")) {
    throw new Error("Rollback baseline evidence does not contain a full release SHA.");
  }
  return {
    ...baseline,
    versionId: assertVersionId(baseline.versionId)
  };
}

export function assertVersionId(value) {
  const normalized = String(value ?? "").trim();
  if (!/^[a-z0-9][a-z0-9._:-]{7,199}$/i.test(normalized)) {
    throw new Error(`Invalid Worker version ID "${normalized || "missing"}".`);
  }
  return normalized;
}

export function rollbackConfirmation(environment, versionId) {
  return `distilled-news:${environment}:rollback:${assertVersionId(versionId)}`;
}
