import test from 'node:test';
import assert from 'node:assert/strict';
import {extractJSON,findTabId,resultText,createBrowserTransport,BridgeError,isBlocking,SERVER,answers,forecastChunks} from '../src/bridge.mjs';
import {searchPlaces,placeLabel} from '../src/places.mjs';
import {visibleLabels,labelThreshold,placeLabels,showRange,showPeak,showParkLabel} from '../src/basemap.mjs';
import {createRegionClient} from '../../public/services.mjs';
import {createRemote,originKey} from '../src/remote.mjs';

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
 assert.equal(findTabId(text("Opened the site in Claude's browser (tabId tab-2). Use read_page to see the page.")),'tab-2');
 assert.equal(findTabId({payload:{tabId:'tab-5'}}),'tab-5');
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
 assert.deepEqual(forecastChunks(many(13),40000).map(u=>new URL(u).searchParams.get('latitude').split(',').length),[3,3,3,3,1]);
 assert.equal(forecastChunks(F+'47,48&longitude=-121,-122').length,1);
 // A one-day request with the five hourly fields day trips use.
 const dayTrip=many(64).replace('hourly=temperature_2m','hourly=temperature_2m,precipitation,precipitation_probability,wind_gusts_10m,snowfall').replace('forecast_days=16','start_date=2026-10-27&end_date=2026-10-27');
 assert.deepEqual(forecastChunks(dayTrip).map(u=>new URL(u).searchParams.get('latitude').split(',').length),[22,22,20]);
 assert.equal(forecastChunks('https://marine-api.open-meteo.com/v1/marine?hourly=wave_height&start_date=2026-10-27&end_date=2026-10-27&latitude=1,2&longitude=3,4').length,1,'marine requests chunk too');
 // A page cap of ~2 points: every 3-point chunk comes back cut off and is halved.
 const points=u=>new URL(u).searchParams.get('latitude').split(',').length;
 const capped=u=>{const full=meteo(u);return points(u)>2?full.slice(0,-8).padEnd(2100,' '):full};
 const b=fakeBrowser(capped);const t=createBrowserTransport(b.mcp,{wait:async()=>{}});
 const out=await t(many(7));assert.equal(out.length,7);assert.deepEqual(out.map(f=>f.latitude),[40,41,42,43,44,45,46]);
 const loaded=b.calls.filter(c=>c[0]!=='get_page_text').map(c=>points(c[1].url));
 assert.deepEqual(loaded,[3,2,1,3,2,1,1],'chunks of 3, 3 and 1; each 3 is cut off and halves to 2 and 1');
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

import {driveTimes,secondsFor,AVERAGE_MPH,CIRCUITY} from '../src/drive.mjs';
import {elevationBands,BAND_M} from '../src/bands.mjs';

test('drive times are road distance at a 60 mph average, with a marked straight-line fallback',async()=>{
 assert.equal(AVERAGE_MPH,60);assert.equal(secondsFor(96.56064),3600);
 const origin={lat:47.606,lon:-122.332},regions=[{id:'a',road:[47.392,-121.399]},{id:'b',road:[46.75,-121.81]}];
 const road=async url=>{assert.match(url,/annotations=distance/);return {code:'Ok',distances:[[0,85000,140000]],sources:[{distance:20}],destinations:[{distance:20},{distance:50},{distance:30}]}};
 const r=await driveTimes(road,origin,regions);
 assert.deepEqual(r.a,{seconds:secondsFor(85),km:85,basis:'road'});assert.equal(r.b.basis,'road');
 const down=await driveTimes(async()=>{throw Error('offline')},origin,regions);
 assert.equal(down.a.basis,'estimate');assert.ok(Math.abs(down.a.km-74*CIRCUITY)<4,'straight line x circuity');
 const snapped=await driveTimes(async()=>({code:'Ok',distances:[[0,85000,140000]],sources:[{distance:20}],destinations:[{distance:20},{distance:50},{distance:25000}]}),origin,regions);
 assert.equal(snapped.a.basis,'road');assert.equal(snapped.b.basis,'estimate','gateway far from any road falls back');
 assert.ok(answers('https://router.project-osrm.org/table/v1/driving/1,2;3,4;5,6?sources=0&annotations=distance',{code:'Ok',distances:[[0,1,2]]}));
});

test('elevation bands split at 3,000 ft only when both sides carry real terrain',()=>{
 const grid=(fn)=>Array.from({length:400},(_,i)=>{const x=i%20,y=Math.floor(i/20);return {e:fn(x,y),lat:47+y/100,lon:-121+x/100,km:Math.hypot(x-10,y-10)}});
 const mixed=elevationBands(grid(x=>400+x*60));
 assert.ok(mixed.below&&mixed.above);assert.ok(mixed.below.m<BAND_M&&mixed.above.m>=BAND_M);
 assert.equal(mixed.minFt,Math.round(400*3.28084));assert.ok(Math.abs(mixed.below.share+mixed.above.share-1)<0.02);
 const low=elevationBands(grid(x=>x===19?1000:300));assert.ok(low.below&&!low.above,'5% above is not enough for its own band');
 assert.equal(elevationBands(grid(()=>-5)),null,'open water has no bands');
});

