import {readFile,writeFile,mkdir,rename,rm,mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateManifest,verifySnapshot} from './snapshots.mjs';
const root=new URL('../',import.meta.url);
const m=validateManifest(JSON.parse(await readFile(new URL('data/snapshots.json',root),'utf8')));
const base=process.env.SENDIT_SNAPSHOT_BASE_URL||m.baseUrl;
if(!base)throw Error('Set SENDIT_SNAPSHOT_BASE_URL to your snapshot bucket HTTPS URL; storage publication is not configured.');
const url=new URL(base.endsWith('/')?base:base+'/');if(url.protocol!=='https:')throw Error('Snapshot downloads require HTTPS');
const dest=fileURLToPath(new URL('apps/good-outside/data/',root));await mkdir(dest,{recursive:true});
const staging=await mkdtemp(join(dest,'.download-'));
try{
 for(const p of m.providers){
  const response=await fetch(new URL(p.key,url),{redirect:'error',signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw Error(`Download failed for ${p.provider}: HTTP ${response.status}`);
  let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>p.bytes)throw Error('Download exceeds manifest size');chunks.push(chunk);}
  const bytes=Buffer.concat(chunks);const raw=verifySnapshot(bytes,p);
  await writeFile(join(staging,p.provider+'.json'),raw);await writeFile(join(staging,p.provider+'.json.gz'),bytes);
 }
 // Validate the whole release before replacing any provider file.
 for(const p of m.providers)for(const ext of ['.json','.json.gz'])await rename(join(staging,p.provider+ext),join(dest,p.provider+ext));
 console.log(`Downloaded and verified ${m.providers.reduce((s,p)=>s+p.count,0)} records (${m.release}).`);
}finally{await rm(staging,{recursive:true,force:true});}
