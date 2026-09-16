import assert from "node:assert/strict";
import test from "node:test";
import { buildAuthenticatedProfileProvisioningRequest } from "./authenticated-profile-provisioning.mjs";

test("derives tenant and owner from the one account identifier",()=>{
  assert.deepEqual(buildAuthenticatedProfileProvisioningRequest("account-1","x-user","x-password"),{
    tenantId:"account-1",
    ownerId:"account-1",
    site:"x",
    username:"x-user",
    password:"x-password"
  });
});