import {windowed,DAY_FROM,DAY_TO} from '../src/daytime.mjs';
import {rateSurf,hourScore,angle,tideTurns} from '../src/surf.mjs';
import {coastalRuns,sampleRun,exposure,travel} from '../src/coastline.mjs';
import {evaluate} from '../../public/engine.mjs';

// Hourly series for one date: fn(hour) -> value.
const hours=(date,fn)=>Array.from({length:24},(_,h)=>fn(h));
const day=(date,{temp=h=>12,rain=h=>0,prob=h=>10,gust=h=>15,snow=h=>0}={})=>({daily:{time:[date],temperature_2m_max:[30],temperature_2m_min:[-5],precipitation_sum:[40],precipitation_probability_max:[100],wind_gusts_10m_max:[90],snowfall_sum:[0]},
 hourly:{time:Array.from({length:24},(_,h)=>`${date}T${String(h).padStart(2,'0')}:00`),temperature_2m:hours(date,temp),precipitation:hours(date,rain),precipitation_probability:hours(date,prob),wind_gusts_10m:hours(date,gust),snowfall:hours(date,snow)}});

test('day trips are rated on 8 am-6 pm using end-of-hour accumulations',()=>{
 assert.deepEqual([DAY_FROM,DAY_TO],[8,18]);
 // Heavy rain overnight and at 08:00 (the 7-8 am hour) does not count; daytime is dry and mild.
 const f=day('2026-10-27',{rain:h=>h<=8?6:0,prob:h=>h<=8?100:10,temp:h=>h>=8&&h<=18?10+h/2:2,gust:h=>h<9?80:20});
 const w=windowed(f);
 assert.deepEqual([w.daily.precipitation_sum[0],w.daily.precipitation_probability_max[0],w.daily.wind_gusts_10m_max[0]],[0,10,20]);
 assert.deepEqual([w.daily.temperature_2m_min[0],w.daily.temperature_2m_max[0]],[14,19]);
 assert.equal(evaluate(w,'2026-10-27',1,'Hiking','none').level,'excellent');
 assert.equal(evaluate(f,'2026-10-27',1,'Hiking','none').level,'poor','the whole-day values would have rated it Poor');
 // Rain stamped 18:00 (the 5-6 pm hour) counts; 19:00 does not.
 assert.equal(windowed(day('2026-10-27',{rain:h=>h===18?20:0})).daily.precipitation_sum[0],20);
 assert.equal(windowed(day('2026-10-27',{rain:h=>h===19?20:0})).daily.precipitation_sum[0],0);
 const gap=day('2026-10-27');gap.hourly.precipitation[12]=null;assert.ok(Number.isNaN(windowed(gap).daily.precipitation_sum[0]),'missing hours stay unknown');
});

test('surf hours score size, period, swell direction and wind against the shore',()=>{
 assert.equal(angle(350,10),20);assert.equal(angle(90,270),180);
 const good={swell:1.5,period:12,swellDir:270,wind:8,windDir:90};
 assert.equal(hourScore(good,270).score,2);
 assert.equal(hourScore({...good,swell:0.3},270).score,0);
 assert.equal(hourScore({...good,period:6},270).score,0);
 assert.equal(hourScore({...good,swellDir:90},270).score,0,'swell from behind the coast');
 assert.equal(hourScore({...good,wind:20,windDir:90},270).score,2,'offshore wind holds the face');
 assert.equal(hourScore({...good,wind:20,windDir:270},270).score,0,'onshore wind');
 assert.equal(hourScore({...good,wind:15,windDir:0},270).score,1,'cross-shore wind');
 assert.equal(hourScore({...good,swell:null,wave:null},270).score,null);
});

test('a surf day is its best three-hour session and tides are reported',()=>{
 const date='2026-10-27',t=Array.from({length:24},(_,h)=>`${date}T${String(h).padStart(2,'0')}:00`);
 const marine={hourly:{time:t,wave_height:t.map(()=>1.6),swell_wave_height:t.map(()=>1.4),swell_wave_period:t.map(()=>12),swell_wave_direction:t.map(()=>275),sea_surface_temperature:t.map(()=>12),sea_level_height_msl:t.map((_,h)=>Math.sin(h/12.4*2*Math.PI))}};
 // Onshore wind except a calm 9-12 window.
 const wind={hourly:{time:t,wind_speed_10m:t.map((_,h)=>h>=9&&h<12?5:25),wind_direction_10m:t.map(()=>270),wind_gusts_10m:t.map(()=>30)}};
 const r=rateSurf(marine,wind,270,[date]);
 assert.equal(r.level,'excellent');assert.deepEqual([r.days[0].from,r.days[0].to],[9,12]);
 assert.ok(r.days[0].tides.length>=2&&r.days[0].tides.some(x=>x.high)&&r.days[0].tides.some(x=>!x.high));
 assert.equal(rateSurf(marine,{hourly:{...wind.hourly,wind_speed_10m:t.map(()=>25)}},270,[date]).level,'poor','onshore all day');
 assert.equal(rateSurf(null,wind,270,[date]).level,'unknown');
});

