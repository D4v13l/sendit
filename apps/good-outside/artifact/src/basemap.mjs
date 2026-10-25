// Tile-free basemap for the artifact: the page cannot load remote tiles, so it draws
// Natural Earth / US Census geography and GeoNames city labels from files shipped beside it.
const getJSON=async path=>{const r=await fetch(path);if(!r.ok)throw Error(path+' '+r.status);return r.json()};

export const ATTRIBUTION='Geography: <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a> · <a href="https://www.census.gov/geographies/mapping-files.html" target="_blank" rel="noopener">US Census</a> · Cities: <a href="https://www.geonames.org/" target="_blank" rel="noopener">GeoNames</a> (CC BY 4.0)';

// Smallest city population labelled at each zoom. Never below 100,000.
export function labelThreshold(zoom){return zoom<4?2e6:zoom<5?7e5:zoom<6?3e5:1e5}

export function visibleLabels(cities,bounds,zoom,max=150){
 const min=labelThreshold(zoom);
 return cities.filter(c=>c[3]>=min&&inside(bounds,c[4],c[5])).sort((a,b)=>b[3]-a[3]).slice(0,max);
}
const inside=(b,lat,lon)=>lat>=b.south&&lat<=b.north&&lon>=b.west&&lon<=b.east;

// Which relief and park labels belong at a zoom. Natural Earth ranks run from 0 (most prominent).
export const showRange=(rank,zoom)=>zoom>=5&&zoom<10&&rank<=Math.min(6,zoom-2);
export const showPeak=(rank,zoom)=>zoom>=9||(zoom>=8&&rank<=7)||(zoom>=7&&rank<=5);
export const showParkLabel=zoom=>zoom>=7;

// Greedy placement in priority order. Each label tries a few positions and is dropped only if
// every one would overlap a label already placed or a `blocked` box (the planner's own markers).
// Items are {kind, text, lat, lon}; project(item) gives container pixels {x,y}.
// City and peak names sit beside their dot, right then left; park and range names are centred,
// then nudged below or above. Placed items gain {side, dy} for rendering.
export function placeLabels(items,project,max=60,blocked=[]){
 const placed=[],boxes=[...blocked];
 const hits=box=>boxes.some(o=>box.l<o.r&&box.r>o.l&&box.t<o.b&&box.b>o.t);
 for(const item of items){
  const {x,y}=project(item),n=item.text.length,centred=item.kind==='range'||item.kind==='park',half=n*(item.kind==='range'?3.9:3.3);
  const options=centred?[0,16,-16].map(dy=>({side:'centre',dy,box:{l:x-half,r:x+half,t:y+dy-8,b:y+dy+8}})):[
   {side:'right',dy:0,box:{l:x-6,r:x+12+n*6.2,t:y-9,b:y+9}},{side:'left',dy:0,box:{l:x-12-n*6.2,r:x+6,t:y-9,b:y+9}}];
  const fit=options.find(o=>!hits(o.box));if(!fit)continue;
  boxes.push(fit.box);placed.push({...item,side:fit.side,dy:fit.dy});if(placed.length>=max)break;
 }
 return placed;
}

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const feet=m=>Math.round(m*3.28084).toLocaleString()+' ft';

