// Tile-free basemap for the artifact: the page cannot load remote tiles, so it draws
// Natural Earth / US Census geography and GeoNames city labels from files shipped beside it.
// Shared by every map on the page, so the detail sheet's location map reuses what the main map loaded.
const loaded=new Map();
const getJSON=path=>{if(!loaded.has(path))loaded.set(path,fetch(path).then(r=>{if(!r.ok)throw Error(path+' '+r.status);return r.json()}).catch(e=>{loaded.delete(path);throw e}));return loaded.get(path)};

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
export const showRoadLabel=(rank,zoom)=>zoom>=8||(zoom>=7&&rank<=4);

// Greedy placement in priority order. Each label tries a few positions and is dropped only if
// every one would overlap a label already placed or a `blocked` box (the planner's own markers).
// Items are {kind, text, lat, lon}; project(item) gives container pixels {x,y}.
// City and peak names sit beside their dot, right then left; park and range names are centred,
// then nudged below or above. Placed items gain {side, dy} for rendering.
export function placeLabels(items,project,max=60,blocked=[]){
 const placed=[],boxes=[...blocked];
 const hits=box=>boxes.some(o=>box.l<o.r&&box.r>o.l&&box.t<o.b&&box.b>o.t);
 for(const item of items){
  const {x,y}=project(item),n=item.text.length,centred=item.kind==='range'||item.kind==='park'||item.kind==='road',half=item.kind==='road'?n*3.4+6:n*(item.kind==='range'?3.9:3.3);
  const options=centred?[0,16,-16].map(dy=>({side:'centre',dy,box:{l:x-half,r:x+half,t:y+dy-8,b:y+dy+8}})):[
   {side:'right',dy:0,box:{l:x-6,r:x+12+n*6.2,t:y-9,b:y+9}},{side:'left',dy:0,box:{l:x-12-n*6.2,r:x+6,t:y-9,b:y+9}}];
  const fit=options.find(o=>!hits(o.box));if(!fit)continue;
  boxes.push(fit.box);placed.push({...item,side:fit.side,dy:fit.dy});if(placed.length>=max)break;
 }
 return placed;
}

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const feet=m=>Math.round(m*3.28084).toLocaleString()+' ft';