test('coastline sampling finds the seaward side and drops sheltered water',()=>{
 // A square island, counter-clockwise, as a quantization-free topology.
 const topo={type:'Topology',arcs:[[[0,0],[1,0],[1,1],[0,1],[0,0]]],objects:{countries:{type:'GeometryCollection',geometries:[{type:'Polygon',arcs:[[0]]}]}}};
 const runs=coastalRuns(topo);assert.equal(runs.length,1);
 const pts=sampleRun(runs[0],20),south=pts.find(p=>p.lat===0&&p.lon>0.2&&p.lon<0.8),east=pts.find(p=>p.lon===1&&p.lat>0.2&&p.lat<0.8);
 assert.ok(Math.abs(south.seaward-180)<1,'south shore faces south');assert.ok(Math.abs(east.seaward-90)<1,'east shore faces east');
 const [lon,lat]=travel([0,0],90,111.2);assert.ok(Math.abs(lon-1)<0.01&&Math.abs(lat)<0.01);
 assert.equal(exposure({lon:0,lat:0},90,()=>false),300,'open ocean');
 assert.ok(exposure({lon:0,lat:0},90,([x])=>x>0.3)<50,'land just offshore');
});

import {packTiles,tileRegions,tilesAround,eligible,tileKey,spreadByDistance,significance,cleanName} from '../src/catalog-tiles.mjs';
import {distanceKm as catalogDistance} from '../../public/catalog.mjs';

test('provider records pack into tiles and group like /api/locations',()=>{
 const ob=(id,name,lat,lon,path,climbs=5)=>({sourceId:id,name,lat,lon,activities:['climbing'],sourceUrl:'https://openbeta.io/area/'+id,activityEvidence:{path,totalClimbs:climbs}});
 const snaps={
  openbeta:{records:[ob('a','Upper Wall',47.80,-121.58,['USA','Washington','Central-West Cascades & Seattle','Index','Upper Town Wall']),ob('b','Lower Wall',47.79,-121.62,['USA','Washington','Central-West Cascades & Seattle','Index','Lower Town Wall'],12),ob('c','Gym',47.6,-122.3,['USA','Washington','Seattle Indoor Gym']),ob('d','Far Crag',40,-105,['USA','Colorado','Boulder','X'])]},
  openskidata:{records:[{sourceId:'openstreetmap:relation/1',name:'Open Hill',lat:47.4,lon:-121.4,activities:['downhill_skiing'],sourceUrl:'https://www.openstreetmap.org/relation/1',activityEvidence:{sourceStatus:'operating'}},{sourceId:'openstreetmap:way/2',name:'Closed Hill',lat:47.5,lon:-121.5,activities:['downhill_skiing'],sourceUrl:'https://www.openstreetmap.org/way/2',activityEvidence:{sourceStatus:'abandoned'}}]},
  ridb:{records:[{sourceId:'9',name:'Forest Trails',lat:47.9,lon:-121.9,activities:['Hiking','Biking'],sourceUrl:'https://www.recreation.gov/camping/gateways/9'}]},
 };
 assert.ok(!eligible(snaps.openskidata.records[1])&&!eligible(snaps.openbeta.records[2]),'closed ski areas and indoor climbing are left out');
 const tiles=packTiles(snaps),origin={lat:47.606,lon:-122.332};
 assert.ok(tiles[tileKey(47.8,-121.58)]&&tiles[tileKey(40,-105)]);
 assert.ok(tilesAround(origin).includes(tileKey(47.8,-121.58)));
 const loaded=tilesAround(origin).map(k=>tiles[k]).filter(Boolean);
 const climbing=tileRegions(loaded,origin,'Climbing',catalogDistance);
 assert.equal(climbing.length,1,'both Index walls group into one area; Boulder is out of range');
 assert.deepEqual([climbing[0].name,climbing[0].memberCount,climbing[0].climbs],['Index',2,17]);
 assert.ok(/near the middle/.test(climbing[0].sample),'the member nearest the middle represents the area');
 assert.equal(climbing[0].license,'CC0-1.0');assert.equal(climbing[0].largerArea,'Central-West Cascades & Seattle');
 const ski=tileRegions(loaded,origin,'Skiing',catalogDistance);assert.deepEqual(ski.map(r=>r.name),['Open Hill']);assert.equal(ski[0].url,'https://www.openstreetmap.org/relation/1');
 assert.deepEqual(tileRegions(loaded,origin,'Biking',catalogDistance).map(r=>r.id),['ridb:9']);
 assert.equal(tileRegions(loaded,origin,'Bikepacking',catalogDistance).length,0,'aliasing to Biking happens in the app');
});

