// Provider records (OpenBeta, OpenSkiData, RIDB) packed into 10° tiles for the artifact, and the
// runtime that turns them into planner regions much as the hosted /api/locations does: activity
// filter, 450 km, OpenBeta places grouped by their named area. Groups use OpenBeta's fourth level
// where it exists (Leavenworth, Index, Vantage) rather than the third (whole state regions).
export const TILE_DEG=10;
export const PROVIDERS=[
 {key:'openbeta',name:'OpenBeta',license:'CC0-1.0',attribution:'OpenBeta contributors (CC0; excludes photos)',url:id=>'https://openbeta.io/area/'+id,role:'OpenBeta area source point; access unverified'},
 {key:'openskidata',name:'OpenSkiData',license:'ODbL-1.0',attribution:'Data from OpenSkiData / OpenSkiMap.org, © OpenStreetMap contributors (ODbL), Skimap.org, Who’s On First, © Mapterhorn',url:id=>'https://www.openstreetmap.org/'+id.replace('openstreetmap:',''),role:'Ski area source point'},
 {key:'ridb',name:'Recreation.gov (RIDB)',license:'US federal RIDB catalog; source-specific terms',attribution:'Recreation.gov RIDB and participating federal land management agencies',url:id=>'https://www.recreation.gov/camping/gateways/'+id,role:'RIDB recreation area source point; not a verified trailhead'},
];
const CODES={Hiking:'H',Climbing:'C',Biking:'B',Bikepacking:'K',Backpacking:'P',Skiing:'S','Backcountry skiing':'A','Cross-country skiing':'X'};
const NAMES=Object.fromEntries(Object.entries(CODES).map(([k,v])=>[v,k]));
const ALIAS={downhill_skiing:'Skiing',cross_country_skiing:'Cross-country skiing',climbing:'Climbing',hiking:'Hiking',biking:'Biking',bikepacking:'Bikepacking',backpacking:'Backpacking',backcountry_skiing:'Backcountry skiing'};
// Source names occasionally carry U+FFFD from an upstream encoding error. Known names are repaired;
// any other occurrence becomes '?' so the damage stays visible instead of guessed.
const REPAIRS=[['Pe\uFFFDa Blanca','Peña Blanca']];
export const cleanName=n=>REPAIRS.reduce((s,[bad,good])=>s.replaceAll(bad,good),n).replaceAll('\uFFFD','?');
export const tileKey=(lat,lon)=>Math.floor(lat/TILE_DEG)+'_'+Math.floor(lon/TILE_DEG);

// Same eligibility as the hosted recommendations: operating or unknown ski status, no indoor/buildering.
export function eligible(r){const e=r.activityEvidence||{};return (!e.sourceStatus||e.sourceStatus==='operating'||e.sourceStatus==='unknown')&&!(e.path||[]).some(p=>/\bbuildering\b|\bindoor\b/i.test(p))}

// Build time: {key: {g:[group keys], r:[[provider, sourceId, name, lat, lon, codes, group|-1, extra]]}}.
// extra: OpenBeta climb count; for other providers a source URL that does not follow the template.
export function packTiles(snapshots){
 const tiles={};
 PROVIDERS.forEach((p,pi)=>{for(const r of snapshots[p.key]?.records||[]){
  if(!eligible(r))continue;const k=tileKey(r.lat,r.lon),t=tiles[k]||(tiles[k]={g:[],r:[]});
  const codes=[...new Set(r.activities.map(a=>ALIAS[a]||a))].map(a=>CODES[a]).filter(Boolean).join('');if(!codes)continue;
  const path=r.activityEvidence?.path;let g=-1;
  if(p.key==='openbeta'&&Array.isArray(path)&&path.length>=3){const gk=JSON.stringify(path.slice(0,path.length>=4?4:3));g=t.g.indexOf(gk);if(g<0)g=t.g.push(gk)-1}
  const extra=p.key==='openbeta'?(r.activityEvidence?.totalClimbs??null):r.sourceUrl===p.url(r.sourceId)?null:r.sourceUrl;
  t.r.push([pi,r.sourceId,cleanName(r.name),+r.lat.toFixed(5),+r.lon.toFixed(5),codes,g,extra]);
 }});
 return tiles;
}

