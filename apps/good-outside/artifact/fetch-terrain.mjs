// Downloads the elevation tiles the hillshade layers need (AWS Terrain Tiles, Tilezen terrarium
// encoding) into .cache/terrain/, checked against the SHA-256 list in terrain-tiles.json.
// `--record` writes that list from a fresh download. Behind an HTTPS proxy, run with NODE_USE_ENV_PROXY=1.
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {plan,tilesOf,tileUrl} from './terrain-plan.mjs';
const here=new URL('./',import.meta.url),record=process.argv.includes('--record');
const manifestUrl=new URL('terrain-tiles.json',here);
const manifest=record?{}:JSON.parse(await readFile(manifestUrl,'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const tiles=[...new Map(plan().flatMap(tilesOf).map(t=>[t.join('/'),t])).values()];
let fetched=0;
const one=async([z,x,y])=>{
 const key=`${z}/${x}/${y}`,dest=new URL(`.cache/terrain/${key}.png`,here);
 if(!record){try{if(sha(await readFile(dest))===manifest[key])return}catch{}if(!manifest[key])throw Error('Tile not in terrain-tiles.json: '+key)}
 const res=await fetch(tileUrl(z,x,y),{redirect:'error',signal:AbortSignal.timeout(60000)});if(!res.ok)throw Error(`${key}: HTTP ${res.status}`);
 const body=Buffer.from(await res.arrayBuffer());
 if(record)manifest[key]=sha(body);else if(sha(body)!==manifest[key])throw Error(key+': checksum mismatch');
 await mkdir(new URL('.',dest),{recursive:true});await writeFile(new URL(dest.href+'.part'),body);await rename(new URL(dest.href+'.part'),dest);fetched++;
};
// A few downloads at a time.
const queue=[...tiles];await Promise.all(Array.from({length:6},async()=>{while(queue.length)await one(queue.shift())}));
if(record)await writeFile(manifestUrl,JSON.stringify(Object.fromEntries(Object.entries(manifest).sort()),null,0)+'\n');
console.log(`Terrain tiles verified: ${tiles.length} (${fetched} downloaded)${record?', manifest recorded':''}.`);
