import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoServer} from '../demo/server.js';

test('offline demo searches, pages, sorts, and loads trail and climbing records through client',async t=>{
  const server=createDemoServer({offline:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  const origin=`http://127.0.0.1:${server.address().port}`;
  const get=async path=>{const r=await fetch(origin+path);assert.equal(r.status,200);return r.json();};
  assert.deepEqual(await get('/api/config'),{offline:true});
  const search=await get('/api/search?site=hike&q=a&sort=length');
  assert.equal(search.items[0].title,'North Ridge Traverse');
  assert.equal(search.total,3);
  const next=await get('/api/search?site=hike&q=a&sort=length&from=2');
  assert.equal(next.items[0].title,'Creekside Path');
  const trail=await get('/api/route?site=hike&id=9000001');
  assert.equal(trail.type,'Feature');
  assert.equal(trail.geometry.coordinates.length,7);
  const climb=await get('/api/route?site=climb&id=9000001');
  assert.equal(climb.pitches,2);
  assert.equal((await fetch(origin+'/api/search?site=unknown&q=a')).status,400);
  assert.equal((await fetch(origin+'/api/route?site=hike&id=../../etc')).status,400);
  assert.equal((await fetch(origin+'/api/anything')).status,404);
  assert.equal((await fetch(origin+'/api/config',{method:'POST'})).status,405);
  const page=await fetch(origin+'/');assert.match(page.headers.get('content-security-policy'),/script-src 'self'/);
});