export async function addBasemap(L,topojson,map,{onError,obstacles=()=>[]}={}){
 const renderer=L.canvas({padding:0.3});
 const pane=map.createPane('basemapLabels');pane.style.zIndex=450;pane.style.pointerEvents='none';
 // Each edge is drawn once: land is an unstroked fill, and coastlines and borders come from
 // topology meshes, so shared borders and coasts are never traced twice in different colours.
 const smooth={renderer,interactive:false,smoothFactor:1.5,lineCap:'round',lineJoin:'round'};
 const land={...smooth,stroke:false,fill:true,fillColor:'#f3f1e6',fillOpacity:1};
 const line=(color,weight,opacity=1)=>({...smooth,fill:false,color,weight,opacity});
 const lake={...smooth,stroke:false,fill:true,fillColor:'#dbe5e3',fillOpacity:1};
 const park={...smooth,stroke:true,color:'#5b9467',weight:0.8,opacity:0.65,fill:true,fillColor:'#6fa77a',fillOpacity:0.16};
 const geo=(topo,key,style)=>L.geoJSON(topojson.feature(topo,topo.objects[key]),{style});
 const mesh=(topo,key,filter,style)=>L.geoJSON(topojson.mesh(topo,topo.objects[key],filter),{style});
 const countries=t=>L.featureGroup([geo(t,'countries',land),mesh(t,'countries',(a,b)=>a===b,line('#a9bab7',0.7)),mesh(t,'countries',(a,b)=>a!==b,line('#a3a596',0.9))]);
 const river=(color,weight)=>line(color,weight,0.9);
 const layers={},labels=L.layerGroup().addTo(map);let cities=[],parkLabels=[],relief={peaks:[],ranges:[]};
 // Each layer: file, minimum zoom, maximum zoom, and how to build it once loaded.
 const plan=[
  ['countries','data/countries-50m.json',0,5.99,countries],
  ['countriesFine','data/countries-10m.json',6,99,countries],
  ['parks','data/parks.json',5,99,t=>geo(t,'parks',park)],
  ['waterMajor','data/water-major.json',4,99,t=>L.featureGroup([geo(t,'lakes',lake),geo(t,'rivers',river('#86aebd',1.2))])],
  ['waterMinor','data/water-minor.json',7,99,t=>L.featureGroup([geo(t,'lakes',lake),geo(t,'rivers',river('#86aebd',0.9))])],
  ['waterDetail','data/water-detail.json',9,99,t=>L.featureGroup([geo(t,'lakes',lake),geo(t,'rivers',river('#93b7c4',0.7))])],
  // Interior state borders only; the coast is already drawn with the countries.
  ['states','data/states-10m.json',3,99,t=>mesh(t,'states',(a,b)=>a!==b,line('#c1c4b6',0.8))],
 ];
 const loading=new Set();
 const ensure=([key,file,,,build])=>{if(layers[key]||loading.has(key))return;loading.add(key);getJSON(file).then(t=>{layers[key]=build(t);sync()}).catch(()=>{}).finally(()=>loading.delete(key))};
 const sync=()=>{
  const z=map.getZoom();
  for(const entry of plan){const [key,,min,max]=entry,on=z>=min&&z<=max,l=layers[key];
   // Keep the coarse outline until the detailed one has arrived.
   const fallback=key==='countries'&&z>=6&&!layers.countriesFine;
   if(on)ensure(entry);if(!l)continue;
   if((on||fallback)&&!map.hasLayer(l))l.addTo(map);if(!(on||fallback)&&map.hasLayer(l))l.remove()}
  // Draw order follows the plan: land, parks, water, then boundary lines on top.
  for(const [key] of plan)if(layers[key]&&map.hasLayer(layers[key])&&key!=='countries'&&key!=='countriesFine')layers[key].bringToFront();
  drawLabels(z);
 };
 const drawLabels=z=>{
  labels.clearLayers();const b=map.getBounds(),box={south:b.getSouth(),north:b.getNorth(),west:b.getWest(),east:b.getEast()};
  const items=[
   ...visibleLabels(cities,box,z).map(c=>({kind:'city',text:c[0],lat:c[4],lon:c[5]})),
   ...(showParkLabel(z)?parkLabels.filter(p=>inside(box,p[1],p[2])).map(p=>({kind:'park',text:p[0],lat:p[1],lon:p[2]})):[]),
   ...relief.ranges.filter(r=>showRange(r[3],z)&&inside(box,r[1],r[2])).sort((a,b)=>a[3]-b[3]).map(r=>({kind:'range',text:r[0],lat:r[1],lon:r[2]})),
   ...relief.peaks.filter(p=>showPeak(p[4],z)&&inside(box,p[2],p[3])).sort((a,b)=>b[1]-a[1]).map(p=>({kind:'peak',text:p[0]+' '+feet(p[1]),name:p[0],elevation:feet(p[1]),lat:p[2],lon:p[3]})),
  ];
  const blocked=obstacles().map(({x,y,r})=>({l:x-r,r:x+r,t:y-r,b:y+r}));
  for(const item of placeLabels(items,i=>map.latLngToContainerPoint([i.lat,i.lon]),60,blocked)){
   const cls=`map-label ${item.kind}${item.side==='left'?' left':''}`,style=item.dy?` style="margin-top:${item.dy}px"`:'';
   const html=item.kind==='peak'?`<span class="${cls}"${style}>${esc(item.name)} <b>${item.elevation}</b></span>`:`<span class="${cls}"${style}>${esc(item.text)}</span>`;
   L.marker([item.lat,item.lon],{pane:'basemapLabels',interactive:false,keyboard:false,icon:L.divIcon({className:'map-label-anchor',html,iconSize:[0,0]})}).addTo(labels);
  }
 };
 map.on('zoomend moveend',sync);map.on('basemap:refresh',()=>drawLabels(map.getZoom()));
 try{
  const first=await getJSON('data/countries-50m.json');layers.countries=plan[0][4](first);sync();
  Promise.all([getJSON('data/cities-labels.json'),getJSON('data/park-labels.json'),getJSON('data/relief.json')]).then(([c,p,r])=>{cities=c;parkLabels=p;relief=r;sync()}).catch(()=>{});
 }catch(error){onError?.(error)}
}