test('the list spreads over distance so far destinations are not crowded out',()=>{
 const near=Array.from({length:30},(_,i)=>({id:'n'+i,km:5+i})),mid=Array.from({length:5},(_,i)=>({id:'m'+i,km:150+i})),far=Array.from({length:5},(_,i)=>({id:'f'+i,km:300+i}));
 const out=spreadByDistance([...far,...near,...mid],24);
 assert.equal(out.length,24);assert.equal(out.filter(r=>r.km<100).length,14);assert.equal(out.filter(r=>r.km>=100&&r.km<250).length,5);assert.equal(out.filter(r=>r.km>=250).length,5);
 assert.ok(out.every((r,i)=>!i||out[i-1].km<=r.km),'nearest first');
 assert.equal(spreadByDistance(near,24).length,24,'with nothing far, nearest fill the list');
});

test('areas sit at their middle and substantial places win scarce nearby slots',()=>{
 const ob=(id,lat,lon,climbs)=>({sourceId:id,name:id,lat,lon,activities:['climbing'],sourceUrl:'u',activityEvidence:{path:['USA','Washington','R','North Bend',id],totalClimbs:climbs}});
 // Three members near North Bend and one miscoded in Seattle.
 const t=packTiles({openbeta:{records:[ob('a',47.49,-121.79,40),ob('b',47.50,-121.78,30),ob('c',47.48,-121.77,20),ob('x',47.61,-122.33,1)]}});
 const [g]=tileRegions(Object.values(t),{lat:47.606,lon:-122.332},'Climbing',catalogDistance);
 assert.ok(g.km>30,'the outlier does not pull the area into Seattle');assert.equal(g.memberCount,4);
 assert.ok(significance({provider:'ridb',name:'Mount Baker-Snoqualmie National Forest'})>significance({provider:'ridb',name:'Lake Washington Ship Canal'}));
 assert.ok(significance({provider:'openbeta',climbs:300})>significance({provider:'openbeta',climbs:3}));
 const near=[{id:'canal',provider:'ridb',name:'Ship Canal',km:5},{id:'forest',provider:'ridb',name:'Snoqualmie National Forest',km:60}];
 assert.deepEqual(spreadByDistance(near,1,[[0,100,1]],significance).map(r=>r.id),['forest']);
});

test('garbled source names are repaired or visibly marked',()=>{
 assert.equal(cleanName('Pe\uFFFDa Blanca Wilderness Study Area'),'Peña Blanca Wilderness Study Area');
 assert.equal(cleanName('Caf\uFFFD Rocks'),'Caf? Rocks');assert.equal(cleanName('Index'),'Index');
});

test('the browser transport logs one summary per page, with the page start only on failure',async()=>{
 const logged=[],t=createBrowserTransport(fakeBrowser(service).mcp,{log:e=>logged.push(e)});
 await t(F+'47&longitude=-121');
 assert.equal(logged.length,1);assert.equal(logged[0].ok,true);assert.equal(logged[0].opened,true);assert.equal(logged[0].tabId,3);assert.equal(logged[0].head,undefined);
 const failing=[],bad=createBrowserTransport(fakeBrowser(()=>'<p>Site not allowed</p>').mcp,{wait:async()=>{},log:e=>failing.push(e)});
 await assert.rejects(bad(F+'47&longitude=-121'),e=>e.code==='unreadable');
 assert.equal(failing[0].code,'unreadable');assert.equal(failing[0].reads,6);assert.match(failing[0].head,/Site not allowed/);
});

test('saved forecasts from several fetches for one origin are all used',async()=>{
 const origin={lat:47.6,lon:-122.3},key=originKey(origin),now=Date.now();
 const f=(lat,lon)=>({latitude:lat,longitude:lon,daily:{time:[]},hourly:{time:[]}});
 const saved=[{request:'fc-a',origin:key,status:'ok',part:0,parts:1,fetchedAtMs:now-60e3,points:[{lat:47,lon:-121,forecast:f(47,-121)}]},
  {request:'fc-b',origin:key,status:'ok',part:0,parts:1,fetchedAtMs:now,points:[{lat:48,lon:-121,forecast:f(48,-121)}]}];
 const db={collection:()=>({where:()=>({get:async()=>({docs:saved.map(d=>({data:()=>d}))})})})};
 const remote=createRemote({mcp:{callTool:async()=>{throw Error('should not fetch')}},db,uid:'u',origin:()=>origin});
 const both=await remote.transport(F+'47,48&longitude=-121,-121');
 assert.deepEqual(both.map(x=>x.latitude),[47,48]);
});

