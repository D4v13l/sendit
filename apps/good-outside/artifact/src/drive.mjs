// Drive times as road distance at an average highway speed: roughly the speed limit on major
// highways the whole way, with no traffic, closures or slow final miles modelled.
export const AVERAGE_MPH=60,CIRCUITY=1.3,MAX_SNAP_M=10000;
const rad=x=>x*Math.PI/180;
const distanceKm=(a,b)=>{const h=Math.sin(rad(b[0]-a[0])/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(rad(b[1]-a[1])/2)**2;return 12742*Math.asin(Math.sqrt(h))};
const KMH=AVERAGE_MPH*1.609344;
export const secondsFor=km=>Math.round(km/KMH*3600);

// One OSRM table request for road distances from the origin to every gateway. Where the road
// distance is unavailable, straight-line distance x CIRCUITY stands in and is marked 'estimate'.
// Returns {id: {seconds, km, basis: 'road'|'estimate'}}.
export async function driveTimes(transport,origin,regions){
 const out={},estimate=r=>{const km=distanceKm([origin.lat,origin.lon],r.road)*CIRCUITY;return {seconds:secondsFor(km),km:Math.round(km),basis:'estimate'}};
 if(!regions.length)return out;
 let data=null;
 try{
  const coords=[[origin.lon,origin.lat],...regions.map(r=>[r.road[1],r.road[0]])].map(c=>c.join(',')).join(';');
  data=await transport('https://router.project-osrm.org/table/v1/driving/'+coords+'?sources=0&annotations=distance',25000);
 }catch{}
 const ok=data?.code==='Ok'&&data.distances?.[0]?.length===regions.length+1&&(data.sources?.[0]?.distance??0)<=MAX_SNAP_M;
 regions.forEach((r,i)=>{const m=ok?data.distances[0][i+1]:null,snap=data?.destinations?.[i+1]?.distance;
  out[r.id]=Number.isFinite(m)&&m>=0&&(snap??0)<=MAX_SNAP_M?{seconds:secondsFor(m/1000),km:Math.round(m/1000),basis:'road'}:estimate(r)});
 return out;
}
