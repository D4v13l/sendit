// Where an area sits, in words: direction and distance from the starting point and from nearby
// towns. Places are GeoNames rows [name, countryCode, adminCode, population, lat, lon].
const rad=Math.PI/180;
const WORDS=['north','north-northeast','northeast','east-northeast','east','east-southeast','southeast','south-southeast','south','south-southwest','southwest','west-southwest','west','west-northwest','northwest','north-northwest'];

export function distanceKm([a,b],[c,d]){const x=Math.sin((c-a)*rad/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin((d-b)*rad/2)**2;return 12742*Math.asin(Math.sqrt(x))}
// Initial great-circle bearing from the first point to the second, in degrees from north.
export function bearing([a,b],[c,d]){const y=Math.sin((d-b)*rad)*Math.cos(c*rad),x=Math.cos(a*rad)*Math.sin(c*rad)-Math.sin(a*rad)*Math.cos(c*rad)*Math.cos((d-b)*rad);return (Math.atan2(y,x)/rad+360)%360}
export const direction=deg=>WORDS[Math.round(deg/22.5)%16];
// Alphabetic admin codes (US states, Canadian provinces) are readable; numeric GeoNames codes are not.
export const townName=r=>[r[0],/^[A-Z]{2,3}$/.test(r[2])?r[2]:''].filter(Boolean).join(', ');

// Reference places for an area, each with distance and direction from the place to the area:
// `town`, the nearest place of 5,000+ within 60 km; `nearest`, any place much closer than that town;
// and `city`, the nearest place of 50,000+ within 40 km when the town is small. Small places include
// census areas with unfamiliar names, so a larger neighbour is named beside them.
export function nearbyPlaces(rows,at,{town=5000,townKm=60,city=50000,cityKm=40,smallTown=20000}={}){
 let nearest=null,known=null,large=null;
 for(const r of rows){
  // Cheap bounding test first: 1° of latitude is about 111 km.
  if(Math.abs(r[4]-at[0])>1)continue;
  const km=distanceKm([r[4],r[5]],at);
  if(!nearest||km<nearest.km)nearest={row:r,km};
  if(r[3]>=town&&km<=townKm&&(!known||km<known.km))known={row:r,km};
  if(r[3]>=city&&km<=cityKm&&(!large||km<large.km))large={row:r,km};
 }
 const out=x=>x&&{name:townName(x.row),km:x.km,direction:x.km<0.5?null:direction(bearing([x.row[4],x.row[5]],at)),population:x.row[3]};
 const closer=nearest&&nearest.row!==known?.row&&(!known||nearest.km<known.km/2);
 const larger=large&&large.row!==known?.row&&(!known||known.row[3]<smallTown);
 return {nearest:closer?out(nearest):null,town:out(known),city:larger?out(large):null};
}

// Places to label on a map view: the towns closest to the area first, then the largest in view.
export function townsInView(rows,box,at,max=10,{close=4,min=2000}={}){
 const inView=[];
 for(const r of rows)if(r[3]>=min&&r[4]>=box.south&&r[4]<=box.north&&r[5]>=box.west&&r[5]<=box.east)inView.push(r);
 const near=at?[...inView].sort((a,b)=>distanceKm([a[4],a[5]],at)-distanceKm([b[4],b[5]],at)).slice(0,close):[];
 return [...new Set([...near,...inView.sort((a,b)=>b[3]-a[3])])].slice(0,max);
}

const dist=km=>(km<10?km.toFixed(1):Math.round(km))+' km ('+(km*0.621371<10?(km*0.621371).toFixed(1):Math.round(km*0.621371))+' mi)';
// ["56 km (35 mi) east-southeast of Seattle, WA, US (straight line)", "13 km (8.1 mi) east-southeast of North Bend, WA"].
export function locationLine(at,origin,places){
 const parts=[];
 if(origin){const km=distanceKm([origin.lat,origin.lon],at);parts.push(km<0.5?'At your starting point':dist(km)+' '+direction(bearing([origin.lat,origin.lon],at))+' of '+origin.name+' (straight line)')}
 const {nearest,town,city}=places||{},from=p=>p.direction?dist(p.km)+' '+p.direction+' of '+p.name:'In '+p.name;
 // At most two places: a much closer small place and a city say more than a town between them.
 for(const p of [nearest,nearest&&city?null:town,city])if(p)parts.push(from(p));
 return parts;
}
