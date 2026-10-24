import test from 'node:test';
import assert from 'node:assert/strict';
import { AdventureClient, ApiError, UnsupportedCapabilityError, SchemaError, routeId } from '../src/index.js';

// Only the external transport is substituted; requests and parsers are real.
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {status, headers: {'content-type':'application/json', ...headers}});
const trail = {type:'Feature',geometry:{type:'LineString',coordinates:[[-68.1,44.3],[-68.2,44.4]]},properties:{id:7019235,title:'Test loop',length:5850,ascent:100,descent:-100,diff:'blue'}};
const hit = (id) => ({_id:`trails.${id}`,_source:{id:`trails.${id}`,type:'Route',title:'Test',url:`https://www.hikingproject.com/trail/${id}/test`}});
const search = (hits, total = hits.length) => ({total:{value:total,relation:'eq'},hits});
const client = (fetch, site = 'hike', options = {}) => new AdventureClient({site,fetch,minIntervalMs:0,...options});

test('constructs encoded POST search with supported sort and normalizes hits', async () => {
  const c = client(async (url, init) => {
    assert.equal(new URL(url).searchParams.get('q'), 'rock & snow');
    assert.equal(new URL(url).searchParams.get('from'), '2');
    assert.equal(new URL(url).searchParams.get('limit'), '3');
    assert.equal(init.method, 'POST');
    assert.equal(init.credentials, 'omit');
    assert.deepEqual(JSON.parse(init.body), {types:['Route'],filter:[],sort:[{field:'rating',order:'desc'}]});
    return json(search([hit(123)], 10));
  });
  const r = await c.search('rock & snow', {from:2,limit:3,sort:[{field:'rating',order:'desc'}]});
  assert.equal(r.items[0].title, 'Test');
  assert.equal(r.total, 10);
  assert.equal(r.nextFrom, 3); // Advance by returned count, not requested count.
});
test('parks aliases hiking but does not pretend searches are park restricted', async () => {
  const c = client(async url => {assert.equal(new URL(url).host,'www.hikingproject.com');return json(trail);}, 'nationalparks');
  assert.equal((await c.getRoute(7019235)).geometry.coordinates.length,2);
});
test('climbing route stays a climbing record, not synthetic GeoJSON', async () => {
  const c = client(async () => json({id:105862912,title:'Serenity Crack',parent:{coordinates:[-119.5,37.7]},pitches:3,sections:[]}), 'climb');
  assert.equal((await c.getRoute(105862912)).pitches,3);
});
test('rejects unsupported elevation before sending any request', async () => {
  const c = client(async () => {throw new Error('must not fetch');}, 'ski');
  await assert.rejects(c.getElevationProfile(7000630), UnsupportedCapabilityError);
});
test('guards climbing-only resources', async () => {
  await assert.rejects(client(async()=>{throw new Error('must not fetch');}).getArea(8008454),UnsupportedCapabilityError);
});
test('retains raw elevation tuples without inventing undocumented units', async () => {
  const c=client(async url=>{assert.equal(new URL(url).searchParams.get('project'),'mtb');return json([[5000,5,0,3,-12500000,4400000]]);},'mtb');
  assert.deepEqual(await c.getElevationProfile(1),[[5000,5,0,3,-12500000,4400000]]);
});
test('returns conditions as inert text', async () => {
  const c=client(async()=>new Response('<div>Dry</div>',{headers:{'content-type':'text/html'}}));
  assert.equal(await c.getConditionsHtml(1),'<div>Dry</div>');
});
test('HTTP failures retain status and retry hint; no automatic retry', async () => {
  let calls=0;
  const c=client(async()=>{calls++;return new Response('busy',{status:429,headers:{'retry-after':'5'}});});
  await assert.rejects(c.getRoute(1), e=> e instanceof ApiError && e.status===429 && e.retryAfterMs===5000);
  assert.equal(calls,1);
});
test('rejects HTML success and malformed route JSON', async () => {
  await assert.rejects(client(async()=>new Response('<html>login</html>')).getRoute(1), SchemaError);
  await assert.rejects(client(async()=>json({})).getRoute(1), SchemaError);
  await assert.rejects(client(async()=>json({...trail,geometry:{type:'LineString',coordinates:[['bad',0]]}})).getRoute(1), SchemaError);
});
test('malformed search does not masquerade as empty results', async () => {
  await assert.rejects(client(async()=>json({hits:[]})).search('a'),SchemaError);
});
test('validates IDs, options, and unknown capabilities', async () => {
  const c=client(async()=>{throw new Error('must not fetch');});
  await assert.rejects(c.getRoute('../users'),TypeError);
  await assert.rejects(c.search('',{}),TypeError);
  await assert.rejects(c.search('a',{limit:0}),TypeError);
  await assert.rejects(c.search('a',{filter:[{}]}),TypeError);
  assert.throws(()=>client(fetch,'unknown'),TypeError);
});
test('bounded pagination advances offsets and stops at server total', async () => {
  const offsets=[];
  const c=client(async url=>{const from=Number(new URL(url).searchParams.get('from'));offsets.push(from);return json(search(from===0?[hit(1),hit(2)]:[hit(3)],3));});
  const ids=[];
  for await(const page of c.searchPages('a',{limit:2,maxPages:4})) ids.push(...page.items.map(x=>x.id));
  assert.deepEqual(ids,['trails.1','trails.2','trails.3']);
  assert.deepEqual(offsets,[0,2]);
});
test('already aborted request never reaches transport', async () => {
  const ac=new AbortController();ac.abort();
  await assert.rejects(client(async()=>{throw Error('must not fetch');}).getRoute(1,{signal:ac.signal}),e=>e.name==='AbortError');
});
test('timeout aborts an in-flight request', async () => {
  const c=client((_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})),'hike',{timeoutMs:10});
  await assert.rejects(c.getRoute(1),e=>e.name==='TimeoutError');
});
test('routeId extracts only route search identifiers and known-site URLs', () => {
  assert.equal(routeId('trails.7019235'),7019235);
  assert.equal(routeId('https://www.mountainproject.com/route/105862912/serenity-crack'),105862912);
  assert.throws(()=>routeId('areas.123'),TypeError);
  assert.throws(()=>routeId('https://evil.example/trail/1/test'),TypeError);
});

test('area and photo methods preserve child types and validate list responses',async()=>{
  const c=client(async url=>{
    const path=new URL(url).pathname;
    if(path==='/api/v2/areas/12')return json({id:12,title:'Crag',children:[{id:13,type:'Route',title:'Climb'}]});
    if(path==='/api/v2/routes/13/photos')return json([{id:14,url:'https://www.mountainproject.com/photo/14'}]);
    if(path==='/api/v2/areas/12/photos')return json([]);
    throw Error('Unexpected request path');
  },'climb');
  assert.equal((await c.getArea(12)).children[0].type,'Route');
  assert.equal((await c.getPhotos('route',13))[0].id,14);
  assert.deepEqual(await c.getPhotos('area',12),[]);
  await assert.rejects(c.getPhotos('unknown',12),TypeError);
  await assert.rejects(client(async()=>json({photos:[]}),'climb').getPhotos('route',1),SchemaError);
});
test('page cap stops even when upstream reports more hits',async()=>{
  let calls=0;
  const c=client(async()=>{calls++;return json(search([hit(calls)],999));});
  for await(const page of c.searchPages('a',{maxPages:2}))assert.equal(page.items.length,1);
  assert.equal(calls,2);
});
test('malformed JSON is reported as a schema error',async()=>{
  await assert.rejects(client(async()=>new Response('{',{headers:{'content-type':'application/json'}})).getRoute(1),SchemaError);
});
