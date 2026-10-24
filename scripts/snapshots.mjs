import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
export const providers=['curated','openbeta','openskidata','ridb'];
export function validateManifest(m){
 if(m?.version!==1||!/^[-a-zA-Z0-9_]+$/.test(m.release)||!Array.isArray(m.providers)||!m.providers.length)throw Error('Invalid manifest');
 const seen=new Set();
 for(const p of m.providers){
  if(!providers.includes(p.provider)||seen.has(p.provider)||p.key!==`${m.release}/${p.provider}.json.gz`||!Number.isSafeInteger(p.count)||p.count<1||!Number.isSafeInteger(p.bytes)||p.bytes<1||p.bytes>50_000_000||!/^[a-f0-9]{64}$/.test(p.sha256))throw Error('Invalid snapshot entry');
  seen.add(p.provider);
 }
 return m;
}
export function verifySnapshot(bytes,p){
 if(bytes.length!==p.bytes||createHash('sha256').update(bytes).digest('hex')!==p.sha256)throw Error('Snapshot checksum/size mismatch: '+p.provider);
 const raw=gunzipSync(bytes,{maxOutputLength:150_000_000});const s=JSON.parse(raw);
 if(s.provider!==p.provider||s.count!==p.count||!Array.isArray(s.records)||s.records.length!==p.count)throw Error('Snapshot provider/count mismatch');
 return raw;
}