// Map layers, bottom to top: land fill, the trip-weather surface, light hillshade (multiplied over
// both), then water, parks, highways and boundary lines, then labels. Returns {setWeather}.
// `extraLabels(box, zoom)` adds the caller's own place labels ({kind, text, lat, lon}) ahead of the rest.
export function createBasemap(L,topojson,map,{onError,obstacles=()=>[],extraLabels=()=>[]}={}){
 const pane=(name,z,extra={})=>{const p=map.createPane(name);p.style.zIndex=z;p.style.pointerEvents='none';Object.assign(p.style,extra);return p};
 pane('basemapLand',300);pane('weatherSurface',310);pane('hillshade',320,{mixBlendMode:'multiply'});pane('basemapLabels',450);
 const below=L.canvas({pane:'basemapLand',padding:0.3}),above=L.canvas({padding:0.3});
 // Each edge is drawn once: land is an unstroked fill, and coastlines and borders come from
 // topology meshes, so shared borders and coasts are never traced twice in different colours.
 const smooth={renderer:above,interactive:false,smoothFactor:1.5,lineCap:'round',lineJoin:'round'};
 const land={...smooth,renderer:below,stroke:false,fill:true,fillColor:'#f3f1e6',fillOpacity:1};
 const line=(color,weight,opacity=1)=>({...smooth,fill:false,color,weight,opacity});
 const lake={...smooth,stroke:false,fill:true,fillColor:'#dbe5e3',fillOpacity:1};
 const park={...smooth,stroke:true,color:'#5b9467',weight:0.8,opacity:0.65,fill:true,fillColor:'#6fa77a',fillOpacity:0.16};
 const geo=(topo,key,style)=>L.geoJSON(topojson.feature(topo,topo.objects[key]),{style});
 const mesh=(topo,key,filter,style)=>L.geoJSON(topojson.mesh(topo,topo.objects[key],filter),{style});
 const river=(color,weight)=>line(color,weight,0.9);
 const road=f=>f.properties.e?line('#c09466',1.5,0.85):line('#cdb08c',1,0.8);
 const shapes={};
 // Water is painted inside the map's own layers: the multiplied hillshade blends only with what
 // those layers draw, so without it open water would show the hillshade's white.
 L.rectangle([[-85,-540],[85,540]],{renderer:below,interactive:false,stroke:false,fill:true,fillColor:'#dbe5e3',fillOpacity:1}).addTo(map);
 const coast=t=>L.featureGroup([mesh(t,'countries',(a,b)=>a===b,line('#a9bab7',0.7)),mesh(t,'countries',(a,b)=>a!==b,line('#a3a596',0.9))]);
 const layers={},labels=L.layerGroup().addTo(map);let cities=[],parkLabels=[],relief={peaks:[],ranges:[]},roadLabels=[];
 // Each layer: key, file, minimum zoom, maximum zoom, and how to build it once loaded. Above-land
 // layers are drawn in this order.
 const plan=[
  ['land','data/countries-50m.json',0,5.99,t=>(shapes.coarse=topojson.feature(t,t.objects.countries),L.geoJSON(shapes.coarse,{style:land}))],
  ['landFine','data/countries-10m.json',6,99,t=>(shapes.fine=topojson.feature(t,t.objects.countries),L.geoJSON(shapes.fine,{style:land}))],
  ['parks','data/parks.json',5,99,t=>geo(t,'parks',park)],
  ['waterMajor','data/water-major.json',4,99,t=>L.featureGroup([geo(t,'lakes',lake),geo(t,'rivers',river('#86aebd',1.2))])],
  ['waterMinor','data/water-minor.json',7,99,t=>L.featureGroup([geo(t,'lakes',lake),geo(t,'rivers',river('#86aebd',0.9))])],
  ['waterDetail','data/water-detail.json',9,99,t=>L.featureGroup([geo(t,'lakes',lake),geo(t,'rivers',river('#93b7c4',0.7))])],
  ['roads','data/roads.json',5,99,t=>L.geoJSON(topojson.feature(t,t.objects.roads),{style:road})],
  ['coast','data/countries-50m.json',0,5.99,coast],
  ['coastFine','data/countries-10m.json',6,99,coast],
  // Interior state borders only; the coast is already drawn with the countries.
  ['states','data/states-10m.json',3,99,t=>mesh(t,'states',(a,b)=>a!==b,line('#c1c4b6',0.8))],
 ];
 const files=new Map(),fetchOnce=f=>{if(!files.has(f))files.set(f,getJSON(f).catch(e=>{files.delete(f);throw e}));return files.get(f)};
 const loading=new Set();
 const ensure=([key,file,,,build])=>{if(layers[key]||loading.has(key))return;loading.add(key);fetchOnce(file).then(t=>{layers[key]=build(t);if(key==='land'||key==='landFine')applyWeather();sync()}).catch(e=>{if(key==='land')onError?.(e)}).finally(()=>loading.delete(key))};
 // Hillshade images load once they come into view.
 let hillshadeIndex=[];const shaded=new Set();
 // The world layer always; sharper regional layers from regional zooms.
 const syncHillshade=()=>{const v=map.getBounds(),z=map.getZoom();for(const h of hillshadeIndex){if(shaded.has(h.url)||!v.intersects(h.bounds)||(z<5&&!h.url.endsWith('/world.jpg')))continue;shaded.add(h.url);L.imageOverlay(h.url,h.bounds,{pane:'hillshade',interactive:false}).addTo(map)}};
 const sync=()=>{
  const z=map.getZoom();
  for(const entry of plan){const [key,,min,max]=entry,on=z>=min&&z<=max,l=layers[key];
   // Keep the coarse outline until the detailed one has arrived.
   const fallback=(key==='land'||key==='coast')&&z>=6&&!layers[key+'Fine'];
   if(on)ensure(entry);if(!l)continue;
   if((on||fallback)&&!map.hasLayer(l))l.addTo(map);if(!(on||fallback)&&map.hasLayer(l))l.remove()}
  for(const [key] of plan)if(layers[key]&&map.hasLayer(layers[key])&&!key.startsWith('land'))layers[key].bringToFront();
  coastLayer.eachLayer(l=>l.bringToFront());
  syncHillshade();drawLabels(z);
 };
 const drawLabels=z=>{
  labels.clearLayers();const b=map.getBounds(),box={south:b.getSouth(),north:b.getNorth(),west:b.getWest(),east:b.getEast()};
  const own=extraLabels(box,z),taken=new Set(own.map(i=>i.text));
  const items=[...own,
   ...visibleLabels(cities,box,z).filter(c=>!taken.has(c[0])).map(c=>({kind:'city',text:c[0],lat:c[4],lon:c[5]})),
   ...(showParkLabel(z)?parkLabels.filter(p=>inside(box,p[1],p[2])).map(p=>({kind:'park',text:p[0],lat:p[1],lon:p[2]})):[]),
   ...roadLabels.filter(r=>showRoadLabel(r[3],z)&&inside(box,r[1],r[2])).sort((a,b)=>a[3]-b[3]).map(r=>({kind:'road',text:r[0],lat:r[1],lon:r[2]})),
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
 // Trip-weather surface: the caller paints a canvas over `bounds`; it is clipped to land here.
 let weather=null,weatherLayer=null;
 // Surf ratings drawn as thick coloured strokes along the coastline, above water and borders.
 const coastLayer=L.layerGroup().addTo(map);
 const applyWeather=()=>{
  if(weatherLayer){weatherLayer.remove();weatherLayer=null}
  if(!weather)return;const {canvas,bounds}=weather,shape=shapes.fine||shapes.coarse;
  const out=document.createElement('canvas');out.width=canvas.width;out.height=canvas.height;const ctx=out.getContext('2d');ctx.drawImage(canvas,0,0);
  if(shape)clipToLand(ctx,out.width,out.height,bounds,shape);
  weatherLayer=L.imageOverlay(out.toDataURL('image/png'),[[bounds.south,bounds.west],[bounds.north,bounds.east]],{pane:'weatherSurface',interactive:false}).addTo(map);
 };
 map.on('zoomend moveend',sync);map.on('basemap:refresh',()=>drawLabels(map.getZoom()));
 sync();
 Promise.all([getJSON('data/cities-labels.json'),getJSON('data/park-labels.json'),getJSON('data/relief.json'),getJSON('data/road-labels.json')]).then(([c,p,r,rl])=>{cities=c;parkLabels=p;relief=r;roadLabels=rl;sync()}).catch(()=>{});
 getJSON('data/hillshade-index.json').then(i=>{hillshadeIndex=i;syncHillshade()}).catch(()=>{});
 return {setWeather(canvas,bounds){weather=canvas?{canvas,bounds}:null;applyWeather()},
  setCoast(lines){coastLayer.clearLayers();for(const l of lines)L.polyline(l.latlngs,{renderer:above,interactive:false,color:l.color,weight:7,opacity:0.85,lineCap:'round',lineJoin:'round'}).addTo(coastLayer)}};
}

// Keeps only the parts of the canvas that fall on land, projecting lon/lat with Web Mercator.
const mercY=lat=>Math.log(Math.tan(Math.PI/4+Math.max(-85,Math.min(85,lat))*Math.PI/360));
export function clipToLand(ctx,width,height,bounds,shape){
 const yN=mercY(bounds.north),yS=mercY(bounds.south),pad=1;
 const px=lon=>(lon-bounds.west)/(bounds.east-bounds.west)*width,py=lat=>(yN-mercY(lat))/(yN-yS)*height;
 const near=f=>{const b=f.bbox||(f.bbox=bboxOf(f.geometry));return b&&b[0]<=bounds.east+pad&&b[2]>=bounds.west-pad&&b[1]<=bounds.north+pad&&b[3]>=bounds.south-pad};
 ctx.save();ctx.globalCompositeOperation='destination-in';ctx.beginPath();
 for(const f of shape.features){if(!f.geometry||!near(f))continue;const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
  for(const poly of polys)for(const ring of poly)ring.forEach(([lon,lat],i)=>i?ctx.lineTo(px(lon),py(lat)):ctx.moveTo(px(lon),py(lat)))}
 ctx.fillStyle='#000';ctx.fill('evenodd');ctx.restore();
}
function bboxOf(g){if(!g)return null;let w=180,s=90,e=-180,n=-90;const polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;for(const p of polys)for(const r of p)for(const [x,y] of r){if(x<w)w=x;if(x>e)e=x;if(y<s)s=y;if(y>n)n=y}return [w,s,e,n]}
