// Tile-free basemap for the artifact: the page cannot load remote tiles, so it draws
// Natural Earth / US Census boundaries and GeoNames city labels from files shipped beside it.
const getJSON=async path=>{const r=await fetch(path);if(!r.ok)throw Error(path+' '+r.status);return r.json()};

export const ATTRIBUTION='Boundaries: <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a> · <a href="https://www.census.gov/geographies/mapping-files.html" target="_blank" rel="noopener">US Census</a> · Places: <a href="https://www.geonames.org/" target="_blank" rel="noopener">GeoNames</a> (CC BY 4.0)';

// Smallest population labelled at each zoom; labels are also capped per view.
export function labelThreshold(zoom){return zoom<4?2e6:zoom<5?7e5:zoom<6?2.5e5:zoom<7?1e5:zoom<8?4e4:15000}

export function visibleLabels(cities,bounds,zoom,max=150){
 const min=labelThreshold(zoom);
 return cities.filter(c=>c[3]>=min&&c[4]>=bounds.south&&c[4]<=bounds.north&&c[5]>=bounds.west&&c[5]<=bounds.east).sort((a,b)=>b[3]-a[3]).slice(0,max);
}

// Greedy placement, most populous first: a label is dropped if its box would overlap one already placed.
// project(city) gives its container pixel {x,y}; labels sit to the right of the dot.
export function placeLabels(candidates,project,max=45){
 const placed=[],boxes=[];
 for(const c of candidates){
  const {x,y}=project(c),box={l:x-4,r:x+10+c[0].length*6.2,t:y-9,b:y+9};
  if(boxes.some(o=>box.l<o.r&&box.r>o.l&&box.t<o.b&&box.b>o.t))continue;
  boxes.push(box);placed.push(c);if(placed.length>=max)break;
 }
 return placed;
}

export async function addBasemap(L,topojson,map,{onError}={}){
 const renderer=L.canvas({padding:0.3});
 const land={renderer,interactive:false,stroke:true,color:'#9aa595',weight:0.8,fill:true,fillColor:'#f3f1e6',fillOpacity:1};
 const thin=(color,weight,dash)=>({renderer,interactive:false,fill:false,color,weight,dashArray:dash});
 const layer=(topo,key,style)=>L.geoJSON(topojson.feature(topo,topo.objects[key]),{style});
 const coarse={},fine={},labels=L.layerGroup().addTo(map);let cities=[];
 const sync=()=>{
  const z=map.getZoom(),show=(l,on)=>{if(!l)return;if(on&&!map.hasLayer(l))l.addTo(map);if(!on&&map.hasLayer(l))l.remove()};
  show(coarse.countries,z<6||!fine.countries);show(fine.countries,z>=6);
  show(coarse.states,z>=3&&(z<7||!fine.counties));show(fine.counties,z>=8);
  // Draw order: land, then county lines, then state lines.
  for(const l of [fine.counties,coarse.states])if(l&&map.hasLayer(l))l.bringToFront();
  labels.clearLayers();const b=map.getBounds(),box={south:b.getSouth(),north:b.getNorth(),west:b.getWest(),east:b.getEast()};
  for(const c of placeLabels(visibleLabels(cities,box,z),c=>map.latLngToContainerPoint([c[4],c[5]])))L.circleMarker([c[4],c[5]],{renderer,radius:2,weight:0,fillColor:'#4f5a52',fillOpacity:0.9,interactive:false}).bindTooltip(c[0],{permanent:true,direction:'right',offset:[4,0],className:'city-label'}).addTo(labels);
 };
 map.on('zoomend moveend',sync);
 try{
  const [world,states]=await Promise.all([getJSON('data/countries-50m.json'),getJSON('data/states-10m.json')]);
  coarse.countries=layer(world,'countries',land);coarse.states=layer(states,'states',thin('#b4b9ad',0.7));sync();
  getJSON('data/cities-labels.json').then(c=>{cities=c;sync()}).catch(()=>{});
  // Large-scale outlines arrive after the first paint.
  getJSON('data/countries-10m.json').then(t=>{fine.countries=layer(t,'countries',land);sync()}).catch(()=>{});
  getJSON('data/counties-10m.json').then(t=>{fine.counties=layer(t,'counties',thin('#cfd1c6',0.5));sync()}).catch(()=>{});
 }catch(error){onError?.(error)}
}
