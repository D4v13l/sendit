import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeSki,normalizeOpenBeta,validCoordinate} from './backend/ingestion/normalize.mjs';
test('content hashes are not durable identifiers; downhill is not backcountry',()=>{
 const f={properties:{id:'volatile',name:'Test',activities:['downhill'],sources:[],viewportHint:{center:[1,2]}}};assert.equal(normalizeSki(f,'now'),null);f.properties.sources=[{type:'openstreetmap',id:'way/1'}];const r=normalizeSki(f,'now');assert.deepEqual(r.activities,['downhill_skiing']);assert.equal(r.camp,'unknown');assert.equal(r.sourceId,'openstreetmap:way/1');
});
test('OpenBeta rejects broad parent regions, bogus coordinates and zero-route areas',()=>{
 const a={uuid:'abc',area_name:'Cliff',metadata:{lat:42,lng:-71,leaf:true},totalClimbs:2,pathTokens:['USA']};assert.equal(normalizeOpenBeta(a,'now').sourceId,'abc');a.metadata.leaf=false;assert.equal(normalizeOpenBeta(a,'now'),null);assert.equal(validCoordinate(91,0),false);
});
test('real snapshots contain unique valid sourced records with conservative access facts',async()=>{
 for(const provider of ['openskidata','openbeta']){let s;try{s=JSON.parse(await readFile(new URL(`./data/${provider}.json`,import.meta.url),'utf8'));}catch(e){if(provider==='openbeta'&&e.code==='ENOENT')continue;throw e;}assert.ok(s.records.length>1000);assert.equal(new Set(s.records.map(r=>r.sourceId)).size,s.records.length);for(const r of s.records){assert.ok(validCoordinate(r.lat,r.lon));assert.ok(r.name&&r.sourceUrl.startsWith('https://')&&r.license);assert.equal(r.camp,'unknown');assert.equal(r.access,'unknown');assert.ok(!r.activities.includes('backcountry_skiing'));}}
});
test('Worker pages are bounded and never retire unseen rows',async()=>{
 const {refreshOpenBetaPage}=await import('./backend/ingestion/worker-adapter.mjs');const sent=[];
 const area={uuid:'abc',area_name:'Cliff',metadata:{lat:42,lng:-71,leaf:true},totalClimbs:2,pathTokens:['USA']};
 const result=await refreshOpenBetaPage({ingest:async b=>sent.push(b),fetcher:async()=>({ok:true,json:async()=>({data:{areas:[area]}})})});assert.equal(result.finished,true);assert.equal(sent[0].completeSnapshot,false);assert.equal(sent[0].records.length,1);
 await assert.rejects(refreshOpenBetaPage({limit:1001,ingest:async()=>{}}),/Invalid bounded page/);
});
test('ski evidence retains operating status without inferring outdoor terrain',async()=>{
 const s=JSON.parse(await readFile(new URL('./data/openskidata.json',import.meta.url),'utf8'));for(const r of s.records){assert.equal(r.activityEvidence.sourceStatus,r.status);assert.equal(r.activityEvidence.outdoor,'unknown');}
});
test('RIDB activities derive solely from explicit recreation area joins',async()=>{
 const s=JSON.parse(await readFile(new URL('./data/ridb.json',import.meta.url),'utf8'));assert.ok(s.count>1000);assert.equal(new Set(s.records.map(r=>r.sourceId)).size,s.count);
 const map={'HIKING':'Hiking','HIKING TRAIL':'Hiking','TRAILS, DIFFICULT HIKING':'Hiking','BIKING':'Biking','MOUNTAIN BIKING':'Biking','BACKPACKING':'Backpacking'};
 for(const r of s.records){assert.ok(validCoordinate(r.lat,r.lon));assert.equal(r.camp,'unknown');assert.equal(r.access,'unknown');assert.equal(r.activityEvidence.entityType,'Rec Area');assert.deepEqual([...new Set(r.activityEvidence.activities.map(e=>map[e.name]))].sort(),r.activities);assert.ok(!r.activities.includes('Bikepacking'));}
 assert.ok(s.records.some(r=>r.activities.includes('Backpacking')));assert.ok(s.records.some(r=>r.activities.includes('Biking')));
});
test('Worker RIDB normalization preserves explicit activity distinctions',async()=>{
 const {normalizeRidb}=await import('./backend/ingestion/ridb-normalize.mjs');
 const areas=[{RecAreaID:'1',RecAreaName:'Park',RecAreaLatitude:42,RecAreaLongitude:-71,Enabled:true}];const dictionary=[{ActivityID:5,ActivityName:'BIKING'},{ActivityID:14,ActivityName:'HIKING'},{ActivityID:100036,ActivityName:'BACKPACKING'}];
 const joins=[{EntityID:'1',EntityType:'Rec Area',ActivityID:5},{EntityID:'1',EntityType:'Facility',ActivityID:100036},{EntityID:'1',EntityType:'Rec Area',ActivityID:14}];const rows=normalizeRidb(areas,dictionary,joins,'now');assert.deepEqual(rows[0].activities,['Biking','Hiking']);assert.equal(rows[0].camp,'unknown');areas[0].Enabled=false;assert.equal(normalizeRidb(areas,dictionary,joins,'now').length,0);
});
