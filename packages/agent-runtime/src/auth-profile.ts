export type AuthOperationClass = "public_read" | "authenticated_read";

export interface AuthProfile {
  id: string;
  tenantId: string;
  ownerId: string;
  encryptedBrowserStateRef: string;
  allowedDomains: string[];
  allowedOperationClass: AuthOperationClass;
  version: number;
  expiresAt: string;
  revokedAt?: string;
}

export interface AuthProfileCapability {
  profileId: string;
  tenantId: string;
  allowedDomains: string[];
  allowedOperationClass: AuthOperationClass;
  version: number;
  expiresAt: string;
}

export function projectAuthProfileForModel(profile: AuthProfile): AuthProfileCapability {
  return {
    profileId: profile.id,
    tenantId: profile.tenantId,
    allowedDomains: [...profile.allowedDomains],
    allowedOperationClass: profile.allowedOperationClass,
    version: profile.version,
    expiresAt: profile.expiresAt
  };
}

export function assertAuthProfileUsable(profile: AuthProfile, input: {
  tenantId: string;
  domain: string;
  operationClass: AuthOperationClass;
  now?: string;
}): void {
  const now = input.now ?? new Date().toISOString();
  if (profile.tenantId !== input.tenantId) throw new Error("auth profile tenant mismatch");
  if (profile.revokedAt) throw new Error("auth profile revoked");
  if (profile.expiresAt <= now) throw new Error("auth profile expired");
  if (profile.allowedOperationClass !== input.operationClass) throw new Error("auth profile operation class denied");
  if (!profile.allowedDomains.includes(input.domain)) throw new Error("auth profile domain denied");
}
