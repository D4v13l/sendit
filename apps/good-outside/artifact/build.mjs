// Assembles Good Outside as a multi-file Claude Artifact in dist/.
// Planner modules are copied verbatim from ../public so ranking, dates and routing stay identical.
import {mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {topology} from 'topojson-server';
import {PNG} from 'pngjs';
import jpeg from 'jpeg-js';
import {plan as terrainPlan,tilesOf,tileLat,tileLon,clusters as terrainClusters} from './terrain-plan.mjs';
import {elevationBands} from './src/bands.mjs';
import {regions as curatedRegions,distanceKm} from '../public/catalog.mjs';
import {hillshade,decodeTerrarium} from './src/hillshade.mjs';
const require=createRequire(import.meta.url);
const here=new URL('./',import.meta.url),pub=new URL('../public/',import.meta.url),dist=new URL('dist/',here);
const shared=['engine.mjs','trips.mjs','services.mjs','catalog.mjs','world-catalog.mjs','expanded-catalog.mjs'];
const own=['app.mjs','bridge.mjs','basemap.mjs','places.mjs','notices.mjs','gradient.mjs','drive.mjs'];

await rm(dist,{recursive:true,force:true});await mkdir(new URL('data/',dist),{recursive:true});
for(const f of shared)await copyFile(new URL(f,pub),new URL(f,dist));
for(const f of own)await copyFile(new URL('src/'+f,here),new URL(f,dist));

const styles=(await Promise.all([new URL('leaflet.css',pub),new URL('style.css',pub),new URL('src/artifact.css',here)].map(u=>readFile(u,'utf8')))).join('\n');
const page=(await readFile(new URL('src/page.html',here),'utf8')).replace('{{STYLES}}',()=>styles);
await writeFile(new URL('index.html',dist),page);

const pkg=name=>new URL('node_modules/'+name+'/',here);
await copyFile(new URL('countries-50m.json',pkg('world-atlas')),new URL('data/countries-50m.json',dist));
await copyFile(new URL('countries-10m.json',pkg('world-atlas')),new URL('data/countries-10m.json',dist));
await copyFile(new URL('states-10m.json',pkg('us-atlas')),new URL('data/states-10m.json',dist));

// GeoNames rows: [name, country, adminCode, population, lat, lon], most populous first.
const rows=require('all-the-cities').filter(c=>c.population>=1000&&c.name)
 .map(c=>[c.name,c.country,c.adminCode,c.population,+c.loc.coordinates[1].toFixed(3),+c.loc.coordinates[0].toFixed(3)])
 .sort((a,b)=>b[3]-a[3]);
await writeFile(new URL('data/cities-search.json',dist),JSON.stringify(rows));
await writeFile(new URL('data/cities-labels.json',dist),JSON.stringify(rows.filter(r=>r[3]>=100000)));

// Natural Earth geography (public domain), pinned in data-sources.json and fetched by fetch-data.mjs.
const polylabel=require('polylabel');
const ne=async name=>JSON.parse(await readFile(new URL('.cache/'+name+'.geojson',here),'utf8'));
const collect=(layers,test,props)=>({type:'FeatureCollection',features:layers.flatMap(l=>l.features).filter(f=>f.geometry&&test(f.properties)).map(f=>({type:'Feature',geometry:f.geometry,properties:props(f.properties)}))});
const rank=p=>Number(p.scalerank??p.SCALERANK);
// Label point inside the largest polygon, as [lat, lon].
const labelPoint=g=>{const polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;const area=r=>Math.abs(r.reduce((a,[x,y],i)=>{const [x2,y2]=r[(i+1)%r.length];return a+x*y2-x2*y},0));const [lon,lat]=polylabel(polys.sort((a,b)=>area(b[0])-area(a[0]))[0],0.01);return [+lat.toFixed(3),+lon.toFixed(3)]};
const title=n=>n===n.toUpperCase()?n.toLowerCase().replace(/(^|[\s-])\S/g,c=>c.toUpperCase()):n;
const [lakes,lakesNA,lakesEU,lakesAU,rivers,riversNA,riversEU,riversAU]=await Promise.all(['ne_10m_lakes','ne_10m_lakes_north_america','ne_10m_lakes_europe','ne_10m_lakes_australia','ne_10m_rivers_lake_centerlines','ne_10m_rivers_north_america','ne_10m_rivers_europe','ne_10m_rivers_australia'].map(ne));
const isRiver=p=>/^River/.test(p.featurecla);const none=()=>({});
// Three zoom bands, so regional detail only loads once someone zooms in.
const water={
 'water-major':{lakes:collect([lakes],p=>rank(p)<=6,none),rivers:collect([rivers],p=>isRiver(p)&&rank(p)<=5,none)},
 'water-minor':{lakes:collect([lakes],p=>rank(p)>6,none),rivers:collect([rivers],p=>isRiver(p)&&rank(p)>5,none)},
 'water-detail':{lakes:collect([lakesNA,lakesEU,lakesAU],()=>true,none),rivers:collect([riversNA,riversEU,riversAU],isRiver,none)},
};
for(const [name,objects] of Object.entries(water))await writeFile(new URL('data/'+name+'.json',dist),JSON.stringify(topology(objects,1e5)));
const parks=await ne('ne_10m_parks_and_protected_lands_area');
await writeFile(new URL('data/parks.json',dist),JSON.stringify(topology({parks:collect([parks],()=>true,p=>({name:p.name,type:p.unit_type}))},1e5)));
// Relief points. Peaks: [name, metres, lat, lon, rank]; ranges: [name, lat, lon, rank].
const [regions,peaks]=await Promise.all([ne('ne_10m_geography_regions_polys'),ne('ne_10m_geography_regions_elevation_points')]);
await writeFile(new URL('data/relief.json',dist),JSON.stringify({
 peaks:peaks.features.filter(f=>f.properties.featurecla==='mountain'&&f.properties.name&&Number.isFinite(f.properties.elevation)).map(f=>[f.properties.name,f.properties.elevation,+f.geometry.coordinates[1].toFixed(3),+f.geometry.coordinates[0].toFixed(3),rank(f.properties)]),
 ranges:regions.features.filter(f=>f.properties.FEATURECLA==='Range/mtn'&&f.properties.NAME).map(f=>[title(f.properties.NAME),...labelPoint(f.geometry),rank(f.properties)]),
}));
// Park label points ride along in their own small file so labels need not decode the polygons.
// Natural Earth abbreviates some names already ("Canaveral NS"); spell out the unit type for the rest.
const parkName=p=>/\b(NM|NS|NRA|NRRA|NL|PRES)\b/.test(p.name)?p.name:p.name+' '+p.unit_type;
await writeFile(new URL('data/park-labels.json',dist),JSON.stringify(parks.features.map(f=>[parkName(f.properties),...labelPoint(f.geometry)])));

// Major highways: Natural Earth major highways, beltways and expressways. `e` marks Interstates and expressways.
const roads=await ne('ne_10m_roads');
const major=p=>p.type==='Major Highway'||p.type==='Beltway'||p.expressway===1;
await writeFile(new URL('data/roads.json',dist),JSON.stringify(topology({roads:collect([roads],major,p=>({e:p.expressway===1||p.level==='Interstate'?1:0}))},1e5)));
// One route label per route number per ~1° cell, at the middle of a long segment: [text, lat, lon, rank].
const routeText=p=>p.level==='E'?p.label:p.sov_a3==='USA'&&p.level==='Interstate'?'I-'+p.name:p.sov_a3==='USA'&&p.level==='Federal'?'US '+p.name:/^\d{1,4}[A-Z]?$/.test(p.name||'')?p.name:null;
const roadLabels=new Map();
for(const f of roads.features){const p=f.properties,text=major(p)&&f.geometry&&p.length_km>=40&&routeText(p);if(!text)continue;
 const parts=f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.coordinates,part=parts.reduce((a,b)=>b.length>a.length?b:a),[lon,lat]=part[Math.floor(part.length/2)];
 const key=text+'|'+Math.round(lat)+'|'+Math.round(lon);if(!roadLabels.has(key))roadLabels.set(key,[text,+lat.toFixed(3),+lon.toFixed(3),Number(p.scalerank)])}
await writeFile(new URL('data/road-labels.json',dist),JSON.stringify([...roadLabels.values()]));

// Light hillshade from AWS Terrain Tiles (fetch-terrain.mjs). One image per layer, tile-aligned in Web Mercator.
// The world layer is left blank where a sharper cluster layer covers it, so shading is never doubled.
await mkdir(new URL('data/hillshade/',dist),{recursive:true});
const terrain=terrainPlan(),detail=terrain.filter(l=>l.id!=='world'),relief=[],bands={};
const members=Object.fromEntries(terrainClusters().map(c=>[c.id,c.ids]));
for(const l of terrain){
 const cols=l.x1-l.x0+1,rows=l.y1-l.y0+1,w=cols*256,h=rows*256,elevation=new Float32Array(w*h);
 for(const [z,x,y] of tilesOf(l)){
  const png=PNG.sync.read(readFileSync(new URL(`.cache/terrain/${z}/${x}/${y}.png`,here))),ox=(x-l.x0)*256,oy=(y-l.y0)*256;
  for(let py=0;py<256;py++)for(let px=0;px<256;px++){const i=(py*256+px)*4;elevation[(oy+py)*w+ox+px]=decodeTerrarium(png.data[i],png.data[i+1],png.data[i+2])}
 }
 const metersPerPixel=row=>156543.03392*Math.cos(tileLat(l.y0+(row+0.5)/256,l.z)*Math.PI/180)/2**l.z;
 // Elevation bands for each curated region in this cluster, from terrain within 10 miles.
 for(const id of members[l.id]||[]){
  const r=curatedRegions.find(x=>x.id===id),n=2**l.z,cx=((r.point[1]+180)/360*n-l.x0)*256;
  const lr=r.point[0]*Math.PI/180,cy=((1-Math.log(Math.tan(lr)+1/Math.cos(lr))/Math.PI)/2*n-l.y0)*256,reach=Math.ceil(16093/metersPerPixel(Math.round(cy)))+1,samples=[];
  for(let py=Math.max(0,Math.floor(cy-reach));py<=Math.min(h-1,Math.ceil(cy+reach));py++)for(let px=Math.max(0,Math.floor(cx-reach));px<=Math.min(w-1,Math.ceil(cx+reach));px++){
   const lat=tileLat(l.y0+(py+0.5)/256,l.z),lon=tileLon(l.x0+(px+0.5)/256,l.z),km=distanceKm(r.point,[lat,lon]);
   if(km<=16.09)samples.push({e:elevation[py*w+px],lat,lon,km});
  }
  bands[id]=elevationBands(samples);
 }
 const shade=hillshade(elevation,w,h,metersPerPixel,{zFactor:l.z<=4?10:3});
 if(l.id==='world')for(const c of detail){const k=256/2**(c.z-l.z);for(let y=Math.floor(c.y0*k);y<Math.ceil((c.y1+1)*k);y++)shade.fill(255,y*w+Math.floor(c.x0*k),y*w+Math.ceil((c.x1+1)*k))}
 const rgba=Buffer.alloc(w*h*4);for(let i=0;i<w*h;i++){rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=shade[i];rgba[i*4+3]=255}
 await writeFile(new URL(`data/hillshade/${l.id}.jpg`,dist),jpeg.encode({data:rgba,width:w,height:h},78).data);
 relief.push({url:`data/hillshade/${l.id}.jpg`,bounds:[[+tileLat(l.y1+1,l.z).toFixed(5),+tileLon(l.x0,l.z).toFixed(5)],[+tileLat(l.y0,l.z).toFixed(5),+tileLon(l.x1+1,l.z).toFixed(5)]]});
}
await writeFile(new URL('data/hillshade-index.json',dist),JSON.stringify(relief));
await writeFile(new URL('data/elevation-bands.json',dist),JSON.stringify(bands));

// Published path -> source and content type, for the Artifact tool's `files` map.
const files={};
for(const f of [...shared,...own])files[f]={from:'dist/'+f,contentType:'text/javascript'};
for(const f of ['countries-50m','countries-10m','states-10m','cities-search','cities-labels','water-major','water-minor','water-detail','parks','relief','park-labels','roads','road-labels','hillshade-index','elevation-bands'])files['data/'+f+'.json']={from:'dist/data/'+f+'.json',contentType:'application/json'};
for(const r of relief)files[r.url]={from:'dist/'+r.url,contentType:'image/jpeg'};
await writeFile(new URL('files.json',dist),JSON.stringify(files,null,1));
console.log(`Built dist/: ${Object.keys(files).length} files plus index.html; ${rows.length} search places.`);
