import assert from 'node:assert/strict';
import {regions} from './public/catalog.mjs';
const km=(a,b)=>Math.hypot((a[0]-b[0])*111,(a[1]-b[1])*111*Math.cos(a[0]*Math.PI/180));
for(const [name,point] of [['Seattle',[47.606,-122.332]],['Denver',[39.739,-104.99]],['Boston',[42.36,-71.06]]]){
 const nearby=regions.filter(r=>km(point,r.road)<280&&r.activities.includes('Hiking'));
 assert.ok(nearby.length>=3,`${name} needs at least three sourced local hiking areas; found ${nearby.length}`);
}
console.log('PASS: useful sourced fallback coverage near Seattle, Denver and Boston');
