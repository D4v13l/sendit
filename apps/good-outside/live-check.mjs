import {regions,nearbyRegions} from './public/catalog.mjs';
import {createRegionClient,fetchJSON} from './public/services.mjs';
import {tier,evaluate,dateKey} from './public/engine.mjs';
import {writeFile} from 'node:fs/promises';
const client=createRegionClient(),report=[];
for(const city of ['Denver','Boston','Seattle','London','Sydney','Tokyo']){
 try{
  const data=await fetchJSON('https://geocoding-api.open-meteo.com/v1/search?'+new URLSearchParams({name:city,count:'1',language:'en'}));
  const found=data.results?.[0];if(!found)throw Error('No geocode match');const origin={lat:found.latitude,lon:found.longitude,name:found.name};const local=nearbyRegions(regions,origin);
  const results=await Promise.allSettled([client.weather(local),client.routes(origin,local)]);
  const weather=results[0].status==='fulfilled'?results[0].value:{},routes=results[1].status==='fulfilled'?results[1].value:{};
  const entry={city,origin,nearby:local.length,weatherError:results[0].status==='rejected'?String(results[0].reason):null,routeError:results[1].status==='rejected'?String(results[1].reason):null,results:local.map(r=>({name:r.name,seconds:routes[r.id]??null,tier:tier(routes[r.id]),timezone:weather[r.id]?.timezone,rank:evaluate(weather[r.id],'2026-10-24',2,'Hiking','none').label}))};report.push(entry);console.log(JSON.stringify(entry));
 }catch(error){const entry={city,error:String(error)};report.push(entry);console.log(JSON.stringify(entry))}
}
await writeFile('live-verification.json',JSON.stringify({at:new Date().toISOString(),report},null,2));
if(report.slice(0,3).some(x=>x.error||x.weatherError||x.routeError||!x.results.some(r=>r.tier==='near'&&r.rank!=='Unranked')))process.exitCode=1;
