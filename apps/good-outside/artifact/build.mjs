// Assembles Good Outside as a multi-file Claude Artifact in dist/.
// Planner modules are copied verbatim from ../public so ranking, dates and routing stay identical.
import {mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const here=new URL('./',import.meta.url),pub=new URL('../public/',import.meta.url),dist=new URL('dist/',here);
const shared=['engine.mjs','trips.mjs','services.mjs','catalog.mjs','world-catalog.mjs','expanded-catalog.mjs'];
const own=['app.mjs','bridge.mjs','basemap.mjs','places.mjs'];

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
await copyFile(new URL('counties-10m.json',pkg('us-atlas')),new URL('data/counties-10m.json',dist));

// GeoNames rows: [name, country, adminCode, population, lat, lon], most populous first.
const rows=require('all-the-cities').filter(c=>c.population>=1000&&c.name)
 .map(c=>[c.name,c.country,c.adminCode,c.population,+c.loc.coordinates[1].toFixed(3),+c.loc.coordinates[0].toFixed(3)])
 .sort((a,b)=>b[3]-a[3]);
await writeFile(new URL('data/cities-search.json',dist),JSON.stringify(rows));
await writeFile(new URL('data/cities-labels.json',dist),JSON.stringify(rows.filter(r=>r[3]>=15000)));

// Published path -> source and content type, for the Artifact tool's `files` map.
const files={};
for(const f of [...shared,...own])files[f]={from:'dist/'+f,contentType:'text/javascript'};
for(const f of ['countries-50m','countries-10m','states-10m','counties-10m','cities-search','cities-labels'])files['data/'+f+'.json']={from:'dist/data/'+f+'.json',contentType:'application/json'};
await writeFile(new URL('files.json',dist),JSON.stringify(files,null,1));
console.log(`Built dist/: ${Object.keys(files).length} files plus index.html; ${rows.length} search places.`);
