import {mkdir,lstat} from 'node:fs/promises';
/** The operator supplies a bounded writable mount; the client directory itself stays private to this UID. */
export async function prepareContainerClientRuntime(directory=process.env.XDG_RUNTIME_DIR):Promise<void>{
  if(!directory)return;
  if(!directory.startsWith('/')||/[\r\n\0]/.test(directory))throw new Error('Invalid operator client runtime directory');
  await mkdir(directory,{recursive:true,mode:0o700});
  const metadata=await lstat(directory);
  if(!metadata.isDirectory()||metadata.isSymbolicLink()||(metadata.mode&0o077)||metadata.uid!==process.getuid?.())throw new Error('Container client runtime must be a private owned directory');
}