test('a cut-off answer is split even when long title and URL lines come first',async()=>{
 // The desktop app puts "Title:" and the full request URL above the page text and caps the whole at ~52,000 characters.
 const lat=Array.from({length:40},(_,i)=>(47+i/100).toFixed(3)),url='https://marine-api.open-meteo.com/v1/marine?start_date=2026-10-27&end_date=2026-10-27&hourly=wave_height&latitude='+lat.join(',')+'&longitude='+lat.map(()=>'-124.5').join(',');
 const marine=u=>{const q=new URL(u),la=q.searchParams.get('latitude').split(',').map(Number),lo=q.searchParams.get('longitude').split(',').map(Number);const a=la.map((v,i)=>({latitude:v,longitude:lo[i],hourly:{time:[],pad:'x'.repeat(1500)}}));return JSON.stringify(a.length===1?a[0]:a)};
 const calls=[];const mcp={callTool:async(server,tool,input)=>{calls.push(tool);if(input.url)mcp.url=input.url;
  if(tool==='preview_start')return text("Opened the site in Claude's browser (tabId tab-2). Use read_page to see the page.");if(tool==='navigate')return text('ok');
  return text(('Title: \nURL: '+mcp.url+'\n\n'+marine(mcp.url)).slice(0,52000))}};
 const t=createBrowserTransport(mcp,{wait:async()=>{}});
 const out=await t(url);assert.equal(out.length,40);assert.deepEqual(out.map(f=>f.latitude),lat.map(Number));
});

import {nearbyPlaces,townsInView,locationLine,bearing,direction} from '../src/locate.mjs';
test('an area is placed in words from the start and from nearby towns',()=>{
 const rows=[['North Bend','US','WA',7500,47.4957,-121.7868],['Riverbend','US','WA',2200,47.4648,-121.7501],['Bellevue','US','WA',150000,47.6101,-122.2015],['Seattle','US','WA',750000,47.6062,-122.3321],['Snoqualmie','US','WA',14000,47.5287,-121.8254],['Tiny Place','US','WA',1200,47.43,-121.45]];
 assert.equal(direction(bearing([47,-122],[48,-122])),'north');assert.equal(direction(bearing([47,-122],[47,-121])),'east');
 const at=[47.4235,-121.4137],near=nearbyPlaces(rows,at);
 assert.equal(near.town.name,'North Bend, WA');assert.equal(near.town.direction,'east-southeast');
 assert.equal(near.nearest.name,'Tiny Place, WA','a much closer small place is named too');
 const line=locationLine(at,{lat:47.6062,lon:-122.3321,name:'Seattle, WA, US'},near);
 assert.match(line[0],/^7\d km \(4\d mi\) east-southeast of Seattle, WA, US \(straight line\)$/);
 assert.equal(line[2],'29 km (18 mi) east-southeast of North Bend, WA');
 assert.deepEqual(locationLine([47.657,-122.305],{lat:47.6062,lon:-122.3321,name:'Seattle, WA, US'},{town:{name:'Seattle, WA',km:6,direction:'north-northeast'}}),['6.0 km (3.7 mi) north-northeast of Seattle, WA, US (straight line)'],'the starting town is not repeated');
 // A small place about as close as the town is left out.
 assert.equal(nearbyPlaces(rows.filter(r=>r[0]!=='Tiny Place'),at).nearest,null);
 // A small town gets a larger neighbour within 40 km beside it; a 20,000+ town does not.
 const lacey=nearbyPlaces([['Tanglewilde-Thompson Place','US','WA',8000,47.051,-122.781],['Lacey','US','WA',53000,47.034,-122.823]],[47.0728,-122.7128]);
 assert.equal(lacey.town.name,'Tanglewilde-Thompson Place, WA');assert.equal(lacey.city.name,'Lacey, WA');
 assert.equal(nearbyPlaces([['Lacey','US','WA',53000,47.034,-122.823],['Olympia','US','WA',52000,47.038,-122.9]],[47.0728,-122.7128]).city,null);
 const box={south:47.4,north:47.7,west:-122.4,east:-121.5};
 assert.deepEqual(townsInView(rows,box,at,3,{close:2}).map(r=>r[0]),['Riverbend','North Bend','Seattle'],'closest towns first, then the largest');
});

