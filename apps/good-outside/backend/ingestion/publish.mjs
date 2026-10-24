import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export async function readCredentials(){let input='';for await(const chunk of process.stdin){input+=chunk;if(input.length>16384)throw Error('Credentials input too large');}const c=JSON.parse(input);const u=new URL(c.origin);if(u.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(u.hostname))throw Error('HTTPS origin required');if(!c.token)throw Error('Missing credentials');return {origin:u.origin,token:c.token};}
export async function publish(provider,{origin,token}){
 const s=JSON.parse(await readFile(new URL(`../../data/${provider}.json`,import.meta.url),'utf8'));if(s.provider!==provider||s.records.length!==s.count||!s.count)throw Error('Invalid snapshot');
 const snapshotId=crypto.randomUUID();const headers={'content-type':'application/json',Authorization:`Bearer ${token}`,'OAI-Sites-Authorization':`Bearer ${token}`};
 const send=async body=>{for(let attempt=0;attempt<3;attempt++){try{const r=await fetch(`${origin}/api/ingest`,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});const text=await r.text();if(!r.ok){if(r.status<500&&r.status!==429)throw Object.assign(Error(`Ingest rejected HTTP ${r.status}`),{terminal:true});throw Error(`Ingest HTTP ${r.status}`);}return JSON.parse(text);}catch(e){if(e.terminal||attempt===2)throw e;await new Promise(r=>setTimeout(r,1000*2**attempt));}}};
 try{
 if(s.complete)await send({provider,phase:'begin',snapshotId,expectedCount:s.count});
 for(let i=0;i<s.count;i+=1000){const records=s.records.slice(i,i+1000);if(Buffer.byteLength(JSON.stringify(records))>3900000)throw Error('Chunk exceeds size limit');await send({provider,...(s.complete?{snapshotId}:{}),records});console.log(JSON.stringify({provider,written:Math.min(i+1000,s.count),total:s.count}));}
 if(s.complete)await send({provider,phase:'finalize',snapshotId});
 }catch(e){try{await send({provider,...(s.complete?{snapshotId}:{}),status:'failed',error:'Publisher failed; inspect manual job logs'});}catch{}throw e;}
 const health=await fetch(`${origin}/api/health`,{headers,signal:AbortSignal.timeout(30000)});console.log(JSON.stringify({provider,published:s.count,finalized:s.complete,healthStatus:health.status,health:health.ok?await health.json():null}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{const c=await readCredentials();const requested=process.argv[2]??'all';for(const p of requested==='all'?['curated','openskidata','openbeta','ridb']:[requested]){if(!['curated','openskidata','openbeta','ridb'].includes(p))throw Error('Unknown provider');await publish(p,c);}}catch(e){console.error(e.message);process.exitCode=1;}}
