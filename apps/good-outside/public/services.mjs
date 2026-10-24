export async function fetchJSON(url,timeout=20000){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);try{const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error('Service returned '+response.status);const data=await response.json();if(data.error)throw Error(data.reason||'Data unavailable');return data}finally{clearTimeout(timer)}}
export function createRegionClient(transport=fetchJSON){
 const forecastCache=new Map(),routeCache=new Map();let routeQueue=Promise.resolve(),lastRouteCall=0;
 const fresh=entry=>entry&&Date.now()-entry.at<30*60*1000;
 const weather=async(regions,force=false)=>{
  if(!regions.length)return {};
  const key=JSON.stringify(regions.map(r=>[r.id,r.point]));const cached=forecastCache.get(key);if(!force&&fresh(cached))return cached.data;
  const params=new URLSearchParams({latitude:regions.map(r=>r.point[0]).join(','),longitude:regions.map(r=>r.point[1]).join(','),daily:'temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,snowfall_sum',hourly:'temperature_2m',forecast_days:'16',timezone:'auto'});
  const response=await transport('https://api.open-meteo.com/v1/forecast?'+params),data=Array.isArray(response)?response:[response];if(data.length!==regions.length)throw Error('Incomplete forecast response');
  const result={};regions.forEach((r,i)=>{result[r.id]={...data[i],retrievedAt:Date.now()}});forecastCache.set(key,{at:Date.now(),data:result});return result;
 };
 const routes=(origin,regions,force=false)=>{
  if(!regions.length)return Promise.resolve({});
  // Snapshot both coordinates and destinations before any await. Requests never read mutable UI state.
  const point={lat:origin.lat,lon:origin.lon},areas=regions.map(r=>({id:r.id,road:[...r.road]}));
  const key=JSON.stringify([point,areas]);const cached=routeCache.get(key);if(!force&&fresh(cached))return Promise.resolve(cached.data);
  const run=async()=>{
   await new Promise(resolve=>setTimeout(resolve,Math.max(0,1200-(Date.now()-lastRouteCall))));lastRouteCall=Date.now();
   const coords=[[point.lon,point.lat],...areas.map(r=>[r.road[1],r.road[0]])].map(c=>c.join(',')).join(';');
   const url='https://router.project-osrm.org/table/v1/driving/'+coords+'?sources=0&annotations=duration';
   let response;try{response=await transport(url,25000)}catch(error){
    if(!(error instanceof TypeError)&&error.name!=='AbortError'&&!/Service returned (429|5\d\d)/.test(error.message))throw error;
    await new Promise(resolve=>setTimeout(resolve,1200));lastRouteCall=Date.now();response=await transport(url,25000);
   }
   if(response.code!=='Ok'||response.durations?.[0]?.length!==areas.length+1)throw Error('Routes unavailable');
   const result={},originSnap=response.sources?.[0]?.distance??response.destinations?.[0]?.distance;
   areas.forEach((r,i)=>{const seconds=response.durations[0][i+1],snap=response.destinations?.[i+1]?.distance;result[r.id]=Number.isFinite(seconds)&&seconds>=0&&Number.isFinite(snap)&&snap<=10000&&Number.isFinite(originSnap)&&originSnap<=10000?seconds:null});
   routeCache.set(key,{at:Date.now(),data:result});return result;
  };
  const pending=routeQueue.catch(()=>{}).then(run);routeQueue=pending;return pending;
 };
 return {weather,routes};
}
