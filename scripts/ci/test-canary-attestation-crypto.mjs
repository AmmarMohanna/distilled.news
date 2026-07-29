#!/usr/bin/env node

import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  signAttestationPayload,
  verifyAttestationPayload
} from "../canary/attestation-crypto.mjs";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const encodedPrivateKey = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
const encodedPublicKey = publicKey.export({ format: "der", type: "spki" }).toString("base64");
const payload = "same-sha-canary-payload";
const signature = signAttestationPayload(payload, encodedPrivateKey);

assert.equal(verifyAttestationPayload(payload, signature, encodedPublicKey), true);
assert.equal(verifyAttestationPayload(`${payload}-tampered`, signature, encodedPublicKey), false);
const tamperedSignature = `${signature.slice(0, -1)}${signature.endsWith("A") ? "B" : "A"}`;
assert.equal(
  verifyAttestationPayload(payload, tamperedSignature, encodedPublicKey),
  false
);
assert.throws(
  () => signAttestationPayload(payload, encodedPublicKey),
  /private|PKCS8|DECODER|asn1|wrong tag/i
);

const other = generateKeyPairSync("ed25519");
const otherPublicKey = other.publicKey.export({ format: "der", type: "spki" }).toString("base64");
assert.equal(verifyAttestationPayload(payload, signature, otherPublicKey), false);

console.log("Canary asymmetric attestation checks passed.");
