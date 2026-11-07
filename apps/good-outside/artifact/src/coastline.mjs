// Open-coast sample points for surf, derived at build time from the Natural Earth countries
// topology. Coastline arcs are the ones used by a single country; ring winding says which side
// is sea. Points with land close offshore in most directions (sounds, straits, bays) are dropped.
const R=6371;
const rad=x=>x*Math.PI/180,deg=x=>x*180/Math.PI;
export function km(a,b){const h=Math.sin(rad(b[1]-a[1])/2)**2+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(rad(b[0]-a[0])/2)**2;return 2*R*Math.asin(Math.sqrt(h))}
// Point `dist` km from [lon, lat] along compass `bearing`.
export function travel([lon,lat],bearing,dist){
 const d=dist/R,b=rad(bearing),p1=rad(lat),l1=rad(lon),p2=Math.asin(Math.sin(p1)*Math.cos(d)+Math.cos(p1)*Math.sin(d)*Math.cos(b));
 return [((deg(l1+Math.atan2(Math.sin(b)*Math.sin(d)*Math.cos(p1),Math.cos(d)-Math.sin(p1)*Math.sin(p2)))+540)%360)-180,deg(p2)];
}

export function decodeArcs(topology){
 const [sx,sy]=topology.transform?.scale||[1,1],[tx,ty]=topology.transform?.translate||[0,0];
 return topology.arcs.map(arc=>{let x=0,y=0;return arc.map(([dx,dy])=>topology.transform?[(x+=dx)*sx+tx,(y+=dy)*sy+ty]:[dx,dy])});
}

// Coastal arcs with the bearing that points out to sea along each, from every polygon ring.
export function coastalRuns(topology,object='countries'){
 const arcs=decodeArcs(topology),uses=new Map(),rings=[];
 for(const g of topology.objects[object].geometries){
  const polys=g.type==='Polygon'?[g.arcs]:g.type==='MultiPolygon'?g.arcs:[];
  for(const p of polys)for(const ring of p){rings.push(ring);for(const a of ring){const k=a<0?~a:a;uses.set(k,(uses.get(k)||0)+1)}}
 }
 const runs=[];
 for(const ring of rings){
  const pts=ring.flatMap(a=>{const c=a<0?[...arcs[~a]].reverse():arcs[a];return c});
  // Shoelace in lon/lat: negative area means clockwise, with land on the right of travel.
  let area=0;for(let i=0;i<pts.length-1;i++)area+=pts[i][0]*pts[i+1][1]-pts[i+1][0]*pts[i][1];
  for(const a of ring){const k=a<0?~a:a;if(uses.get(k)!==1)continue;
   runs.push({arc:k,coords:a<0?[...arcs[k]].reverse():arcs[k],seaOnLeft:area<0});}
 }
 return runs;
}

// Evenly spaced samples along a run, each with the compass bearing pointing out to sea.
export function sampleRun(run,spacing=20){
 const out=[],c=run.coords;let carry=spacing/2;
 for(let i=0;i+1<c.length;i++){
  const a=c[i],b=c[i+1],len=km(a,b);if(!len)continue;
  // Direction of travel as a compass bearing, then a quarter turn towards the sea.
  const dx=(b[0]-a[0])*Math.cos(rad((a[1]+b[1])/2)),dy=b[1]-a[1],heading=(deg(Math.atan2(dx,dy))+360)%360;
  const seaward=(heading+(run.seaOnLeft?270:90))%360;
  let at=carry;while(at<=len){const t=at/len;out.push({lon:a[0]+(b[0]-a[0])*t,lat:a[1]+(b[1]-a[1])*t,seaward});at+=spacing}
  carry=at-len;
 }
 return out;
}

// Median open-water distance (km) in a fan of rays facing the sea. isLand([lon, lat]) -> boolean.
export function exposure(point,seaward,isLand,{spread=60,step=20,start=10,reach=300,every=5}={}){
 const lengths=[];
 for(let off=-spread;off<=spread;off+=step){
  let d=start;while(d<=reach&&!isLand(travel([point.lon,point.lat],(seaward+off+360)%360,d)))d+=every;
  lengths.push(Math.min(d,reach));
 }
 lengths.sort((a,b)=>a-b);return lengths[Math.floor(lengths.length/2)];
}
