import { handleLocationApi, type LocationEnv } from '../api/locations';
import { normalizeSki, normalizeOpenBeta, fetchOpenBetaPage } from '../ingestion/normalize.mjs';
import { normalizeRidb, RIDB_URL, RIDB_MEMBERS } from '../ingestion/ridb-normalize.mjs';
import { readZipJsonMembers } from './range-zip.mjs';
import { streamFeatures } from './feature-stream.mjs';
import { handleMcpRequest } from '../mcp/server';
export type RefreshEnv=LocationEnv & {INGEST_OWNER_EMAIL?:string};
export function isRefreshOwner(request:Request,env:RefreshEnv){const email=request.headers.get('oai-authenticated-user-email');return Boolean(env.INGEST_SECRET&&request.headers.get('Authorization')===`Bearer ${env.INGEST_SECRET}`)||Boolean(env.INGEST_OWNER_EMAIL&&email?.toLowerCase()===env.INGEST_OWNER_EMAIL.toLowerCase());}
export function isSiteReader(request:Request,env:RefreshEnv){return isRefreshOwner(request,env)||Boolean(request.headers.get('oai-authenticated-user-email'));}
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function ingest(env:RefreshEnv,body:any){if(!env.INGEST_SECRET)throw Error('Ingestion secret is not configured');const response=await handleLocationApi(new Request('https://internal/api/ingest',{method:'POST',headers:{Authorization:`Bearer ${env.INGEST_SECRET}`,'Content-Type':'application/json'},body:JSON.stringify(body)}),env);const data=await response!.json() as any;if(!response!.ok)throw Error(data.error||'Ingest failed');return data;}
async function saveChunk(env:RefreshEnv,provider:string,snapshotId:string,records:any[]){const unique=[...new Map(records.map(r=>[r.sourceId,r])).values()];for(let i=0;i<unique.length;i+=500)await ingest(env,{provider,snapshotId,records:unique.slice(i,i+500)});}
export async function locationHealth(env:RefreshEnv){const response=await handleLocationApi(new Request('https://internal/api/health'),env);return response!.json();}
export async function refreshSource(env:RefreshEnv,provider:string,maxPages=2,fetcher:typeof fetch=fetch){
 if(!['openskidata','openbeta','ridb'].includes(provider))throw Error('Unknown source provider');
 if(!Number.isInteger(maxPages)||maxPages<1||maxPages>10)throw Error('maxPages must be 1–10');
 const now=new Date().toISOString(),leaseUntil=new Date(Date.now()+120000).toISOString();
 await env.DB.prepare(`INSERT INTO refresh_jobs (provider,status,cursor,received_count,written_count,updated_at) VALUES (?,'idle',0,0,0,?) ON CONFLICT(provider) DO NOTHING`).bind(provider,now).run();
 const acquired:any=await env.DB.prepare(`UPDATE refresh_jobs SET lease_until=?,updated_at=? WHERE provider=? AND (lease_until IS NULL OR lease_until<?)`).bind(leaseUntil,now,provider,now).run();
 // Verify lease through its unique timestamp rather than relying on adapter-specific metadata.
 const read=await env.DB.prepare(`SELECT * FROM refresh_jobs WHERE provider=?`).bind(provider).all();const job=read.results[0];
 if(!job||job.lease_until!==leaseUntil||acquired?.meta?.changes===0)return {provider,status:'busy',needsContinuation:true};
 let snapshotId=job.snapshot_id as string|undefined,cursor=job.cursor||0,received=job.received_count||0,written=job.written_count||0;
 try{
  const interval=provider==='openskidata'?86400000:7*86400000;
  const guard=provider==='openskidata'?job.last_attempt_at:job.last_success_at;
  if(job.status!=='running'&&guard&&Date.now()-Date.parse(guard)<interval)return {provider,status:'up_to_date',nextRefreshAt:new Date(Date.parse(guard)+interval).toISOString(),needsContinuation:false};
  // Interrupted ski streams cannot resume at byte offsets: preserve their data and respect the daily attempt guard.
  if(provider==='openskidata'&&job.status==='running'&&job.last_attempt_at&&Date.now()-Date.parse(job.last_attempt_at)<interval){if(snapshotId)await ingest(env,{provider,snapshotId,status:'failed',error:'Prior streaming refresh interrupted; waiting until next daily attempt'});await env.DB.prepare(`UPDATE refresh_jobs SET status='failed',error=? WHERE provider=?`).bind('Interrupted stream; daily retry guard active',provider).run();return {provider,status:'failed',needsContinuation:false,nextRefreshAt:new Date(Date.parse(job.last_attempt_at)+interval).toISOString()};}
  if(job.status!=='running'||provider!=='openbeta'){
   snapshotId=crypto.randomUUID();cursor=0;received=0;written=0;
   const active=await env.DB.prepare(`SELECT id FROM provider_snapshots WHERE provider=? AND status='running'`).bind(provider).all();
   if(active.results.length)await ingest(env,{provider,snapshotId:active.results[0].id,status:'failed',error:'Abandoned source snapshot replaced by hosted refresh'});
   await ingest(env,{provider,phase:'begin',snapshotId,expectedCount:1});
   await env.DB.prepare(`UPDATE refresh_jobs SET status='running',snapshot_id=?,cursor=0,received_count=0,written_count=0,error=NULL,last_attempt_at=?,updated_at=? WHERE provider=?`).bind(snapshotId,now,now,provider).run();
  }
  let complete=false;
  if(provider==='openskidata'){
   const response=await fetcher('https://tiles.openskimap.org/geojson/ski_areas.geojson',{signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error(`OpenSkiData HTTP ${response.status}`);
   let batch:any[]=[];
   for await(const feature of streamFeatures(response.body)){received++;const record=normalizeSki(feature,now);if(record)batch.push(record);if(batch.length>=500){await saveChunk(env,provider,snapshotId!,batch);written+=batch.length;batch=[];}}
   if(batch.length){await saveChunk(env,provider,snapshotId!,batch);written+=batch.length;}complete=true;
  }else if(provider==='ridb'){
   const archive=await readZipJsonMembers(RIDB_URL,RIDB_MEMBERS,fetcher);
   const members=archive.members as Record<string,any[]>;
   const records=normalizeRidb(members['RecAreas_API_v1.json'],members['Activities_API_v1.json'],members['EntityActivities_API_v1.json'],now);
   received=members['RecAreas_API_v1.json'].length;
   await saveChunk(env,provider,snapshotId!,records);written=records.length;complete=true;
  }else{
   const deadline=Date.now()+25000;
   for(let page=0;page<maxPages&&Date.now()<deadline;page++){
    const boundedFetch=((url:any,options:any)=>fetcher(url,{...options,signal:AbortSignal.timeout(6000)})) as typeof fetch;
    const rows=await fetchOpenBetaPage(cursor,250,boundedFetch);if(!Array.isArray(rows))throw Error('OpenBeta returned invalid page');
    const records=rows.map((r:any)=>normalizeOpenBeta(r,now)).filter(Boolean);await saveChunk(env,provider,snapshotId!,records);received+=rows.length;written+=records.length;cursor+=rows.length;
    await env.DB.prepare(`UPDATE refresh_jobs SET cursor=?,received_count=?,written_count=?,updated_at=? WHERE provider=?`).bind(cursor,received,written,new Date().toISOString(),provider).run();
    if(rows.length<250){complete=true;break;}
   }
  }
  if(complete){
   const counts=await env.DB.prepare(`SELECT COUNT(*) AS count FROM locations WHERE provider=? AND run_id=?`).bind(provider,snapshotId).all();const count=counts.results[0]?.count||0;
   if(count<1000)throw Error(`Source snapshot unexpectedly small (${count}); retaining previous records`);
   const previous=await env.DB.prepare(`SELECT COUNT(*) AS count FROM locations WHERE provider=? AND removed_at IS NULL`).bind(provider).all();if(count<(previous.results[0]?.count||0)*0.5)throw Error('Source snapshot lost over half the existing records; manual review required');
   await env.DB.prepare(`UPDATE provider_snapshots SET expected_count=? WHERE provider=? AND id=? AND status='running'`).bind(count,provider,snapshotId).run();
   await ingest(env,{provider,phase:'finalize',snapshotId});
   await env.DB.prepare(`UPDATE refresh_jobs SET status='success',cursor=?,received_count=?,written_count=?,last_success_at=?,updated_at=?,error=NULL WHERE provider=?`).bind(cursor,received,count,new Date().toISOString(),new Date().toISOString(),provider).run();
   return {provider,status:'success',receivedCount:received,writtenCount:count,needsContinuation:false};
  }
  return {provider,status:'running',receivedCount:received,writtenCount:written,nextCursor:cursor,needsContinuation:true};
 }catch(error){const message=error instanceof Error?error.message:String(error);if(snapshotId)await ingest(env,{provider,snapshotId,status:'failed',error:message}).catch(()=>{});await env.DB.prepare(`UPDATE refresh_jobs SET status='failed',error=?,received_count=?,written_count=?,updated_at=? WHERE provider=?`).bind(message.slice(0,2000),received,written,new Date().toISOString(),provider).run();return {provider,status:'failed',error:message,needsContinuation:false,previousRecordsPreserved:true};
 }finally{await env.DB.prepare(`UPDATE refresh_jobs SET lease_until=NULL WHERE provider=? AND lease_until=?`).bind(provider,leaseUntil).run();}
}
export async function handleRefreshApi(request:Request,env:RefreshEnv):Promise<Response|null>{const path=new URL(request.url).pathname;if(path==='/mcp')return handleMcpRequest(request,env);if(path!=='/api/jobs/refresh')return null;if(!isRefreshOwner(request,env))return json({error:'Owner authorization required'},403);if(request.method!=='POST')return json({error:'Method not allowed'},405);try{const body=await request.json() as any;return json(await refreshSource(env,body.provider,body.maxPages??2));}catch(error){return json({error:error instanceof Error?error.message:'Invalid refresh request'},400);}}
