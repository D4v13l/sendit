import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {normalizeSki,normalizeOpenBeta,fetchOpenBetaPage,fetchJson} from './normalize.mjs';
const root=new URL('../../data/',import.meta.url);await mkdir(root,{recursive:true});
const provider=process.argv[2]??'openbeta'; const now=new Date().toISOString();
const file=new URL(`${provider}.json`,root);let previous;try{previous=JSON.parse(await readFile(file,'utf8'));}catch{}
if(provider==='openskidata'&&!process.env.SKI_LOCAL_FILE&&previous&&Date.now()-Date.parse(previous.fetchedAt)<86400000)throw Error('OpenSkiData downloads limited to once per 24 hours. Use existing snapshot.');
let records=[], rawCount=0,complete=true;
if(provider==='openskidata'){
 const data=process.env.SKI_LOCAL_FILE?JSON.parse(await readFile(process.env.SKI_LOCAL_FILE,'utf8')):await fetchJson('https://tiles.openskimap.org/geojson/ski_areas.geojson');
 rawCount=data.features.length;records=data.features.map(f=>normalizeSki(f,now)).filter(Boolean);
}else if(provider==='openbeta'){
 const max=Number(process.env.MAX_PAGES??120);for(let page=0;page<max;page++){const batch=await fetchOpenBetaPage(page*500);rawCount+=batch.length;records.push(...batch.map(a=>normalizeOpenBeta(a,now)).filter(Boolean));console.log(`OpenBeta page ${page+1}: ${batch.length} areas`);if(batch.length<500)break;if(page===max-1)complete=false;await new Promise(r=>setTimeout(r,250));}
}else throw Error('Expected openskidata or openbeta');
records=[...new Map(records.map(r=>[r.sourceId,r])).values()].sort((a,b)=>a.sourceId.localeCompare(b.sourceId));
const snapshot={provider,fetchedAt:now,complete,rawCount,count:records.length,countries:[...new Set(records.map(r=>r.country))].sort(),records};
const text=JSON.stringify(snapshot);await writeFile(new URL(`${provider}.json.tmp`,root),text);await rename(new URL(`${provider}.json.tmp`,root),file);await writeFile(new URL(`${provider}.json.gz`,root),gzipSync(text));console.log(JSON.stringify({...snapshot,records:undefined,bytes:Buffer.byteLength(text)}));
