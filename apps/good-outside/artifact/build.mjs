// Assembles Good Outside as a multi-file Claude Artifact in dist/.
// Planner modules are copied verbatim from ../public so ranking, dates and routing stay identical.
import {mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {topology} from 'topojson-server';
const require=createRequire(import.meta.url);
const here=new URL('./',import.meta.url),pub=new URL('../public/',import.meta.url),dist=new URL('dist/',here);
const shared=['engine.mjs','trips.mjs','services.mjs','catalog.mjs','world-catalog.mjs','expanded-catalog.mjs'];
const own=['app.mjs','bridge.mjs','basemap.mjs','places.mjs','notices.mjs'];

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

// Published path -> source and content type, for the Artifact tool's `files` map.
const files={};
for(const f of [...shared,...own])files[f]={from:'dist/'+f,contentType:'text/javascript'};
for(const f of ['countries-50m','countries-10m','states-10m','cities-search','cities-labels','water-major','water-minor','water-detail','parks','relief','park-labels'])files['data/'+f+'.json']={from:'dist/data/'+f+'.json',contentType:'application/json'};
await writeFile(new URL('files.json',dist),JSON.stringify(files,null,1));
console.log(`Built dist/: ${Object.keys(files).length} files plus index.html; ${rows.length} search places.`);