import {accessProblems,domainCovers,wranglerConfig} from '../web/deploy.mjs';
import {webDocument,HEADERS,SERVICES} from '../build-web.mjs';
test('deploys are refused unless Cloudflare Access gates the whole hostname by identity',()=>{
 const host='outside.example.com',allow={name:'Friends',decision:'allow',include:[{email:{email:'a@example.com'}}]};
 assert.ok(domainCovers('outside.example.com',host)&&domainCovers('outside.example.com/*',host)&&domainCovers('*.example.com',host));
 assert.ok(!domainCovers('outside.example.com/admin',host)&&!domainCovers('example.com',host)&&!domainCovers('other.example.com',host));
 assert.deepEqual(accessProblems([{type:'self_hosted',name:'GO',domain:host,policies:[allow]}],host),[]);
 assert.deepEqual(accessProblems([{type:'self_hosted',destinations:[{type:'public',uri:host+'/*'}],policies:[allow]}],host),[]);
 assert.match(accessProblems([],host)[0],/No Cloudflare Access/);
 assert.match(accessProblems([{type:'self_hosted',domain:host+'/admin',policies:[allow]}],host)[0],/No Cloudflare Access/,'a path-scoped app does not protect the site');
 assert.match(accessProblems([{type:'self_hosted',domain:host,policies:[{name:'All',decision:'allow',include:[{everyone:{}}]}]}],host).join(),/allows everyone/);
 assert.match(accessProblems([{type:'self_hosted',domain:host,policies:[allow,{name:'Open',decision:'bypass',include:[{everyone:{}}]}]}],host).join(),/Bypass/);
 assert.match(accessProblems([{type:'self_hosted',domain:host,policies:[]}],host).join(),/no Allow policy/);
 const c=wranglerConfig('good-outside-web',host);
 assert.equal(c.workers_dev,false);assert.equal(c.preview_urls,false);assert.deepEqual(c.routes,[{pattern:host,custom_domain:true}]);assert.equal(c.main,undefined);
});

test('the web build loads scripts only from itself and talks only to the forecast and routing services',()=>{
 const html=webDocument('<title>Good Outside</title>\n<style>a{}</style>\n<p>x</p><script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"></script><script src="https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js"></script><script type="module" src="app.mjs"></script>');
 assert.match(html,/^<!doctype html><html lang="en"><head>.*<title>Good Outside<\/title><style>a\{\}<\/style><\/head><body><p>x<\/p>/);
 assert.match(html,/src="vendor\/leaflet-1\.9\.4\.js"/);assert.doesNotMatch(html,/cdnjs|jsdelivr/);
 assert.throws(()=>webDocument('<p>no scripts</p>'),/no longer loads/);
 const csp=HEADERS.match(/Content-Security-Policy: (.*)/)[1];
 assert.match(csp,/default-src 'none'/);assert.match(csp,/script-src 'self';/);assert.match(csp,/frame-ancestors 'none'/);
 assert.equal(csp.match(/connect-src ([^;]*)/)[1],["'self'",...SERVICES].join(' '));
 assert.match(HEADERS,/X-Robots-Tag: noindex/);assert.match(HEADERS,/Referrer-Policy: no-referrer/);
});

import {rainBefore,wetRock,freezingRange,shiftDate,PAST_DAYS} from '../src/conditions.mjs';
test('climbing days are marked down after rain in the 48 hours before the first morning',()=>{
 assert.equal(shiftDate('2026-03-01',-2),'2026-02-27');assert.equal(PAST_DAYS,2);
 // Hourly precipitation stamped at the end of each hour, from two days before through the trip day.
 const time=[],precipitation=[];for(const day of ['2026-11-12','2026-11-13','2026-11-14'])for(let h=0;h<24;h++){time.push(`${day}T${String(h).padStart(2,'0')}:00`);precipitation.push(0)}
 const f={hourly:{time,precipitation},daily:{time:['2026-11-12','2026-11-13','2026-11-14'],precipitation_sum:[9,3,0]}};
 const set=(stamp,v)=>{precipitation[time.indexOf(stamp)]=v};
 set('2026-11-12T08:00',50);  // ends at 08:00 two days before: just outside the 48 hours
 set('2026-11-12T09:00',2);set('2026-11-13T20:00',4);set('2026-11-14T08:00',1);set('2026-11-14T09:00',30);  // 09:00 on the day is after the start
 assert.deepEqual(rainBefore(f,'2026-11-14',8),{mm:7,basis:'hourly'});
 // Without the hours, the two days' daily totals stand in; without either, unknown.
 assert.deepEqual(rainBefore({daily:f.daily},'2026-11-14'),{mm:12,basis:'daily'});
 assert.equal(rainBefore({daily:{time:['2026-11-14'],precipitation_sum:[0]}},'2026-11-14'),null);
 const excellent={level:'excellent',label:'Excellent',reason:'Relatively dry, mild weather with lighter gusts.',days:[]};
 assert.equal(wetRock(excellent,{mm:0.4,basis:'hourly'}).level,'excellent');
 const damp=wetRock(excellent,{mm:3,basis:'hourly'});assert.equal(damp.level,'excellent');assert.match(damp.reason,/^dry on the day; 3\.0 mm of rain in the 48 hours before the first morning, so shaded/);
 const wet=wetRock(excellent,{mm:7,basis:'hourly'});assert.equal(wet.level,'passable');assert.match(wet.reason,/^dry on the day, but 7\.0 mm .*may still be wet$/);
 assert.equal(wetRock(excellent,{mm:25,basis:'daily'}).level,'poor');assert.match(wetRock(excellent,{mm:25,basis:'daily'}).reason,/in the two days before: expect wet rock/);
 const passable={level:'passable',label:'Passable',reason:'breezy conditions',days:[]};
 assert.equal(wetRock(passable,{mm:7,basis:'hourly'}).level,'passable');assert.match(wetRock(passable,{mm:7,basis:'hourly'}).reason,/^breezy conditions; 7\.0 mm/);
 assert.equal(wetRock(excellent,null),excellent,'unknown rain leaves the rating alone');
 assert.equal(wetRock({level:'unknown'},{mm:30}).level,'unknown');
});

