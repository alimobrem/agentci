/** Lossless conversion of the contract keywords used here to OpenAPI 3.0 schemas. */
export function evalOpenApiSchema(value:unknown):any {
  if(value===false)return {not:{}};
  if(value===true)return {};
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).filter(([key,item])=>!['$schema','$id'].includes(key)&&!(key==='required'&&Array.isArray(item)&&!item.length)).map(([key,item])=>{
    if(key==='const')return ['enum',[item]];
    if(key==='properties')return [key,Object.fromEntries(Object.entries(item as object).map(([name,schema])=>[name,evalOpenApiSchema(schema)]))];
    if(['oneOf','anyOf','allOf'].includes(key))return [key,(item as unknown[]).map(evalOpenApiSchema)];
    if(['items','not'].includes(key)||(key==='additionalProperties'&&typeof item==='object'))return [key,evalOpenApiSchema(item)];
    return [key,structuredClone(item)];
  }));
}
