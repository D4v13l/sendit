import {readFile} from 'node:fs/promises';
import {validateManifest,verifySnapshot} from './snapshots.mjs';
// Input: {uploads:{provider:presignedPutUrl}}. URLs are credentials; never log them.
let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>100000)throw Error('Input too large');}
const {uploads}=JSON.parse(input);
const manifest=validateManifest(JSON.parse(await readFile(new URL('../data/snapshots.json',import.meta.url),'utf8')));
const payload=[];
for(const p of manifest.providers){const url=new URL(uploads?.[p.provider]);if(url.protocol!=='https:')throw Error('HTTPS required');const bytes=await readFile(new URL('../apps/good-outside/data/'+p.provider+'.json.gz',import.meta.url));verifySnapshot(bytes,p);payload.push({p,url,bytes});}
for(const {p,url,bytes} of payload){let response;try{response=await fetch(url,{method:'PUT',body:bytes,redirect:'error',signal:AbortSignal.timeout(120000)});}catch{throw Error('Upload connection failed: '+p.provider);}if(!response.ok)throw Error('Upload failed: '+p.provider+' HTTP '+response.status);console.log('Uploaded '+p.key);}
console.log('Verify downloads through your bucket read URL before publishing baseUrl in the manifest.');
