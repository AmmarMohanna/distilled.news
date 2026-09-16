export function buildAuthenticatedProfileProvisioningRequest(accountId,username,password){
  return {tenantId:accountId,ownerId:accountId,site:"x",username,password};
}
