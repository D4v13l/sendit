import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from 'esbuild';
import {streamFeatures} from './backend/jobs/feature-stream.mjs';
import {readZipJsonMembers} from './backend/jobs/range-zip.mjs';
import {normalizeRidb,RIDB_MEMBERS} from './backend/ingestion/ridb-normalize.mjs';
const encode=new TextEncoder();
function stream(text,width=7){const bytes=encode.encode(text);return new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=width)controller.enqueue(bytes.slice(i,i+width));controller.close();}});}
const feature=(id,name='Snow "ridge" \\ tests')=>({type:'Feature',geometry:{type:'Point',coordinates:[-120,45]},properties:{name,sources:[{type:'openstreetmap',id:`way/${id}`}],activities:['downhill']}});
const document=JSON.stringify({type:'FeatureCollection',features:[feature(1),feature(2,'Unicode 🏔 mountain')]});
for(const width of [1,2,7,10000]){const parsed=[];for await(const value of streamFeatures(stream(document,width)))parsed.push(value);assert.equal(parsed.length,2);assert.equal(parsed[0].properties.name,feature(1).properties.name);assert.equal(parsed[1].properties.name,'Unicode 🏔 mountain');}
for(const text of [document.slice(0,-1),document.slice(0,-6),'{"type":"FeatureCollection","features":[{},]}','{"type":"FeatureCollection","features":[']){await assert.rejects(async()=>{for await(const _ of streamFeatures(stream(text))){};});}
const bundled=await build({entryPoints:['backend/jobs/refresh.ts'],bundle:true,write:false,format:'esm',platform:'node',target:'es2022'});
const {refreshSource,handleRefreshApi}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const directory=mkdtempSync(join(tmpdir(),'good-outside-jobs-'));
try{
 const path=join(directory,'jobs.sqlite');
 const execute=(queries)=>{const result=spawnSync('python3',['-c',`import sqlite3,json,sys
p=json.load(sys.stdin);c=sqlite3.connect(p['path']);c.row_factory=sqlite3.Row
try:
 out=[]
 for q in p['queries']:
  if q.get('script'):c.executescript(q['sql']);out.append({});continue
  r=c.execute(q['sql'],q.get('args',[]));out.append({'results':[dict(x) for x in r.fetchall()],'meta':{'changes':r.rowcount}})
 c.commit();print(json.dumps(out))
except:
 c.rollback();raise`],{input:JSON.stringify({path,queries}),encoding:'utf8'});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);};
 const migration=readdirSync('drizzle').find(x=>x.endsWith('.sql'));execute([{sql:readFileSync('drizzle/'+migration,'utf8'),script:true}]);
 const DB={prepare(sql){return {sql,args:[],bind(...args){this.args=args;return this;},async all(){return execute([this])[0];},async run(){return execute([this])[0];}};},async batch(batch){return execute(batch);}};
 const env={DB,INGEST_SECRET:'secret',INGEST_OWNER_EMAIL:'owner@example.org'};
 const features=Array.from({length:1002},(_,i)=>feature(i));let calls=0;
 const source=JSON.stringify({type:'FeatureCollection',features});
 const fetcher=async()=>{calls++;return new Response(stream(source,137));};
 const first=await refreshSource(env,'openskidata',2,fetcher);assert.equal(first.status,'success');assert.equal(first.writtenCount,1002);assert.equal(calls,1);
 const guarded=await refreshSource(env,'openskidata',2,fetcher);assert.equal(guarded.status,'up_to_date');assert.equal(calls,1);
 execute([{sql:`UPDATE refresh_jobs SET last_attempt_at='2000-01-01T00:00:00.000Z' WHERE provider='openskidata'`}]);
 const truncated=JSON.stringify({type:'FeatureCollection',features:Array.from({length:600},(_,i)=>feature(i+2000))}).slice(0,-3);
 const failed=await refreshSource(env,'openskidata',2,async()=>{calls++;return new Response(stream(truncated,43));});assert.equal(failed.status,'failed');assert.equal(failed.previousRecordsPreserved,true);
 assert.equal(execute([{sql:`SELECT COUNT(*) AS count FROM locations WHERE source_id LIKE '%way/%' AND removed_at IS NOT NULL`}])[0].results[0].count,0);
 const afterFailed=await refreshSource(env,'openskidata',2,fetcher);assert.equal(afterFailed.status,'up_to_date');assert.equal(calls,2);
 const pageRows=Array.from({length:250},(_,i)=>({uuid:`beta-${i}`,area_name:`Crag ${i}`,metadata:{leaf:true,lat:45,lng:-120},totalClimbs:2,aggregate:{},pathTokens:['US']}));
 const beta=await refreshSource(env,'openbeta',1,async()=>new Response(JSON.stringify({data:{areas:pageRows}}),{headers:{'Content-Type':'application/json'}}));
 assert.equal(beta.status,'running');assert.equal(beta.nextCursor,250);assert.equal(beta.needsContinuation,true);
 const betaFailed=await refreshSource(env,'openbeta',1,async()=>new Response(JSON.stringify({data:{areas:[]}}),{headers:{'Content-Type':'application/json'}}));assert.equal(betaFailed.status,'failed');assert.match(betaFailed.error,/unexpectedly small/);
 const recAreas=Array.from({length:1002},(_,i)=>({RecAreaID:i+1,RecAreaName:`Federal area ${i}`,RecAreaLatitude:45,RecAreaLongitude:-120,Enabled:true}));
 const activities=[{ActivityID:14,ActivityName:'HIKING'},{ActivityID:5,ActivityName:'BIKING'},{ActivityID:100036,ActivityName:'BACKPACKING'}];
 const joins=recAreas.flatMap(r=>activities.map(a=>({EntityID:r.RecAreaID,EntityType:'Rec Area',ActivityID:a.ActivityID})));
 const payload={'RecAreas_API_v1.json':{RECDATA:recAreas},'Activities_API_v1.json':{RECDATA:activities},'EntityActivities_API_v1.json':{RECDATA:joins}};
 const made=spawnSync('python3',['-c',`import sys,json,zipfile,io,base64
p=json.load(sys.stdin);out=io.BytesIO()
with zipfile.ZipFile(out,'w') as z:
 for i,(name,value) in enumerate(p.items()):z.writestr(name,json.dumps(value),compress_type=zipfile.ZIP_DEFLATED if i%2 else zipfile.ZIP_STORED)
 z.writestr('UnselectedHugeMember.json','x'*2000000,compress_type=zipfile.ZIP_STORED)
print(base64.b64encode(out.getvalue()).decode())`],{input:JSON.stringify(payload),encoding:'utf8',maxBuffer:10_000_000});assert.equal(made.status,0,made.stderr);
 const archive=Buffer.from(made.stdout.trim(),'base64');let transferred=0,rangeRequests=0;
 const rangeFetch=async(_url,options)=>{rangeRequests++;const requested=options.headers.Range;const suffix=/^bytes=-(\d+)$/.exec(requested),bounds=/^bytes=(\d+)-(\d+)$/.exec(requested);const start=suffix?Math.max(0,archive.length-Number(suffix[1])):Number(bounds[1]),end=suffix?archive.length-1:Number(bounds[2]);const body=archive.subarray(start,end+1);transferred+=body.length;return new Response(body,{status:206,headers:{'Content-Range':`bytes ${start}-${end}/${archive.length}`,ETag:'"fixture-v1"'}});};
 const selected=await readZipJsonMembers('https://fixture/large.zip',RIDB_MEMBERS,rangeFetch);assert.equal(selected.members['RecAreas_API_v1.json'].length,1002);assert.ok(transferred<archive.length/2);assert.ok(rangeRequests<=8);
 const normalized=normalizeRidb(selected.members['RecAreas_API_v1.json'],selected.members['Activities_API_v1.json'],selected.members['EntityActivities_API_v1.json'],new Date().toISOString());assert.equal(normalized.length,1002);assert.deepEqual(normalized[0].activities,['Backpacking','Biking','Hiking']);assert.ok(!normalized[0].activities.includes('Bikepacking'));
 await assert.rejects(()=>readZipJsonMembers('https://fixture/ignored.zip',RIDB_MEMBERS,async()=>new Response('range ignored')),/honor bounded HTTP Range/);
 const refreshedRidb=await refreshSource(env,'ridb',2,rangeFetch);assert.equal(refreshedRidb.status,'success');assert.equal(refreshedRidb.writtenCount,1002);
 const requestsBeforeGuard=rangeRequests;assert.equal((await refreshSource(env,'ridb',2,rangeFetch)).status,'up_to_date');assert.equal(rangeRequests,requestsBeforeGuard);
 execute([{sql:`UPDATE refresh_jobs SET last_success_at='2000-01-01T00:00:00.000Z' WHERE provider='ridb'`}]);
 const refusedRidb=await refreshSource(env,'ridb',2,async()=>new Response('range ignored'));assert.equal(refusedRidb.status,'failed');assert.equal(execute([{sql:`SELECT COUNT(*) AS count FROM locations WHERE provider='ridb' AND removed_at IS NULL`}])[0].results[0].count,1002);
 const rpc=(method,params,headers={})=>new Request('https://example.org/mcp',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});
 assert.equal((await handleRefreshApi(rpc('tools/list'),env)).status,200);
 const discovered=await (await handleRefreshApi(rpc('server/discover'),env)).json();assert.deepEqual(discovered.result.supportedVersions,['2026-07-28']);assert.deepEqual(discovered.result.capabilities,{tools:{}});
 assert.equal((await handleRefreshApi(rpc('tools/call',{name:'read_location_health'}),env)).status,401);
 const listed=await (await handleRefreshApi(rpc('tools/list',{}, {'oai-authenticated-user-email':'reader@example.org'}),env)).json();assert.equal(listed.result.tools.length,2);
 const denied=await (await handleRefreshApi(rpc('tools/call',{name:'refresh_location_source',arguments:{provider:'openskidata'}},{'oai-authenticated-user-email':'reader@example.org'}),env)).json();assert.equal(denied.error.code,-32001);
 console.log('Job tests passed: streamed feature bounds/truncation, daily attempt guard, OpenBeta cursor, RIDB selective stored/deflated ZIP ranges + explicit activities + weekly guard + failure retention, and MCP discovery/reader/owner authorization.');
}finally{rmSync(directory,{recursive:true,force:true});}
