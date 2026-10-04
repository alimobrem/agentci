/** Explicit operator engine connection fields only; never forward controller/App credentials. */
export function containerOperatorEnvironment(env:NodeJS.ProcessEnv=process.env):NodeJS.ProcessEnv{
  return Object.fromEntries(['PATH','AGENTCI_CONTAINER_ENGINE','CONTAINER_HOST','CONTAINER_CONNECTION','CONTAINERS_CONF','XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_RUNTIME_DIR'].filter(key=>env[key]!==undefined).map(key=>[key,env[key]!])) as NodeJS.ProcessEnv;
}
