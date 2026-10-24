import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ts from 'typescript';
import {UPSERT_LOCATION,normalizeRecord,catalogRecord,distanceKm} from './backend/database/records.mjs';
const record={sourceId:'way/12',name:'Test mountain',lat:45,lon:179.9,activities:['downhill_skiing'],sourceUrl:'https://example.org/12',license:'CC-BY-SA-4.0',attribution:'Test provider'};
const values=normalizeRecord('test',record,'run1','2026-10-23T00:00:00.000Z');
assert.equal(values.length,23);assert.equal(values[15],'unknown');assert.equal(values[17],'unknown');
assert.throws(()=>normalizeRecord('test',{...record,lat:91},'run1'));
assert.throws(()=>normalizeRecord('test',{...record,license:''},'run1'));
assert.throws(()=>normalizeRecord('test',{...record,sourceUrl:'javascript:alert(1)'},'run1'));
assert.ok(distanceKm([45,179.9],[45,-179.9])<20);
const schema=`CREATE TABLE locations (id TEXT PRIMARY KEY,provider TEXT NOT NULL,source_id TEXT NOT NULL,canonical_id TEXT NOT NULL,name TEXT NOT NULL,lat REAL NOT NULL,lon REAL NOT NULL,geometry TEXT,activities TEXT NOT NULL,activity_evidence TEXT NOT NULL,source_url TEXT NOT NULL,license TEXT NOT NULL,attribution TEXT NOT NULL,country TEXT,road TEXT,camp TEXT NOT NULL,camp_note TEXT,access TEXT NOT NULL,upstream_sources TEXT,fetched_at TEXT NOT NULL,last_verified_at TEXT NOT NULL,stale_at TEXT NOT NULL,removed_at TEXT,run_id TEXT NOT NULL,UNIQUE(provider,source_id));`;
const result=spawnSync('python3',['-c',`import sys,json,sqlite3
p=json.load(sys.stdin)
c=sqlite3.connect(':memory:')
c.row_factory=sqlite3.Row
c.execute(p['schema'])
c.execute(p['sql'],p['values'])
c.execute(p['sql'],p['values'])
assert c.execute('SELECT COUNT(*) FROM locations').fetchone()[0]==1
v=p['values'].copy(); v[4]='Updated mountain'; v[-1]='run2'
c.execute(p['sql'],v)
assert c.execute('SELECT name FROM locations').fetchone()[0]=='Updated mountain'
# A partial batch from another provider must retain the first provider and both licenses.
v[0]='other-id';v[1]='other';v[12]='Other attribution'
c.execute(p['sql'],v)
assert c.execute('SELECT COUNT(*) FROM locations').fetchone()[0]==2
# Only complete-snapshot finalization scopes removals to its own provider.
c.execute('UPDATE locations SET removed_at=? WHERE provider=? AND run_id<>? AND removed_at IS NULL',('2026-10-24','test','run3'))
assert c.execute('SELECT COUNT(*) FROM locations WHERE removed_at IS NULL').fetchone()[0]==1
c.execute(p['sql'],p['values'])
assert c.execute('SELECT COUNT(*) FROM locations WHERE removed_at IS NULL').fetchone()[0]==2
print(json.dumps(dict(c.execute('SELECT * FROM locations WHERE provider="test"').fetchone())))`],{input:JSON.stringify({schema,sql:UPSERT_LOCATION,values}),encoding:'utf8'});
assert.equal(result.status,0,result.stderr);
const catalog=catalogRecord(JSON.parse(result.stdout),[45,179.9]);
assert.deepEqual(catalog.activities,['Skiing']);assert.equal(catalog.camp,null);assert.equal(catalog.access,'unknown');assert.equal(catalog.distanceKm,0);
console.log('Database tests passed: SQLite idempotent upserts, provider isolation, snapshot removal, recovery, validation, date-line distance and activity mapping.');
const source=readFileSync(new URL('./backend/api/locations.ts',import.meta.url),'utf8').replace("'../database/records.mjs'",JSON.stringify(new URL('./backend/database/records.mjs',import.meta.url).href));
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {handleLocationApi}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
let statements=[],batches=[],failWrites=false;
const DB={prepare(sql){const statement={sql,args:[],bind(...args){this.args=args;return this;},async all(){return {results:[]};},async run(){statements.push(this);return {};}};return statement;},async batch(batch){batches.push(batch);if(failWrites)throw Error('simulated upstream persistence failure');return batch.map(()=>({success:true}));}};
const env={DB,INGEST_SECRET:'test-secret'};
const post=(body,authorized=true)=>new Request('https://example.org/api/ingest',{method:'POST',headers:{'Content-Type':'application/json',...(authorized?{Authorization:'Bearer test-secret'}:{})},body:JSON.stringify(body)});
assert.equal((await handleLocationApi(post({provider:'test',records:[record]},false),env)).status,401);
assert.equal(statements.length,0);
assert.equal((await handleLocationApi(post({provider:'test',records:[record],completeSnapshot:true,expectedCount:2}),env)).status,400);
assert.equal(statements.length,0);
assert.equal((await handleLocationApi(post({provider:'test',records:[record]}),env)).status,200);
assert.equal(batches[0].length,1);assert.ok(!statements.some(s=>s.sql.includes('SET removed_at')));
statements=[];batches=[];failWrites=true;
assert.equal((await handleLocationApi(post({provider:'test',records:[record],completeSnapshot:true,expectedCount:1}),env)).status,500);
assert.ok(statements.some(s=>s.sql.includes("status='failed'")));assert.ok(!statements.some(s=>s.sql.includes('SET removed_at')));
statements=[];failWrites=false;
assert.equal((await handleLocationApi(post({provider:'test',status:'failed',error:'source unavailable'}),env)).status,200);
assert.equal(statements.length,1);assert.ok(statements[0].sql.includes("'failed'"));
assert.equal((await handleLocationApi(new Request('https://example.org/api/locations?lat=91&lon=0'),env)).status,400);
console.log('API tests passed: authorization, snapshot guards, partial fetch preservation, write-failure health and invalid coordinates.');
const directory=mkdtempSync(join(tmpdir(),'good-outside-db-'));
try {
 const path=join(directory,'test.sqlite');
 const execute=(queries)=>{
  const result=spawnSync('python3',['-c',`import sqlite3,json,sys
p=json.load(sys.stdin);c=sqlite3.connect(p['path']);c.row_factory=sqlite3.Row
try:
 out=[]
 for q in p['queries']:
  r=c.execute(q['sql'],q.get('args',[]));out.append({'results':[dict(x) for x in r.fetchall()]})
 c.commit();print(json.dumps(out))
except:
 c.rollback();raise`],{input:JSON.stringify({path,queries}),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
 };
 execute([{sql:schema},{sql:`CREATE TABLE provider_snapshots(id TEXT PRIMARY KEY,provider TEXT NOT NULL,expected_count INTEGER NOT NULL,status TEXT NOT NULL,started_at TEXT NOT NULL,finished_at TEXT,error TEXT)`},{sql:`CREATE UNIQUE INDEX provider_snapshots_active ON provider_snapshots(provider) WHERE status='running'`},{sql:`CREATE TABLE provider_runs(id TEXT PRIMARY KEY,provider TEXT,started_at TEXT,finished_at TEXT,status TEXT,received_count INTEGER,written_count INTEGER,error TEXT,last_success_at TEXT)`}]);
 const realDB={prepare(sql){return {sql,args:[],bind(...args){this.args=args;return this;},async all(){return execute([this])[0];},async run(){return execute([this])[0];}};},async batch(batch){return execute(batch);}};
 const realEnv={DB:realDB,INGEST_SECRET:'test-secret'};
 const call=async body=>handleLocationApi(post(body),realEnv);
 await call({provider:'test',records:[{...record,sourceId:'old'}]});
 assert.equal((await call({provider:'test',phase:'begin',snapshotId:'snapshot-1',expectedCount:2})).status,200);
 assert.equal((await call({provider:'test',phase:'begin',snapshotId:'snapshot-other',expectedCount:2})).status,409);
 assert.equal((await call({provider:'other',snapshotId:'snapshot-1',records:[record]})).status,409);
 assert.equal((await call({provider:'test',snapshotId:'snapshot-1',records:[record]})).status,200);
 assert.equal((await call({provider:'test',snapshotId:'snapshot-1',records:[record]})).status,200);
 assert.equal((await call({provider:'test',phase:'finalize',snapshotId:'snapshot-1'})).status,409);
 assert.equal(execute([{sql:`SELECT COUNT(*) AS count FROM locations WHERE removed_at IS NULL`}])[0].results[0].count,2);
 await call({provider:'test',snapshotId:'snapshot-1',records:[{...record,sourceId:'second'}]});
 assert.equal((await call({provider:'test',phase:'finalize',snapshotId:'snapshot-1'})).status,200);
 assert.equal((await call({provider:'test',phase:'finalize',snapshotId:'snapshot-1'})).status,200);
 assert.equal(execute([{sql:`SELECT COUNT(*) AS count FROM locations WHERE removed_at IS NULL`}])[0].results[0].count,2);
 assert.equal(execute([{sql:`SELECT removed_at FROM locations WHERE source_id='old'`}])[0].results[0].removed_at!==null,true);
 await call({provider:'test',phase:'begin',snapshotId:'snapshot-2',expectedCount:2});
 await call({provider:'test',snapshotId:'snapshot-2',status:'failed',error:'fetch incomplete'});
 assert.equal((await call({provider:'test',phase:'finalize',snapshotId:'snapshot-2'})).status,409);
 assert.equal(execute([{sql:`SELECT COUNT(*) AS count FROM locations WHERE removed_at IS NULL`}])[0].results[0].count,2);
 assert.equal((await call({provider:'test',phase:'begin',snapshotId:'snapshot-3',expectedCount:2})).status,200);
 const browseFixtures=[
  ['ridb',{...record,sourceId:'browse-biking',name:'Browse 100%_Loop',activities:['Biking','Hiking'],country:'ZZ'}],
  ['ridb',{...record,sourceId:'browse-hiking',name:'Browse Alpha',activities:['Hiking']}],
  ['openbeta',{...record,sourceId:'browse-climbing',name:'browse alpha',activities:['climbing'],activityEvidence:{path:['USA','Colorado','Boulder']}}],
  ['openskidata',{...record,sourceId:'browse-abandoned',name:'Browse Closed Ski',activities:['downhill_skiing'],activityEvidence:{sourceStatus:'abandoned'}}],
  ['curated',{...record,sourceId:'browse-bikepacking',name:'Browse Bikepacking',activities:['bikepacking']}],
  ['ridb',{...record,sourceId:'browse-removed',name:'Browse Removed',activities:['Biking']}],
 ];
 for(const [provider,row] of browseFixtures)execute([{sql:UPSERT_LOCATION,args:normalizeRecord(provider,row,'browse-fixtures')}]);
 execute([{sql:`UPDATE locations SET removed_at='2026-10-23' WHERE source_id='browse-removed'`}]);
 const browse=async params=>{const response=await handleLocationApi(new Request('https://example.org/api/browse?'+new URLSearchParams(params)),realEnv);assert.equal(response.status,200);return response.json();};
 const all=await browse({q:'Browse'});assert.equal(all.total,5);assert.equal(all.limit,50);assert.equal(all.offset,0);assert.equal(all.activities.length,7);assert.deepEqual(all.providers,['curated','openbeta','openskidata','ridb','test']);assert.ok(all.locations.some(r=>r.activityEvidence.sourceStatus==='abandoned'));
 const parentArea=await browse({q:'Boulder'});assert.equal(parentArea.total,1);assert.equal(parentArea.locations[0].sourceId,'browse-climbing');assert.equal((await browse({q:'Colorado',activity:'Climbing'})).total,1);
 const bikes=await browse({activity:'Biking'});assert.equal(bikes.total,1);assert.equal(bikes.locations[0].sourceId,'browse-biking');
 const bikepacks=await browse({activity:'Bikepacking'});assert.equal(bikepacks.total,1);assert.equal(bikepacks.locations[0].sourceId,'browse-bikepacking');
 assert.equal((await browse({activity:'Climbing'})).locations[0].provider,'openbeta');assert.equal((await browse({activity:'Skiing',provider:'openskidata',q:'Browse'})).total,1);
 assert.equal((await browse({q:'  %_  '})).total,1);assert.equal((await browse({q:"' OR 1=1 --"})).total,0);assert.equal((await browse({q:'ZZ'})).locations[0].sourceId,'browse-biking');
 const page1=await browse({q:'Browse',limit:'2'}),page2=await browse({q:'Browse',limit:'2',offset:'2'});assert.deepEqual([...page1.locations,...page2.locations].map(r=>r.id),all.locations.slice(0,4).map(r=>r.id));
 assert.equal((await browse({q:'Browse',offset:'1000000'})).locations.length,0);
 for(const params of [{limit:'101'},{limit:'1.5'},{offset:'-1'},{offset:'1000001'},{provider:"x' OR 1=1"},{activity:'Unsupported'},{q:'x'.repeat(201)}])assert.equal((await handleLocationApi(new Request('https://example.org/api/browse?'+new URLSearchParams(params)),realEnv)).status,400);
 const lookup=id=>handleLocationApi(new Request('https://example.org/api/location?'+new URLSearchParams({id})),realEnv);
 const exact=await lookup(JSON.stringify(['ridb','browse-biking']));assert.equal(exact.status,200);const found=await exact.json();assert.equal(found.location.id,JSON.stringify(['ridb','browse-biking']));assert.equal(found.location.sourceId,'browse-biking');assert.equal(found.location.provider,'ridb');assert.deepEqual(found.location.activities,['Biking','Hiking']);
 assert.equal((await lookup(JSON.stringify(['ridb','browse-removed']))).status,410);
 assert.equal((await lookup(JSON.stringify(['missing','record']))).status,404);
 assert.equal((await lookup("' OR 1=1 --")).status,404);
 for(const id of ['','   ','x'.repeat(1025)])assert.equal((await lookup(id)).status,400);
 assert.equal((await handleLocationApi(new Request('https://example.org/api/location'),realEnv)).status,400);
 assert.equal((await handleLocationApi(new Request('https://example.org/api/location?id=anything',{method:'POST'}),realEnv)).status,405);
 console.log('Exact location lookup SQLite tests passed: stable JSON IDs, source provenance, missing/removed records, bound SQL literals and validation.');
 console.log('Browse API SQLite tests passed: no-origin directory, source provenance/status, exact Biking/Bikepacking aliases, literal wildcard/country search, stable pagination, removed-row exclusion and bounded query validation.');
 console.log('Staged snapshot API tests passed against real SQLite: provider lock, ownership, retry deduplication, incomplete retention, atomic finalization, retirement and failed snapshot recovery.');
}finally{rmSync(directory,{recursive:true,force:true});}
