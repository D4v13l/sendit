import test from 'node:test';
import assert from 'node:assert/strict';
import {extractJSON,findTabId,resultText,createBrowserTransport,BridgeError,isBlocking,SERVER} from '../src/bridge.mjs';
import {searchPlaces,placeLabel} from '../src/places.mjs';
import {visibleLabels,labelThreshold,placeLabels} from '../src/basemap.mjs';
import {createRegionClient} from '../../public/services.mjs';

const text=t=>({content:[{type:'text',text:t}]});

test('page text JSON is recovered with surrounding browser chrome',()=>{
 assert.deepEqual(extractJSON('{"a":1}'),{a:1});
 assert.deepEqual(extractJSON('Title: api.open-meteo.com\nURL: https://x\n\n[{"a":1},{"b":2}]\nPretty-print'),[{a:1},{b:2}]);
 assert.deepEqual(extractJSON('{"title":"x","text":"{\\"code\\":\\"Ok\\"}"}'),{code:'Ok'});
 assert.deepEqual(extractJSON('{"text":"no data here"}'),undefined);
 assert.deepEqual(extractJSON('{"code":"Ok","durations":[[0]]}'),{code:'Ok',durations:[[0]]});
 assert.equal(extractJSON('<html>loading</html>'),undefined);
});

test('tab ids are read from structured or text results',()=>{
 assert.equal(findTabId({payload:{tabId:7}}),7);
 assert.equal(findTabId(text('Opened new tab. tabId: 42')),42);
 assert.equal(findTabId(text('Opened tab 9 at https://x')),9);
 assert.equal(findTabId(text('done')),null);
 assert.equal(resultText({payload:{a:1}}),'{"a":1}');
});

function fakeBrowser(pages,{failNavigate=false}={}){
 const calls=[];let url=null,active=0;
 return {calls,mcp:{async callTool(server,tool,input){
  assert.equal(server,SERVER);calls.push([tool,input]);
  active++;assert.equal(active,1,'calls must not overlap');await new Promise(r=>setTimeout(r,5));active--;
  if(tool==='preview_start'){url=input.url;return text('Opened tab. tabId: 3')}
  if(tool==='navigate'){if(failNavigate)throw {code:'tool_error',message:'No tab with id 3'};url=input.url;return text('ok')}
  if(tool==='get_page_text')return text('Page: '+url+'\n'+pages(url));
 }}};
}

test('transport opens one tab, reuses it, and never overlaps calls',async()=>{
 const b=fakeBrowser(u=>JSON.stringify({u}));const t=createBrowserTransport(b.mcp);
 const [x,y]=await Promise.all([t('https://api.open-meteo.com/v1/forecast?a=1'),t('https://router.project-osrm.org/table/v1/driving/1,2;3,4')]);
 assert.equal(x.u,'https://api.open-meteo.com/v1/forecast?a=1');assert.equal(y.u,'https://router.project-osrm.org/table/v1/driving/1,2;3,4');
 assert.deepEqual(b.calls.map(c=>c[0]),['preview_start','get_page_text','navigate','get_page_text']);
 assert.equal(b.calls[2][1].tabId,3);assert.equal(b.calls[3][1].tabId,3);
});

test('transport refuses other hosts and surfaces API errors',async()=>{
 const t=createBrowserTransport(fakeBrowser(()=>'{"error":true,"reason":"Latitude must be in range"}').mcp);
 await assert.rejects(t('https://example.com/x'),e=>e instanceof BridgeError&&e.code==='bad_request');
 await assert.rejects(t('https://api.open-meteo.com/v1/forecast'),/Latitude must be in range/);
});

test('a closed tab is replaced once; lifecycle errors keep their code',async()=>{
 const b=fakeBrowser(()=>'{"ok":1}',{failNavigate:true});const t=createBrowserTransport(b.mcp);
 await t('https://api.open-meteo.com/v1/forecast?a');await t('https://api.open-meteo.com/v1/forecast?b');
 assert.deepEqual(b.calls.map(c=>c[0]),['preview_start','get_page_text','navigate','preview_start','get_page_text']);
 const denied=createBrowserTransport({callTool:async()=>{throw {code:'server_not_connected',message:'no host'}}});
 await assert.rejects(denied('https://api.open-meteo.com/v1/forecast'),e=>isBlocking(e)&&e.code==='server_not_connected');
});

test('unreadable pages fail after bounded retries',async()=>{
 const t=createBrowserTransport(fakeBrowser(()=>'<p>Loading…</p>').mcp,{wait:async()=>{}});
 await assert.rejects(t('https://api.open-meteo.com/v1/forecast'),e=>e.code==='unreadable');
});

test('shared region client works unchanged over the browser transport',async()=>{
 const forecast=i=>({latitude:i,daily:{time:[]},hourly:{time:[]}});
 const t=createBrowserTransport(fakeBrowser(u=>u.includes('open-meteo')?JSON.stringify([forecast(1),forecast(2)]):JSON.stringify({code:'Ok',durations:[[0,3600,9000]],sources:[{distance:5}],destinations:[{distance:5},{distance:20},{distance:30}]})).mcp);
 const client=createRegionClient(t),regions=[{id:'a',point:[47,-121],road:[47,-121]},{id:'b',point:[48,-121],road:[48,-121]}];
 const w=await client.weather(regions);assert.equal(w.a.latitude,1);assert.equal(w.b.latitude,2);
 assert.deepEqual(await client.routes({lat:47.6,lon:-122.3},regions),{a:3600,b:9000});
});

test('offline place search ranks exact names and narrows by region codes',()=>{
 const rows=[['Boulder','US','CO',107349,40.015,-105.27],['Boulder','AU','08',4870,-30.78,121.49],['Boulder City','US','NV',16207,35.98,-114.83],['Zürich','CH','25',341730,47.37,8.55]];
 const entries=rows.map(row=>({row,key:row[0].normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase()}));
 assert.deepEqual(searchPlaces(entries,'boulder').map(r=>r[1]),['US','AU','US']);
 assert.deepEqual(searchPlaces(entries,'Boulder, AU').map(r=>r[1]),['AU']);
 assert.deepEqual(searchPlaces(entries,'boulder co').map(r=>r[2]),['CO']);
 assert.equal(searchPlaces(entries,'zurich')[0][0],'Zürich');
 assert.equal(placeLabel(rows[0]),'Boulder, CO, US');assert.equal(placeLabel(rows[1]),'Boulder, AU');
});

test('city labels thin out with zoom and stay inside the view',()=>{
 const cities=[['Big','US','CO',3e6,40,-105],['Mid','US','CO',2e5,40.1,-105.1],['Small','US','CO',2e4,40.2,-105.2],['Away','US','CO',5e6,10,10]];
 const box={south:39,north:41,west:-106,east:-104};
 assert.deepEqual(visibleLabels(cities,box,3).map(c=>c[0]),['Big']);
 assert.deepEqual(visibleLabels(cities,box,9).map(c=>c[0]),['Big','Mid','Small']);
 assert.ok(labelThreshold(4)>labelThreshold(8));
});

test('overlapping city labels yield to the more populous one',()=>{
 const c=[['Seattle','US','WA',7e5,0,0],['Shoreline','US','WA',5e4,0,0],['Bellevue','US','WA',1.4e5,0,0]];
 const px={Seattle:{x:100,y:100},Shoreline:{x:105,y:96},Bellevue:{x:100,y:140}};
 assert.deepEqual(placeLabels(c,x=>px[x[0]]).map(x=>x[0]),['Seattle','Bellevue']);
 assert.equal(placeLabels(c,x=>px[x[0]],1).length,1);
});