test('freezing level is summarised over the rated hours',()=>{
 const time=[],freezing_level_height=[];for(let h=0;h<24;h++){time.push(`2026-11-14T${String(h).padStart(2,'0')}:00`);freezing_level_height.push(1000+h*50)}
 const f={hourly:{time,freezing_level_height}};
 assert.deepEqual(freezingRange(f,'2026-11-14',8,18),{low:1400,high:1900});
 assert.deepEqual(freezingRange(f,'2026-11-14'),{low:1000,high:2150});
 assert.equal(freezingRange({hourly:{time}},'2026-11-14'),null);
});

test('the self-hosted map grid is twice as dense',()=>{
 const o={lat:47.6,lon:-122.3},coarse=gradientGrid(o),fine=gradientGrid(o,{n:16});
 assert.equal(coarse.points.length,64);assert.equal(fine.points.length,256);
 const km=g=>(g.bounds.north-g.bounds.south)*111/(g.n-1);
 assert.ok(Math.abs(km(coarse)-86)<1&&Math.abs(km(fine)-40)<1,km(coarse)+' '+km(fine));
});

import {PROVINCES,readableAdmin} from '../src/places.mjs';
test('Canadian places read and search by province abbreviation',()=>{
 assert.equal(readableAdmin('CA','02'),'BC');assert.equal(readableAdmin('CA','01'),'AB');assert.equal(readableAdmin('US','WA'),'WA');assert.equal(readableAdmin('AU','02'),'02');
 assert.equal(Object.keys(PROVINCES).length,13);
 const rows=[['Vancouver','CA',readableAdmin('CA','02'),600000,49.25,-123.119],['Vancouver','US','WA',190000,45.639,-122.661],['Squamish','CA',readableAdmin('CA','02'),17587,49.699,-123.156]];
 const entries=rows.map(r=>({row:r,key:r[0].toLowerCase()}));
 assert.deepEqual(searchPlaces(entries,'Squamish, BC').map(placeLabel),['Squamish, BC, CA']);
 assert.deepEqual(searchPlaces(entries,'vancouver bc').map(placeLabel),['Vancouver, BC, CA']);
 assert.deepEqual(searchPlaces(entries,'vancouver').map(placeLabel),['Vancouver, BC, CA','Vancouver, WA, US']);
});

import {pointsNearLand} from '../src/gradient.mjs';
import {fullDays} from '../src/daytime.mjs';
test('map points far out at sea are left out',()=>{
 const grid=gradientGrid({lat:48.4,lon:-123.4},{n:16}),w=128,h=128,mask=new Uint8ClampedArray(w*h*4);
 // Land only in the eastern half of the box.
 for(let y=0;y<h;y++)for(let x=64;x<w;x++)mask[(y*w+x)*4+3]=255;
 const kept=pointsNearLand(grid,mask,w,h);
 assert.ok(kept.length<grid.points.length&&kept.length>=128,kept.length);
 assert.ok(kept.every(p=>p.col>=6),'only columns on or within a step of land');
 assert.equal(pointsNearLand(grid,null,w,h).length,256,'no mask keeps every point');
});

test('whole days are rebuilt from hourly values when the answer has no daily block',()=>{
 const time=[],t=[],p=[],pp=[],g=[],s=[];for(const d of ['2026-11-14','2026-11-15'])for(let hr=0;hr<24;hr++){time.push(`${d}T${String(hr).padStart(2,'0')}:00`);t.push(hr);p.push(hr===12?2:0);pp.push(hr);g.push(10+hr);s.push(0)}
 const f=fullDays({hourly:{time,temperature_2m:t,precipitation:p,precipitation_probability:pp,wind_gusts_10m:g,snowfall:s}});
 assert.deepEqual(f.daily.time,['2026-11-14','2026-11-15']);assert.deepEqual(f.daily.temperature_2m_max,[23,23]);assert.deepEqual(f.daily.precipitation_sum,[2,2]);
 assert.equal(f.window,undefined);
 const withDaily={daily:{time:['x']},hourly:{time}};assert.equal(fullDays(withDaily),withDaily);
});

