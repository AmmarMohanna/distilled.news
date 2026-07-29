import {
  createPrivateKey,
  createPublicKey,
  sign,
  verify
} from "node:crypto";

export function signAttestationPayload(payload, encodedPrivateKey) {
  if (typeof payload !== "string" || !payload) {
    throw new Error("Canary attestation payload is required.");
  }
  const privateKey = createPrivateKey({
    key: decodeCanonicalBase64(encodedPrivateKey, "CANARY_ATTESTATION_PRIVATE_KEY"),
    format: "der",
    type: "pkcs8"
  });
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("CANARY_ATTESTATION_PRIVATE_KEY must be an Ed25519 PKCS8 key.");
  }
  return sign(null, Buffer.from(payload), privateKey).toString("base64url");
}

export function verifyAttestationPayload(payload, signature, encodedPublicKey) {
  if (typeof payload !== "string" || !payload || typeof signature !== "string" || !signature) {
    return false;
  }
  let publicKey;
  let signatureBytes;
  try {
    publicKey = createPublicKey({
      key: decodeCanonicalBase64(encodedPublicKey, "CANARY_ATTESTATION_PUBLIC_KEY"),
      format: "der",
      type: "spki"
    });
    signatureBytes = Buffer.from(signature, "base64url");
  } catch {
    return false;
  }
  if (
    publicKey.asymmetricKeyType !== "ed25519" ||
    signatureBytes.length !== 64 ||
    signatureBytes.toString("base64url") !== signature
  ) {
    return false;
  }
  return verify(null, Buffer.from(payload), publicKey, signatureBytes);
}

function decodeCanonicalBase64(value, label) {
  if (typeof value !== "string" || !value) throw new Error(`${label} is required.`);
  const decoded = Buffer.from(value, "base64");
  if (decoded.length === 0 || decoded.toString("base64") !== value) {
    throw new Error(`${label} must be canonical base64-encoded DER.`);
  }
  return decoded;
}
