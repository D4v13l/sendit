// Downloads the pinned Natural Earth layers listed in data-sources.json into .cache/,
// verifying size and SHA-256 before keeping each file. Run before `npm run build`.
// Behind an HTTPS proxy, run with NODE_USE_ENV_PROXY=1 (Node 22.21+).
import {readFile,writeFile,mkdir,rename,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const here=new URL('./',import.meta.url),cache=new URL('.cache/',here);
const sources=JSON.parse(await readFile(new URL('data-sources.json',here),'utf8'));
await mkdir(cache,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const [name,{bytes,sha256}] of Object.entries(sources.files)){
 const dest=new URL(name,cache);
 try{if((await stat(dest)).size===bytes&&sha(await readFile(dest))===sha256)continue}catch{}
 const url=`https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${sources.commit}/geojson/${name}`;
 const res=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(120000)});if(!res.ok)throw Error(`${name}: HTTP ${res.status}`);
 const body=Buffer.from(await res.arrayBuffer());
 if(body.length!==bytes||sha(body)!==sha256)throw Error(`${name}: size or checksum mismatch`);
 await writeFile(new URL(name+'.part',cache),body);await rename(new URL(name+'.part',cache),dest);
 console.log('Fetched',name);
}
console.log(`Natural Earth layers verified (${Object.keys(sources.files).length} files, commit ${sources.commit.slice(0,7)}).`);
