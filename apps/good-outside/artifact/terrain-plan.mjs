// Which terrain tiles the hillshade layers need. Shared by fetch-terrain.mjs and build.mjs.
// A low-zoom world layer, plus sharper layers around each cluster of curated regions.
import {regions,distanceKm} from '../public/catalog.mjs';
export const WORLD_ZOOM=4,DETAIL_ZOOM=7,PAD_KM=320;
export const tileUrl=(z,x,y)=>`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const lon2x=(lon,z)=>Math.floor((lon+180)/360*2**z);
const lat2y=(lat,z)=>{const r=lat*Math.PI/180;return Math.floor((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*2**z)};
export const tileLat=(y,z)=>{const n=Math.PI-2*Math.PI*y/2**z;return 180/Math.PI*Math.atan(Math.sinh(n))};
export const tileLon=(x,z)=>x/2**z*360-180;

// Regions within 500 km of a cluster's first member join it.
export function clusters(list=regions){
 const out=[];
 for(const r of list){const c=out.find(c=>distanceKm(c.points[0],r.road)<=500);if(c){c.points.push(r.road);c.ids.push(r.id)}else out.push({id:r.id,points:[r.road],ids:[r.id]})}
 return out;
}
export function tileRange(points,z,padKm=PAD_KM){
 const lats=points.map(p=>p[0]),lons=points.map(p=>p[1]),mid=(Math.min(...lats)+Math.max(...lats))/2;
 const dLat=padKm/111,dLon=padKm/(111*Math.cos(mid*Math.PI/180));
 return {z,x0:lon2x(Math.min(...lons)-dLon,z),x1:lon2x(Math.max(...lons)+dLon,z),y0:lat2y(Math.max(...lats)+dLat,z),y1:lat2y(Math.min(...lats)-dLat,z)};
}
export function plan(){
 const n=2**WORLD_ZOOM,layers=[{id:'world',z:WORLD_ZOOM,x0:0,x1:n-1,y0:0,y1:n-1}];
 for(const c of clusters())layers.push({id:c.id,...tileRange(c.points,DETAIL_ZOOM)});
 return layers;
}
export const tilesOf=l=>{const t=[];for(let x=l.x0;x<=l.x1;x++)for(let y=l.y0;y<=l.y1;y++)t.push([l.z,x,y]);return t};
