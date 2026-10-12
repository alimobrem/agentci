// Deliberately exclude raw API data, names, strings and credentials from evidence.
export function redactedRepositoryCapability(data){
 const permissions=data?.permissions;
 const permissionsObject=permissions!==null&&typeof permissions==='object'&&!Array.isArray(permissions);
 const pushFieldPresent=permissionsObject&&Object.hasOwn(permissions,'push');
 const push=pushFieldPresent?permissions.push:undefined;
 return {permissionsObject,pushFieldPresent,pushType:pushFieldPresent?(push===null?'null':typeof push):'absent',pushBoolean:typeof push==='boolean'?push:null,repositoryMatches:data?.full_name==='alimobrem/agentci'};
}
