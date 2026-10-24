const $=id=>document.getElementById(id);
const samples={hike:'Gorham',mtb:'Saguaro',ski:'Steg',trailrun:'Dead Horse',climb:'Serenity',nationalparks:'Acadia'};
const grades={green:'Easy',greenBlue:'Easy / intermediate',blue:'Intermediate',blueBlack:'Intermediate / difficult',black:'Difficult',dblack:'Very difficult'};
let offline=false,nextFrom=null,searchController,routeController,activeQuery='',activeSite='',activeSort='',items=[];
const el=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
const status=(message,error=false)=>{$('status').textContent=message;$('status').classList.toggle('error',error);};
async function request(path,signal){const r=await fetch(path,{signal});const data=await r.json();if(!r.ok)throw Error(data.error||`HTTP ${r.status}`);return data;}
function lengthText(length){if(!length)return 'Length unavailable';return length.unit==='m'?`${(length.value/1000).toFixed(1)} km`:`${length.value} ${length.unit}`;}
function safeLink(url){try{const u=new URL(url);return u.protocol==='https:'&&['www.hikingproject.com','www.mtbproject.com','www.powderproject.com','www.trailrunproject.com','www.mountainproject.com'].includes(u.hostname)?u.href:null;}catch{return null;}}
function renderResults(){
  $('results').replaceChildren();
  items.forEach(item=>{
    const b=el('button',undefined,'route');b.type='button';b.setAttribute('aria-pressed','false');
    const grade=item.difficulty?.string;
    b.append(el('span',grades[grade]||grade||'Unrated','grade'),el('strong',item.title),el('span',item.breadcrumbs||'Location unavailable','location'));
    const stats=el('span',undefined,'stats');stats.append(el('span',lengthText(item.length)),el('span',typeof item.rating==='number'?`★ ${item.rating.toFixed(1)}`:'Not rated'));b.append(stats);
    b.addEventListener('click',()=>{document.querySelectorAll('.route').forEach(n=>{n.classList.remove('selected');n.setAttribute('aria-pressed','false');});b.classList.add('selected');b.setAttribute('aria-pressed','true');showRoute(item);});
    $('results').append(b);
  });
  if(!items.length)$('results').append(el('p','No routes found. Try a different name or place.'));
}
async function search(append=false){
  searchController?.abort();routeController?.abort();searchController=new AbortController();
  const controller=searchController;
  if(!append){activeQuery=$('query').value.trim();activeSite=$('site').value;activeSort=$('sort').value;items=[];nextFrom=null;$('results').replaceChildren();$('count').textContent='';$('more').hidden=true;$('detail').replaceChildren(el('div','Choose a search result to inspect its route.','empty'));}
  $('search-button').disabled=true;$('more').disabled=true;status('Searching…');
  try{
    const params=new URLSearchParams({site:activeSite,q:activeQuery,sort:activeSort,from:String(append?nextFrom:0)});
    const data=await request('/api/search?'+params,controller.signal);
    items.push(...data.items);nextFrom=data.nextFrom;renderResults();$('more').hidden=nextFrom===null;$('count').textContent=`${items.length} of ${data.total}${data.totalRelation==='gte'?'+':''}`;
    status(offline?'Synthetic examples. These are invented routes, not live trail information.':`Found ${data.total}${data.totalRelation==='gte'?'+':''} matching routes.`);
  }catch(error){if(error.name!=='AbortError')status(`${error.message}. Check your connection or run npm run demo:offline.`,true);}
  finally{if(controller===searchController){$('search-button').disabled=false;$('more').disabled=false;}}
}
function drawGeometry(geometry){
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 640 285');svg.classList.add('route-view');svg.setAttribute('role','img');svg.setAttribute('aria-label','Route geometry preview without a basemap');
  const make=(tag,attrs)=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);svg.append(n);return n;};
  for(let x=0;x<640;x+=40)make('path',{d:`M${x} 0V285`,class:'grid'});
  for(let y=0;y<285;y+=40)make('path',{d:`M0 ${y}H640`,class:'grid'});
  const lines=geometry.type==='LineString'?[geometry.coordinates]:geometry.coordinates;
  const points=lines.flat();let minLon=Infinity,maxLon=-Infinity,minLat=Infinity,maxLat=-Infinity;
  for(const p of points){minLon=Math.min(minLon,p[0]);maxLon=Math.max(maxLon,p[0]);minLat=Math.min(minLat,p[1]);maxLat=Math.max(maxLat,p[1]);}
  // Local equirectangular preview. Not intended for polar/dateline navigation.
  const cos=Math.max(.05,Math.cos((minLat+maxLat)/2*Math.PI/180));const width=(maxLon-minLon)*cos,height=maxLat-minLat;
  const scale=Math.min(560/(width||1e-8),205/(height||1e-8));
  const xy=p=>[320+(p[0]-(minLon+maxLon)/2)*cos*scale,142.5-(p[1]-(minLat+maxLat)/2)*scale];
  for(const line of lines)make('path',{d:line.map((p,i)=>(i?'L':'M')+xy(p).map(v=>v.toFixed(2)).join(' ')).join(' ')});
  if(points.length){const[x,y]=xy(points[0]);make('circle',{cx:x,cy:y,r:6});}
  make('text',{x:605,y:24}).textContent='N ↑';return svg;
}
async function showRoute(item){
  routeController?.abort();routeController=new AbortController();const controller=routeController;
  $('detail').replaceChildren(el('div','Loading route…','empty'));
  try{
    const id=item.id.split('.').at(-1);if(!/^\d+$/.test(id))throw Error('Unexpected route ID');
    const record=await request('/api/route?'+new URLSearchParams({site:activeSite,id}),controller.signal);
    const isTrail=record.type==='Feature',p=isTrail?record.properties:record;
    const header=el('div',undefined,'detail-header');header.append(el('h2',p.title),el('p',p.cityState||p.summary||item.breadcrumbs||''));
    $('detail').replaceChildren(header);
    if(isTrail){$('detail').append(drawGeometry(record.geometry),el('p','Gold marker: start. Geometry preview only; no basemap or navigation guidance.','figure-note'));}
    else $('detail').append(el('div',record.parent?.coordinates?`Parent area: ${record.parent.name||'Unknown'} • ${record.parent.coordinates.join(', ')}. This is an area location, not a traced climbing route.`:'This climbing record has no route line.','notice'));
    const metrics=el('div',undefined,'metrics');
    const fields=isTrail?[[typeof p.length==='number'?`${(p.length/1000).toFixed(1)} km`:'—','Distance'],[typeof p.ascent==='number'?`${Math.round(p.ascent)} m`:'—','Ascent'],[typeof p.stars==='number'?p.stars.toFixed(1):'—','Rating']]:[[p.difficulty||'—','Grade'],[p.pitches??'—','Pitches'],[p.height_feet?`${p.height_feet} ft`:'—','Height']];
    for(const[value,label]of fields){const m=el('div',undefined,'metric');m.append(el('strong',String(value)),el('span',label));metrics.append(m);}$('detail').append(metrics);
    const body=el('div',undefined,'detail-body');
    if(item.description)body.append(el('p',item.description));
    if(!isTrail&&record.sections?.length)body.append(el('p','Climbing descriptions and access notes are available in the source record below. HTML is shown as text, never executed.'));
    const actions=el('div',undefined,'actions');const url=safeLink(record.url||item.url);
    if(url){const a=el('a','Open original');a.href=url;a.target='_blank';a.rel='noopener noreferrer';actions.append(a);}
    const download=el('button','Download JSON','secondary');download.onclick=()=>{const u=URL.createObjectURL(new Blob([JSON.stringify(record,null,2)],{type:'application/json'}));const a=el('a');a.href=u;a.download=`${activeSite}-${id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};actions.append(download);body.append(actions);
    const details=el('details');details.append(el('summary','Inspect source JSON'),el('pre',JSON.stringify(record,null,2)));body.append(details);$('detail').append(body);
  }catch(error){if(error.name!=='AbortError')$('detail').replaceChildren(el('div',`Could not load route: ${error.message}`,'notice'));}
}
$('search-form').addEventListener('submit',e=>{e.preventDefault();search();});
$('more').addEventListener('click',()=>search(true));
$('site').addEventListener('change',()=>{$('query').value=offline?'a':samples[$('site').value];$('scope-note').hidden=$('site').value!=='nationalparks';});
try{const config=await request('/api/config');offline=config.offline;$('mode').textContent=offline?'Offline sample data':'Live API';$('mode').classList.toggle('offline',offline);if(offline)$('query').value='a';await search();}
catch(error){status(error.message,true);}
