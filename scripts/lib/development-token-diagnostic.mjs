// Deliberately exclude raw API data, names, strings and credentials from evidence.
export function redactedRepositoryCapability(data){
 const permissions=data?.permissions;
 const permissionsObject=permissions!==null&&typeof permissions==='object'&&!Array.isArray(permissions);
 const pushFieldPresent=permissionsObject&&Object.hasOwn(permissions,'push');
 const push=pushFieldPresent?permissions.push:undefined;
 return {permissionsObject,pushFieldPresent,pushType:pushFieldPresent?(push===null?'null':typeof push):'absent',pushBoolean:typeof push==='boolean'?push:null,repositoryMatches:data?.full_name==='alimobrem/agentci'};
}
// Classification is a client heuristic, not a server capability attestation.
// Never return credential bytes, prefixes, digests or arbitrary auth strings.
export function redactedAuthentication(authentication,injectedToken){
 const tokenPresent=typeof authentication?.token==='string'&&authentication.token.length>0;
 return {
  authType:authentication?.type==='token'?'token':authentication?.type==null?null:'unknown',
  authTokenType:['installation','app','oauth','user-to-server'].includes(authentication?.tokenType)?authentication.tokenType:authentication?.tokenType==null?null:'unknown',
  tokenPresent,
  tokenMatches:tokenPresent&&typeof injectedToken==='string'&&injectedToken.length>0&&authentication.token===injectedToken
 };
}