export function tilesAround(origin,km=450){
 const dLat=km/110.5,dLon=Math.min(180,km/(110.5*Math.max(0.01,Math.cos(origin.lat*Math.PI/180)))),keys=new Set();
 for(let lat=Math.floor((origin.lat-dLat)/TILE_DEG);lat<=Math.floor((origin.lat+dLat)/TILE_DEG);lat++)
  for(let lon=Math.floor((origin.lon-dLon)/TILE_DEG);lon<=Math.floor((origin.lon+dLon)/TILE_DEG);lon++)keys.add(lat+'_'+(((lon+18)%36+36)%36-18));
 return [...keys];
}

// Runtime: regions within `km` for `activity` from loaded tiles, OpenBeta grouped by named area with
// its nearest member as the representative point. distanceKm(a, b) on [lat, lon].
export function tileRegions(tiles,origin,activity,distanceKm,km=450){
 const at=[origin.lat,origin.lon],code=CODES[activity],groups=new Map(),out=[];if(!code)return out;
 for(const t of tiles)for(const row of t.r){
  const [pi,id,name,lat,lon,codes,g,extra]=row;if(!codes.includes(code))continue;
  const d=distanceKm(at,[lat,lon]);if(d>km)continue;
  const p=PROVIDERS[pi],acts=[...codes].map(c=>NAMES[c]);
  const base={name,road:[lat,lon],point:[lat,lon],gateway:name,sample:name,activities:acts,provider:p.key,providerName:p.name,license:p.license,attribution:p.attribution,url:pi!==0&&extra?extra:p.url(id),coordinateRole:p.role,km:d,sourceId:id,...(p.key==='openskidata'?{activityEvidence:{sourceStatus:'operating or unknown'}}:{})};
  if(g>=0){const key=t.g[g],old=groups.get(key);
   if(old){old.memberCount++;old.climbs+=extra||0;old.members.push({lat,lon,name,url:base.url})}
   else{const path=JSON.parse(key),area=path.at(-1);groups.set(key,{...base,id:'openbeta:area:'+key,name:area,gateway:area,largerArea:path.length>3?path[2]:null,memberCount:1,climbs:extra||0,members:[{lat,lon,name,url:base.url}]})}}
  else out.push({...base,id:p.key+':'+id,memberCount:1});
 }
 // Each area sits at its members' median position, so one miscoded place cannot drag it across
 // the map; weather and drive use the member closest to that middle.
 const median=a=>{const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length/2)]};
 for(const g of groups.values()){
  const mid=[median(g.members.map(m=>m.lat)),median(g.members.map(m=>m.lon))];
  const rep=g.members.reduce((a,m)=>distanceKm(mid,[m.lat,m.lon])<distanceKm(mid,[a.lat,a.lon])?m:a);
  Object.assign(g,{road:[rep.lat,rep.lon],point:[rep.lat,rep.lon],sample:rep.name+' (near the middle of this area)',url:rep.url,km:distanceKm(at,[rep.lat,rep.lon])});delete g.members;
 }
 return [...out,...[...groups.values()].filter(g=>g.km<=km)];
}

// How much a region is worth a slot when nearby slots are scarce: hand-picked regions first, then
// larger climbing areas, then named forests, parks and wilderness ahead of facilities.
export function significance(r){
 if(r.provider==='curated')return 1e6;
 if(r.provider==='openbeta')return r.climbs||r.memberCount||0;
 if(r.provider==='ridb'){if(/\b(national (forest|park|monument|recreation area|preserve|seashore|lakeshore|scenic area)|wilderness|state park|recreation area|ranger district)\b/i.test(r.name))return 2;if(/\b(dam|harbor|harbour|canal|locks?|hatchery|marina|visitor center|field office|office)\b/i.test(r.name))return 0;return 1}
 return 1;
}

// Up to `max` regions spread over distance bands, so nearby minor sites cannot crowd out the
// destinations two to four hours away. Within each band, nearest first; leftovers fill gaps.
export function spreadByDistance(list,max=24,bands=[[0,100,8],[100,250,8],[250,Infinity,8]],weight=()=>0){
 const sorted=[...list].sort((a,b)=>a.km-b.km),picked=new Set();
 for(const [lo,hi,n] of bands)sorted.filter(r=>r.km>=lo&&r.km<hi).sort((a,b)=>weight(b)-weight(a)||a.km-b.km).slice(0,n).forEach(r=>picked.add(r));
 for(const r of sorted){if(picked.size>=max)break;picked.add(r)}
 return [...picked].sort((a,b)=>a.km-b.km).slice(0,max);
}
