import versions from "./legal-versions.json";

export const HOSTED_LEGAL_VERSIONS = Object.freeze({
  terms: versions.terms,
  privacy: versions.privacy,
  acceptableUse: versions.acceptableUse
});

export type HostedLegalVersions = typeof HOSTED_LEGAL_VERSIONS;
