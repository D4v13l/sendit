import test from 'node:test';
import assert from 'node:assert/strict';
import {extractJSON,findTabId,resultText,createBrowserTransport,BridgeError,isBlocking,SERVER,answers,forecastChunks} from '../src/bridge.mjs';
import {searchPlaces,placeLabel} from '../src/places.mjs';
import {visibleLabels,labelThreshold,placeLabels,showRange,showPeak,showParkLabel} from '../src/basemap.mjs';
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

// Minimal service-shaped answers, keyed to the request so stale pages are detectable.
const meteo=u=>{const q=new URL(u),la=q.searchParams.get('latitude').split(',').map(Number),lo=q.searchParams.get('longitude').split(',').map(Number);const a=la.map((v,i)=>({latitude:v,longitude:lo[i],daily:{time:[]},hourly:{time:[]}}));return JSON.stringify(a.length===1?a[0]:a)};
const osrm=u=>{const n=u.split('/').pop().split(';').length;return JSON.stringify({code:'Ok',durations:[Array.from({length:n},(_,i)=>i*600)],sources:[{distance:1}],destinations:Array.from({length:n},()=>({distance:1}))})};
const service=u=>u.includes('open-meteo')?meteo(u):osrm(u);
const F='https://api.open-meteo.com/v1/forecast?forecast_days=2&latitude=';

test('transport opens one tab, reuses it, and never overlaps calls',async()=>{
 const b=fakeBrowser(service);const t=createBrowserTransport(b.mcp);
 const [x,y]=await Promise.all([t(F+'47&longitude=-121'),t('https://router.project-osrm.org/table/v1/driving/1,2;3,4')]);
 assert.equal(x.latitude,47);assert.equal(y.durations[0].length,2);
 assert.deepEqual(b.calls.map(c=>c[0]),['preview_start','get_page_text','navigate','get_page_text']);
 assert.equal(b.calls[2][1].tabId,3);assert.equal(b.calls[3][1].tabId,3);
});

test('transport refuses other hosts and surfaces API errors',async()=>{
 const t=createBrowserTransport(fakeBrowser(()=>'{"error":true,"reason":"Latitude must be in range"}').mcp);
 await assert.rejects(t('https://example.com/x'),e=>e instanceof BridgeError&&e.code==='bad_request');
 await assert.rejects(t(F+'95&longitude=0'),/Latitude must be in range/);
});

test('a closed tab is replaced once; lifecycle errors keep their code',async()=>{
 const b=fakeBrowser(service,{failNavigate:true});const t=createBrowserTransport(b.mcp);
 await t(F+'47&longitude=-121');await t(F+'48&longitude=-121');
 assert.deepEqual(b.calls.map(c=>c[0]),['preview_start','get_page_text','navigate','preview_start','get_page_text']);
 const denied=createBrowserTransport({callTool:async()=>{throw {code:'server_not_connected',message:'no host'}}});
 await assert.rejects(denied(F+'47&longitude=-121'),e=>isBlocking(e)&&e.code==='server_not_connected');
});

test('unreadable pages fail after bounded retries',async()=>{
 const t=createBrowserTransport(fakeBrowser(()=>'<p>Loading…</p>').mcp,{wait:async()=>{}});
 await assert.rejects(t(F+'47&longitude=-121'),e=>e.code==='unreadable');
});

