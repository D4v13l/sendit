import { UPSERT_LOCATION, normalizeRecord, catalogRecord, distanceKm } from '../database/records.mjs';
type Statement={bind:(...args:any[])=>Statement;all:()=>Promise<{results:any[]}>;run:()=>Promise<any>};
export type LocationEnv={DB:{prepare:(sql:string)=>Statement;batch:(statements:any[])=>Promise<any[]>};INGEST_SECRET?:string};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const browseActivities=['Hiking','Climbing','Biking','Bikepacking','Backpacking','Skiing','Backcountry skiing'];
const activityAliases:Record<string,string[]>={Hiking:['Hiking','hiking'],Climbing:['Climbing','climbing'],Biking:['Biking','biking'],Bikepacking:['Bikepacking','bikepacking'],Backpacking:['Backpacking','backpacking'],Skiing:['Skiing','downhill_skiing'],'Backcountry skiing':['Backcountry skiing','backcountry_skiing']};
async function health(env:LocationEnv) {
 const [counts,runs,snapshots,jobs]=await Promise.all([env.DB.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN removed_at IS NULL THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN removed_at IS NULL AND stale_at < ? THEN 1 ELSE 0 END) AS stale FROM locations`).bind(new Date().toISOString()).all(),env.DB.prepare(`SELECT r.* FROM provider_runs r WHERE r.rowid=(SELECT p.rowid FROM provider_runs p WHERE p.provider=r.provider ORDER BY p.started_at DESC,p.rowid DESC LIMIT 1) ORDER BY provider`).all(),env.DB.prepare(`SELECT s.*, (SELECT COUNT(*) FROM locations l WHERE l.provider=s.provider AND l.run_id=s.id) AS persisted_count FROM provider_snapshots s WHERE s.rowid=(SELECT x.rowid FROM provider_snapshots x WHERE x.provider=s.provider ORDER BY x.started_at DESC,x.rowid DESC LIMIT 1) ORDER BY provider`).all(),env.DB.prepare(`SELECT * FROM refresh_jobs ORDER BY provider`).all()]);
 return {counts:counts.results[0],providers:runs.results,snapshots:snapshots.results,jobs:jobs.results,staleAfterDays:90,coverage:'Provider records only; geographic and activity coverage varies. Absence does not mean no destination exists.'};
}
export async function handleLocationApi(request:Request,env:LocationEnv):Promise<Response|null> {
 const url=new URL(request.url);if(!['/api/locations','/api/location','/api/health','/api/ingest','/api/export','/api/browse'].includes(url.pathname))return null;
 try {
 if(url.pathname==='/api/location'){
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  const id=url.searchParams.get('id');
  if(!id||!id.trim()||id.length>1024)return json({error:'A nonempty location id of at most 1024 characters is required'},400);
  const rows=await env.DB.prepare(`SELECT * FROM locations WHERE id=? LIMIT 1`).bind(id).all();
  const row=rows.results[0];
  if(!row)return json({error:'Location not found'},404);
  if(row.removed_at)return json({error:'Location was removed from its source catalog',removedAt:row.removed_at},410);
  return json({location:catalogRecord(row,undefined)});
 }
 if(url.pathname==='/api/browse'){
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  const q=(url.searchParams.get('q')||'').trim(),activity=url.searchParams.get('activity')||'',provider=url.searchParams.get('provider')||'';
  const offset=Number(url.searchParams.get('offset')??0),limit=Number(url.searchParams.get('limit')??50);
  if(q.length>200||!Number.isInteger(offset)||offset<0||offset>1000000||!Number.isInteger(limit)||limit<1||limit>100)return json({error:'q must be at most 200 characters; offset 0–1000000; limit 1–100'},400);
  if(provider&&!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(provider))return json({error:'Invalid provider'},400);
  if(activity&&!activityAliases[activity])return json({error:'Unsupported activity'},400);
  const where=['removed_at IS NULL'],bindings:any[]=[];
  if(q){const pattern='%'+q.replace(/[\\%_]/g,'\\$&')+'%';where.push(`(name LIKE ? ESCAPE '\\' OR COALESCE(country,'') LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM json_each(locations.activity_evidence, '$.path') path_part WHERE path_part.type='text' AND path_part.value LIKE ? ESCAPE '\\'))`);bindings.push(pattern,pattern,pattern);}
  if(provider){where.push('provider=?');bindings.push(provider);}
  if(activity){const aliases=activityAliases[activity];where.push(`EXISTS (SELECT 1 FROM json_each(locations.activities) a WHERE a.value IN (${aliases.map(()=>'?').join(',')}))`);bindings.push(...aliases);}
  const filter=where.join(' AND ');
  const [rows,count,providers]=await Promise.all([
   env.DB.prepare(`SELECT * FROM locations WHERE ${filter} ORDER BY name COLLATE NOCASE ASC,id ASC LIMIT ? OFFSET ?`).bind(...bindings,limit,offset).all(),
   env.DB.prepare(`SELECT COUNT(*) AS count FROM locations WHERE ${filter}`).bind(...bindings).all(),
   env.DB.prepare(`SELECT DISTINCT provider FROM locations WHERE removed_at IS NULL ORDER BY provider`).all(),
  ]);
  return json({locations:rows.results.map(r=>catalogRecord(r,undefined)),total:count.results[0]?.count||0,offset,limit,providers:providers.results.map(r=>r.provider),activities:browseActivities});
 }
 if(url.pathname==='/api/export'){
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  const provider=url.searchParams.get('provider'),offset=Number(url.searchParams.get('offset')||0);
  if(!provider||!/^[a-z0-9_-]{1,80}$/.test(provider)||!Number.isInteger(offset)||offset<0)return json({error:'provider and nonnegative offset required'},400);
  const result=await env.DB.prepare(`SELECT * FROM locations WHERE provider=? AND removed_at IS NULL ORDER BY source_id LIMIT 1000 OFFSET ?`).bind(provider,offset).all();
  return json({provider,records:result.results,next:result.results.length===1000?'/api/export?provider='+encodeURIComponent(provider)+'&offset='+(offset+1000):null,licenseNotice:'Preserve each record’s license and attribution. OpenSkiData-derived records are offered under ODbL-1.0; OpenBeta data is CC0 excluding photos.'});
 }
 if(url.pathname==='/api/health')return request.method==='GET'?json(await health(env)):json({error:'Method not allowed'},405);
 if(url.pathname==='/api/locations') {
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  const lat=Number(url.searchParams.get('lat')),lon=Number(url.searchParams.get('lon'));
  if(!url.searchParams.has('lat')||!url.searchParams.has('lon')||!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lon)||Math.abs(lon)>180)return json({error:'Valid lat and lon required'},400);
  const radius=Number(url.searchParams.get('radiusKm')||450),limit=Number(url.searchParams.get('limit')||24);
  if(!Number.isFinite(radius)||radius<=0||radius>2000||!Number.isInteger(limit)||limit<1||limit>100)return json({error:'radiusKm must be 0–2000; limit 1–100'},400);
  const latDelta=radius/110.5,lonDelta=Math.min(180,radius/(110.5*Math.max(.001,Math.cos(lat*Math.PI/180))));
  // Wrapped longitude handles the date line. Exact distance follows the indexed latitude filter.
  const rows=await env.DB.prepare(`SELECT * FROM locations WHERE removed_at IS NULL AND lat BETWEEN ? AND ? AND (? >= 180 OR ABS(lon - ?) <= ? OR ABS(lon - ?) >= 360 - ? )`).bind(lat-latDelta,lat+latDelta,lonDelta,lon,lonDelta,lon,lonDelta).all();
  const activity=url.searchParams.get('activity');
  const candidates=rows.results.filter(r=>distanceKm([lat,lon],[r.lat,r.lon])<=radius).map(r=>catalogRecord(r,[lat,lon])).filter(r=>(!activity||r.activities.includes(activity))&&(!r.activityEvidence?.sourceStatus||r.activityEvidence.sourceStatus==='operating'||r.activityEvidence.sourceStatus==='unknown')&&!((r.activityEvidence?.path||[]).some((p:string)=>/\bbuildering\b|\bindoor\b/i.test(p)))).sort((a,b)=>(a.distanceKm ?? 0)-(b.distanceKm ?? 0));
  // Dedupe display only; preserve provider-specific evidence and licensing in storage and response.
  const groups=new Map<string,any>();for(const r of candidates){
   const path=r.activityEvidence?.path,regional=url.searchParams.get('groupBy')==='area'&&r.provider==='openbeta'&&Array.isArray(path)&&path.length>=3;
   const key=regional?'openbeta:area:'+JSON.stringify(path.slice(0,3)):r.canonicalId;
   const old=groups.get(key);if(old){old.memberCount++;if(old.sources.length<3)old.sources.push({id:r.id,url:r.url,license:r.license,attribution:r.attribution});}
   else groups.set(key,{...r,...(regional?{name:path[2],sourcePlaceName:r.name,sample:r.name+' (representative source coordinate)',largerArea:path[2]}:{}),memberCount:1,sources:[{id:r.id,url:r.url,license:r.license,attribution:r.attribution}]});
  }
  return json({regions:[...groups.values()].slice(0,limit),candidateCount:groups.size,radiusKm:radius,distanceMeaning:'Straight-line candidate radius; driving times and access must be checked separately.',health:await health(env)});
 }
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 if(!env.INGEST_SECRET)return json({error:'Ingestion is not configured'},503);
 if(request.headers.get('Authorization')!==`Bearer ${env.INGEST_SECRET}`)return json({error:'Unauthorized'},401);
 if(Number(request.headers.get('content-length')||0)>4_000_000)return json({error:'Request too large'},413);
 const reader=request.body?.getReader();if(!reader)return json({error:'Body required'},400);let size=0;const chunks:Uint8Array[]=[];while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4_000_000){await reader.cancel();return json({error:'Request too large'},413);}chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const body=JSON.parse(new TextDecoder().decode(bytes));const provider=body.provider;
 if(typeof provider!=='string'||!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(provider))return json({error:'Valid provider required'},400);
 const activeRows=await env.DB.prepare(`SELECT * FROM provider_snapshots WHERE provider=? ORDER BY started_at DESC,rowid DESC LIMIT 1`).bind(provider).all();
 const active=activeRows.results[0];
 const snapshotId=body.snapshotId;
 if(snapshotId!==undefined && (typeof snapshotId!=='string'||!/^[a-zA-Z0-9_-]{1,120}$/.test(snapshotId)))return json({error:'Valid snapshotId required'},400);
 const now=new Date().toISOString();
 if(body.phase==='begin'){
  if(!snapshotId||!Number.isInteger(body.expectedCount)||body.expectedCount<1||body.expectedCount>1000000)return json({error:'snapshotId and expectedCount 1–1000000 required'},400);
  if(active?.status==='running' && (active.id!==snapshotId||active.expected_count!==body.expectedCount))return json({error:'Another snapshot is running; resume or explicitly fail it first'},409);
  if(active?.id===snapshotId && active.status==='success')return json({provider,snapshotId,status:'success'});
  await env.DB.prepare(`INSERT INTO provider_snapshots (id,provider,expected_count,status,started_at) VALUES (?,?,?,'running',?) ON CONFLICT(id) DO NOTHING`).bind(snapshotId,provider,body.expectedCount,now).run();
  const ownership=await env.DB.prepare(`SELECT * FROM provider_snapshots WHERE provider=? AND id=? AND status='running'`).bind(provider,snapshotId).all();
  return ownership.results.length?json({provider,snapshotId,status:'running',expectedCount:body.expectedCount}):json({error:'Snapshot lock conflict'},409);
 }
 if(body.phase==='finalize'){
  if(!snapshotId||!active||active.id!==snapshotId)return json({error:'Snapshot not found for provider'},409);
  if(active.status==='success')return json({provider,snapshotId,status:'success'});
  if(active.status!=='running')return json({error:'Snapshot is not running'},409);
  const countRows=await env.DB.prepare(`SELECT COUNT(*) AS count FROM locations WHERE provider=? AND run_id=?`).bind(provider,snapshotId).all();
  const count=countRows.results[0]?.count||0;
  if(count!==active.expected_count)return json({error:'Snapshot incomplete; previous records retained',persistedCount:count,expectedCount:active.expected_count},409);
  await env.DB.batch([
   env.DB.prepare(`UPDATE locations SET removed_at=? WHERE provider=? AND run_id<>? AND removed_at IS NULL AND EXISTS (SELECT 1 FROM provider_snapshots s WHERE s.provider=? AND s.id=? AND s.status='running' AND s.expected_count=(SELECT COUNT(*) FROM locations l WHERE l.provider=s.provider AND l.run_id=s.id))`).bind(now,provider,snapshotId,provider,snapshotId),
   env.DB.prepare(`UPDATE provider_snapshots SET status='success',finished_at=? WHERE provider=? AND id=? AND status='running' AND expected_count=(SELECT COUNT(*) FROM locations WHERE provider=? AND run_id=?)`).bind(now,provider,snapshotId,provider,snapshotId),
  ]);
  if(['openskidata','openbeta'].includes(provider)){
   const verified=await env.DB.prepare(`SELECT MIN(last_verified_at) AS fetched FROM locations WHERE provider=? AND run_id=?`).bind(provider,snapshotId).all();
   await env.DB.prepare(`INSERT INTO refresh_jobs(provider,status,cursor,received_count,written_count,last_attempt_at,last_success_at,updated_at) VALUES (?,'success',0,?,?,?,?,?) ON CONFLICT(provider) DO UPDATE SET status='success',cursor=0,received_count=excluded.received_count,written_count=excluded.written_count,last_attempt_at=excluded.last_attempt_at,last_success_at=excluded.last_success_at,updated_at=excluded.updated_at,error=NULL`).bind(provider,count,count,verified.results[0]?.fetched||now,now,now).run();
  }
  return json({provider,snapshotId,status:'success',persistedCount:count});
 }
 if(active?.status==='running' && active.id!==snapshotId)return json({error:'Provider has an active snapshot; supply its snapshotId'},409);
 if(snapshotId && (!active||active.id!==snapshotId||active.status!=='running'))return json({error:'Begin the provider snapshot before uploading'},409);
 if(body.status==='failed'){if(snapshotId)await env.DB.prepare(`UPDATE provider_snapshots SET status='failed',finished_at=?,error=? WHERE provider=? AND id=? AND status='running'`).bind(now,String(body.error||'Snapshot failed').slice(0,2000),provider,snapshotId).run();const failedAt=new Date().toISOString(),failedId=crypto.randomUUID();await env.DB.prepare(`INSERT INTO provider_runs (id,provider,started_at,finished_at,status,received_count,written_count,error,last_success_at) VALUES (?,?,?,?,'failed',0,0,?,(SELECT MAX(last_success_at) FROM provider_runs WHERE provider=?))`).bind(failedId,provider,failedAt,failedAt,String(body.error||'Upstream fetch failed').slice(0,2000),provider).run();return json({runId:failedId,provider,status:'failed',written:0});}
 if(!Array.isArray(body.records)||body.records.length>1000)return json({error:'At most 1000 records required'},400);
 const runId=crypto.randomUUID();
 const records=body.records.map((r:any)=>normalizeRecord(provider,r,snapshotId||runId,now));
 if(new Set(records.map((r:any[])=>r[2])).size!==records.length)return json({error:'Duplicate source IDs in batch'},400);
 if(snapshotId && body.completeSnapshot===true)return json({error:'Use phase finalize for staged snapshots'},400);
 if(body.completeSnapshot===true && (body.expectedCount!==records.length||records.length===0))return json({error:'Complete snapshots require exact nonzero expectedCount'},400);
 await env.DB.prepare(`INSERT INTO provider_runs (id,provider,started_at,status,received_count,written_count,last_success_at) VALUES (?,?,?,'running',?,0,(SELECT MAX(last_success_at) FROM provider_runs WHERE provider=?))`).bind(runId,provider,now,records.length,provider).run();
 let written=0;
 try {
  for(let i=0;i<records.length;i+=50){const batch=records.slice(i,i+50).map((values:any[])=>{const sql=snapshotId?UPSERT_LOCATION.replace('VALUES (','SELECT ').replace(') ON CONFLICT', ` WHERE EXISTS (SELECT 1 FROM provider_snapshots WHERE provider=? AND id=? AND status='running') ON CONFLICT`):UPSERT_LOCATION;return env.DB.prepare(sql).bind(...values,...(snapshotId?[provider,snapshotId]:[]));});await env.DB.batch(batch);written+=batch.length;}
  // Only an explicitly complete, fully persisted source snapshot can retire old records.
  if(body.completeSnapshot===true)await env.DB.prepare(`UPDATE locations SET removed_at=? WHERE provider=? AND run_id<>? AND removed_at IS NULL`).bind(now,provider,runId).run();
  await env.DB.prepare(`UPDATE provider_runs SET status='success',finished_at=?,written_count=?,last_success_at=? WHERE id=?`).bind(new Date().toISOString(),written,now,runId).run();
  return json({runId,provider,written,completeSnapshot:body.completeSnapshot===true});
 }catch(error){await env.DB.prepare(`UPDATE provider_runs SET status='failed',finished_at=?,written_count=?,error=? WHERE id=?`).bind(new Date().toISOString(),written,String(error).slice(0,2000),runId).run();return json({error:'Ingestion failed; previous records preserved',runId,written},500);}
 }catch(error){return json({error:error instanceof Error?error.message:'Invalid request'},400);}
}