import {snowBefore,skiConditions,pastDaysFor} from '../src/conditions.mjs';
test('ski ratings read the snow surface left by the three days before',()=>{
 assert.equal(pastDaysFor('Skiing'),3);assert.equal(pastDaysFor('Backcountry skiing'),3);assert.equal(pastDaysFor('Climbing'),2);assert.equal(pastDaysFor('Hiking'),0);
 const days=['2026-12-07','2026-12-08','2026-12-09','2026-12-10','2026-12-11','2026-12-12','2026-12-13','2026-12-14','2026-12-15'];
 const make=(fn,depth=0.8,dailyTemps=[[-2,-8],[-1,-7],[-3,-9]])=>{const time=[],snowfall=[],precipitation=[],temperature_2m=[],snow_depth=[];
  for(const d of days)for(let h=0;h<24;h++){const t=`${d}T${String(h).padStart(2,'0')}:00`,[s,p,tc]=fn(d,h);time.push(t);snowfall.push(s);precipitation.push(p);temperature_2m.push(tc);snow_depth.push(depth)}
  const hi=days.map((d,i)=>i>=5&&i<8?dailyTemps[i-5][0]:-2),lo=days.map((d,i)=>i>=5&&i<8?dailyTemps[i-5][1]:-8);
  return {hourly:{time,snowfall,precipitation,temperature_2m,snow_depth},daily:{time:days,snowfall_sum:days.map(()=>2),precipitation_sum:days.map(()=>3),temperature_2m_max:hi,temperature_2m_min:lo}}};
 // 1 cm an hour from 20:00 to 23:00 the night before: 4 cm of new snow, cold.
 const s=snowBefore(make((d,h)=>[d==='2026-12-14'&&h>=20?1:0,d==='2026-12-14'&&h>=20?1.4:0,-5]),'2026-12-15');
 assert.equal(s.basis,'hourly');assert.equal(s.newCm,4);assert.equal(s.rainMm,0);assert.equal(s.depthCm,80);assert.equal(s.weekCm,14);assert.equal(s.meltFreeze,false);assert.equal(s.noFreeze,false);
 const excellent={level:'excellent',label:'Excellent',reason:'Relatively dry, mild weather with lighter gusts.',days:[]};
 const powder=skiConditions(excellent,{...s,newCm:18});assert.equal(powder.level,'excellent');assert.match(powder.reason,/^18 cm of new snow in the 72 hours before$/);
 // Rain on snow without fresh snow caps at Passable.
 const rain=snowBefore(make((d,h)=>[0,d==='2026-12-13'?0.5:0,3]),'2026-12-15');
 assert.equal(rain.rainMm,12);const rained=skiConditions(excellent,rain);assert.equal(rained.level,'passable');assert.match(rained.reason,/12 mm of rain in the 72 hours before: expect crust or wet snow/);
 // Melt–freeze: a day above +3 °C and below −2 °C, no new snow.
 const mf=snowBefore(make(()=>[0,0,-1],0.8,[[5,-4],[1,-6],[0,-5]]),'2026-12-15');assert.equal(mf.meltFreeze,true);
 assert.match(skiConditions(excellent,mf).reason,/melt–freeze/);assert.equal(skiConditions(excellent,mf).level,'passable');
 // No overnight freeze at all.
 const warm=snowBefore(make(()=>[0,0,4],0.8,[[6,2],[7,1],[5,1]]),'2026-12-15');assert.equal(warm.noFreeze,true);assert.equal(skiConditions(excellent,warm).level,'passable');
 // Thin model snow depth caps at Passable but never sinks a rating to Poor on its own.
 const thin=snowBefore(make(()=>[0,0,-5],0.03),'2026-12-15');assert.equal(thin.depthCm,3);
 const capped=skiConditions(excellent,thin);assert.equal(capped.level,'passable');assert.match(capped.reason,/little snow on the ground in the weather model \(3\.0 cm\)/);
 assert.equal(skiConditions({level:'poor',label:'Poor',reason:'strong gusts',days:[]},thin).level,'poor');
 // Fresh snow covers a crust: rain earlier plus 10 cm new leaves Excellent.
 assert.equal(skiConditions(excellent,{...rain,newCm:10}).level,'excellent');
 // Without the hours, daily totals stand in; rain is precipitation beyond the snow's water.
 const daily=snowBefore({daily:{time:days,snowfall_sum:days.map(()=>7),precipitation_sum:days.map(()=>15),temperature_2m_max:days.map(()=>0),temperature_2m_min:days.map(()=>-5)}},'2026-12-15');
 assert.equal(daily.basis,'daily');assert.equal(daily.newCm,21);assert.equal(Math.round(daily.rainMm),15);
 assert.equal(snowBefore({daily:{time:['2026-12-15']}},'2026-12-15'),null);
 assert.equal(skiConditions(excellent,null),excellent);
});