test('shared region client works unchanged over the browser transport',async()=>{
 const t=createBrowserTransport(fakeBrowser(service).mcp);
 const client=createRegionClient(t),regions=[{id:'a',point:[47,-121],road:[47,-121]},{id:'b',point:[48,-121],road:[48,-121]}];
 const w=await client.weather(regions);assert.equal(w.a.latitude,47);assert.equal(w.b.latitude,48);
 assert.deepEqual(await client.routes({lat:47.6,lon:-122.3},regions),{a:600,b:1200});
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

test('city labels never go below 100k and thin out further when zoomed out',()=>{
 const cities=[['Big','US','CO',3e6,40,-105],['Mid','US','CO',2e5,40.1,-105.1],['Small','US','CO',8e4,40.2,-105.2],['Away','US','CO',5e6,10,10]];
 const box={south:39,north:41,west:-106,east:-104};
 assert.deepEqual(visibleLabels(cities,box,3).map(c=>c[0]),['Big']);
 assert.deepEqual(visibleLabels(cities,box,12).map(c=>c[0]),['Big','Mid']);
 for(let z=0;z<=18;z++)assert.ok(labelThreshold(z)>=1e5);
});

test('relief and park labels appear only at useful zooms',()=>{
 assert.ok(!showRange(2,4)&&showRange(2,5)&&!showRange(6,6)&&showRange(6,8)&&!showRange(2,10));
 assert.ok(!showPeak(5,6)&&showPeak(5,7)&&!showPeak(7,7)&&showPeak(7,8)&&showPeak(9,9));
 assert.ok(!showParkLabel(6)&&showParkLabel(7));
});

test('overlapping labels yield to earlier, higher-priority ones',()=>{
 const items=[{kind:'city',text:'Seattle'},{kind:'park',text:'Olympic National Park'},{kind:'city',text:'Shoreline'},{kind:'peak',text:'Mount Rainier 14,409 ft'},{kind:'range',text:'Cascade Range'}];
 const px={Seattle:{x:100,y:100},'Olympic National Park':{x:20,y:100},Shoreline:{x:105,y:96},'Mount Rainier 14,409 ft':{x:120,y:160},'Cascade Range':{x:160,y:162}};
 const placed=placeLabels(items,i=>px[i.text]);
 assert.deepEqual(placed.map(i=>i.text),['Seattle','Olympic National Park','Mount Rainier 14,409 ft','Cascade Range']);
 assert.deepEqual(placed.map(i=>i.side+i.dy),['right0','centre0','right0','centre16']);
 // A marker on the right of a city pushes its name to the left.
 assert.equal(placeLabels([{kind:'city',text:'Kent'}],()=>({x:100,y:100}),60,[{l:110,r:140,t:90,b:110}])[0].side,'left');
 assert.equal(placeLabels(items,i=>px[i.text],1).length,1);
});

test('answers() rejects a page left over from the previous request',()=>{
 const two=F+'47,48&longitude=-121,-122';
 assert.ok(answers(two,JSON.parse(meteo(two))));
 assert.ok(!answers(two,JSON.parse(osrm('https://router.project-osrm.org/table/v1/driving/1,2;3,4'))));
 assert.ok(!answers(two,JSON.parse(meteo(F+'40,41&longitude=-105,-106'))));
 assert.ok(!answers('https://router.project-osrm.org/table/v1/driving/1,2;3,4;5,6',JSON.parse(osrm('https://router.project-osrm.org/table/v1/driving/1,2;3,4'))));
 assert.ok(answers(F+'95&longitude=0',{error:true,reason:'Latitude must be in range'}));
});

test('a stale page is re-read until the new answer appears',async()=>{
 let reads=0;const pages=u=>++reads<3?osrm('https://router.project-osrm.org/table/v1/driving/1,2;3,4'):meteo(u);
 const t=createBrowserTransport(fakeBrowser(pages).mcp,{wait:async()=>{}});
 assert.equal((await t(F+'47&longitude=-121')).latitude,47);assert.equal(reads,3);
 const stuck=createBrowserTransport(fakeBrowser(()=>osrm('https://router.project-osrm.org/table/v1/driving/1,2;3,4')).mcp,{wait:async()=>{}});
 await assert.rejects(stuck(F+'47&longitude=-121'),e=>e.code==='stale');
});

test('long forecast requests are chunked and cut-off pages are split',async()=>{
 const many=n=>'https://api.open-meteo.com/v1/forecast?hourly=temperature_2m&forecast_days=16&latitude='+Array.from({length:n},(_,i)=>40+i).join(',')+'&longitude='+Array.from({length:n},()=>-105).join(',');
 assert.deepEqual(forecastChunks(many(13)).map(u=>new URL(u).searchParams.get('latitude').split(',').length),[3,3,3,3,1]);
 assert.equal(forecastChunks(F+'47,48&longitude=-121,-122').length,1);
 // Day trips skip hourly data, so far more points fit in one request.
 assert.deepEqual(forecastChunks(many(64).replace('hourly=temperature_2m&','').replace('forecast_days=16','forecast_days=2')).map(u=>new URL(u).searchParams.get('latitude').split(',').length),[47,17]);
 // A page cap of ~2 points: every 3-point chunk comes back cut off and is halved.
 const points=u=>new URL(u).searchParams.get('latitude').split(',').length;
 const capped=u=>{const full=meteo(u);return points(u)>2?full.slice(0,-8).padEnd(2100,' '):full};
 const b=fakeBrowser(capped);const t=createBrowserTransport(b.mcp,{wait:async()=>{}});
 const out=await t(many(7));assert.equal(out.length,7);assert.deepEqual(out.map(f=>f.latitude),[40,41,42,43,44,45,46]);
 const loaded=b.calls.filter(c=>c[0]!=='get_page_text').map(c=>points(c[1].url));
 assert.deepEqual(loaded,[3,2,1,3,2,1,1]);
 await assert.rejects(createBrowserTransport(fakeBrowser(u=>meteo(u).slice(0,-8).padEnd(2100,' ')).mcp,{wait:async()=>{}})(F+'47&longitude=-121'),e=>e.code==='too_large');
});

import {closureNotice,managerName} from '../src/notices.mjs';
import {regions as curatedRegions} from '../../public/catalog.mjs';

test('closure links point at the managing agency for every curated region',()=>{
 const byId=Object.fromEntries(curatedRegions.map(r=>[r.id,closureNotice(r)]));
 assert.equal(byId.snoqualmie.url,'https://www.fs.usda.gov/r06/mbs/alerts');assert.equal(byId.snoqualmie.managerUrl,'https://www.fs.usda.gov/r06/mbs/recreation');
 assert.equal(byId['snowy-range'].url,'https://www.fs.usda.gov/r02/mbrtb/alerts');
 assert.equal(byId.rainier.url,'https://www.nps.gov/mora/planyourvisit/conditions.htm');assert.equal(byId.rainier.managerUrl,'https://www.nps.gov/mora/planyourvisit/paradise.htm');
 assert.equal(byId.catskills.url,'https://dec.ny.gov/things-to-do/hiking/catskill-backcountry-information');assert.equal(byId.catskills.derived,false);
 assert.deepEqual([byId.teanaway.url,byId.teanaway.label],['https://www.dnr.wa.gov/Teanaway','Washington DNR notices']);
 assert.equal(byId['blue-mountains'].label,'NSW National Parks notices');
 for(const [id,n] of Object.entries(byId)){assert.match(n.url,/^https:\/\//,id);assert.ok(n.managerUrl,id);assert.doesNotMatch(n.label,/^[a-z0-9.-]+\.[a-z]{2,} notices$/,id+' has no manager name')}
 assert.equal(managerName('https://www.parks.ca.gov/?page_id=471'),'California State Parks');
});

import {gradientGrid,sampleGrid,tierColor,canvasSize,paintGradient,SCORE} from '../src/gradient.mjs';
import {hillshade} from '../src/hillshade.mjs';
import {showRoadLabel} from '../src/basemap.mjs';

test('weather grid is square on the ground and centred on the origin',()=>{
 const g=gradientGrid({lat:47.6,lon:-122.3});
 assert.equal(g.points.length,64);assert.equal(new Set(g.points.map(p=>p.id)).size,64);
 assert.ok(Math.abs((g.bounds.north+g.bounds.south)/2-47.6)<1e-9&&Math.abs((g.bounds.east+g.bounds.west)/2+122.3)<1e-9);
 assert.ok(g.bounds.east-g.bounds.west>g.bounds.north-g.bounds.south,'longitude span widens with latitude');
 assert.deepEqual(g.points[0].point,[+g.bounds.north.toFixed(3),+g.bounds.west.toFixed(3)]);
});

test('interpolation blends known samples and never invents unknown ones',()=>{
 const v=[0,2,null,null];
 assert.equal(sampleGrid(v,2,0.5,0),1);assert.equal(sampleGrid(v,2,0.5,0.9),1,'between rows, only known corners count');assert.equal(sampleGrid(v,2,0.5,1),null,'on an unranked row nothing is invented');
 assert.equal(sampleGrid([null,null,null,null],2,0.5,0.5),null);
 assert.equal(sampleGrid([2,2,2,2],2,0.3,0.7),2);
 assert.deepEqual(tierColor(0),[170,64,53]);assert.deepEqual(tierColor(1),[228,177,47]);assert.deepEqual(tierColor(2),[40,115,76]);
 assert.deepEqual(SCORE,{poor:0,passable:1,excellent:2});
});

test('painted surface follows the samples and leaves unranked areas clear',()=>{
 const bounds={south:46,north:48,west:-123,east:-121},{width,height}=canvasSize(bounds,40),data=new Uint8ClampedArray(width*height*4);
 assert.ok(height>40,'Mercator rows are taller than columns at this latitude');
 paintGradient(data,width,height,[0,2,null,null],2,bounds,0.5);
 const px=(x,y)=>[...data.slice((y*width+x)*4,(y*width+x)*4+4)];
 const row=Math.floor(height/2);assert.ok(px(4,row)[0]>px(width-5,row)[0],'west (poor) is redder than east (excellent)');
 const mid=Math.floor(height/2);assert.equal(px(Math.floor(width/2),mid)[3],128,'full strength inside');assert.ok(px(0,mid)[3]<40,'edges fade out');
});

test('hillshade darkens only slopes facing away from the light',()=>{
 const flat=new Float32Array(25).fill(500),sea=new Float32Array(25).fill(-40);
 assert.ok(hillshade(flat,5,5,()=>90).every(v=>v===255));assert.ok(hillshade(sea,5,5,()=>90).every(v=>v===255));
 const away=new Float32Array(25).map((_,i)=>800-(i%5)*120),toward=new Float32Array(25).map((_,i)=>200+(i%5)*120);
 assert.ok(hillshade(away,5,5,()=>90)[12]<230);assert.equal(hillshade(toward,5,5,()=>90)[12],255);
});

test('route plates appear only when zoomed in',()=>{assert.ok(!showRoadLabel(3,6)&&showRoadLabel(3,7)&&!showRoadLabel(6,7)&&showRoadLabel(6,8))});
