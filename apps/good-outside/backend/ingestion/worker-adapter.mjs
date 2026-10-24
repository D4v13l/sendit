// Worker-safe adapter: deliberately paginates OpenBeta rather than parsing a worldwide GeoJSON in 128 MB.
import {fetchOpenBetaPage,normalizeOpenBeta} from './normalize.mjs';
export async function refreshOpenBetaPage({offset=0,limit=250,ingest,fetcher=fetch}) {
 if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>500)throw Error('Invalid bounded page');
 const fetchedAt=new Date().toISOString();let page;
 try { page=await fetchOpenBetaPage(offset,limit,fetcher); } catch(error) { await ingest({provider:'openbeta',status:'failed',error:String(error.message??error)}); throw error; }
 const records=page.map(a=>normalizeOpenBeta(a,fetchedAt)).filter(Boolean);
 // Never remove unseen source records on a partial paginated run.
 await ingest({provider:'openbeta',records,completeSnapshot:false});
 return {offset,nextOffset:offset+page.length,finished:page.length<limit,fetchedAt,count:records.length};
}
export async function publishSnapshot(snapshot,{endpoint,token,fetcher=fetch}){
 const snapshotId=crypto.randomUUID();
 const send=async(body)=>{const r=await fetcher(endpoint,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(body)});if(!r.ok)throw Error(`Ingest HTTP ${r.status}`);return r;};
 try {
  if(snapshot.complete)await send({provider:snapshot.provider,phase:'begin',snapshotId,expectedCount:snapshot.records.length});
  for(let offset=0;offset<snapshot.records.length;offset+=250)await send({provider:snapshot.provider,...(snapshot.complete?{snapshotId}:{}),records:snapshot.records.slice(offset,offset+250),completeSnapshot:false});
  if(snapshot.complete)await send({provider:snapshot.provider,phase:'finalize',snapshotId});
 } catch(error) {
  try{await send({provider:snapshot.provider,snapshotId,status:'failed',error:String(error.message??error)});}catch{}
  throw error;
 }
 return {provider:snapshot.provider,count:snapshot.records.length,removalFinalized:snapshot.complete};
}
