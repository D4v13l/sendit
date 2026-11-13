// Conditions around the trip that the planner's evaluate() does not look at: rain in the days before
// a climbing trip, and the freezing level.
export const PAST_DAYS=2;
// Rain in the 48 hours before the first morning: from DAMP_MM a note, from WET_MM an Excellent day
// drops to Passable, from SOAKED_MM to Poor. Rough rules: rock type, sun, wind and aspect change how
// fast rock dries.
export const DAMP_MM=1,WET_MM=5,SOAKED_MM=20;
// The engine's reason when nothing marked a day down.
const DRY_REASON='Relatively dry, mild weather with lighter gusts.';

const pad=n=>String(n).padStart(2,'0');
export function shiftDate(key,days){const d=new Date(key+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}

// Precipitation in the `hours` before `startHour` on `date`. Open-Meteo stamps each hour's
// precipitation at the end of that hour, so the 48 hours before 08:00 are the stamps 08:00 back to
// 09:00 two days earlier. Without those hours, falls back to the two days' daily totals.
// Returns {mm, basis: 'hourly'|'daily'}, or null when the forecast does not reach back that far.
export function rainBefore(forecast,date,startHour=8,hours=48){
 const h=forecast?.hourly,d=forecast?.daily;
 if(Array.isArray(h?.time)&&Array.isArray(h?.precipitation)){
  const index=new Map(h.time.map((t,i)=>[t,i])),end=Date.parse(`${date}T${pad(startHour)}:00:00Z`);let mm=0,complete=true;
  for(let k=0;k<hours&&complete;k++){const stamp=new Date(end-k*3600e3).toISOString().slice(0,16),v=h.precipitation[index.get(stamp)];if(Number.isFinite(v))mm+=v;else complete=false}
  if(complete)return {mm,basis:'hourly'};
 }
 if(Array.isArray(d?.time)&&Array.isArray(d?.precipitation_sum)){
  const vals=[shiftDate(date,-2),shiftDate(date,-1)].map(k=>d.precipitation_sum[d.time.indexOf(k)]);
  if(vals.every(Number.isFinite))return {mm:vals[0]+vals[1],basis:'daily'};
 }
 return null;
}

const mmText=mm=>(mm<10?mm.toFixed(1):String(Math.round(mm)))+' mm';
// A climbing assessment adjusted for rain before the trip. Adds `wetBefore` when the rain is known.
export function wetRock(assessment,rain){
 if(!rain||!assessment||assessment.level==='unknown')return assessment;
 const a={...assessment,wetBefore:rain},mm=rain.mm;
 if(mm<DAMP_MM)return a;
 const note=`${mmText(mm)} of rain ${rain.basis==='hourly'?'in the 48 hours before the first morning':'in the two days before'}`,dry=assessment.reason===DRY_REASON;
 if(mm>=SOAKED_MM&&assessment.level!=='poor')return {...a,level:'poor',label:'Poor',reason:`${note}: expect wet rock, seepage and muddy approaches`+(dry?'':'; '+assessment.reason)};
 if(mm>=WET_MM&&assessment.level==='excellent')return {...a,level:'passable',label:'Passable',reason:`dry on the day, but ${note}: rock and approaches may still be wet`};
 return {...a,reason:(dry?'dry on the day':assessment.reason)+`; ${note}, so shaded or slow-drying rock may be damp`};
}

// Lowest and highest freezing level (metres above sea level) over hours `from`–`to` on `date`.
export function freezingRange(forecast,date,from=0,to=23){
 const h=forecast?.hourly;if(!Array.isArray(h?.time)||!Array.isArray(h?.freezing_level_height))return null;
 const index=new Map(h.time.map((t,i)=>[t,i])),vals=[];
 for(let hr=from;hr<=to;hr++){const v=h.freezing_level_height[index.get(`${date}T${pad(hr)}:00`)];if(Number.isFinite(v))vals.push(v)}
 return vals.length?{low:Math.min(...vals),high:Math.max(...vals)}:null;
}
// Snow usually reaches about 300 m (1,000 ft) below the freezing level.
export const SNOW_BELOW_FREEZING_M=300;

// Skiing: the snow surface the days before leave behind, at the forecast point (an area's mapped
// point, usually near the base). From the 72 hours before the first morning: new snow; rain (hours
// above +1 °C with precipitation); melt–freeze (a day above +3 °C and below −2 °C); no freeze at all.
export const SKI_PAST_DAYS=3,FRESH_CM=5,RAIN_ON_SNOW_MM=5,THIN_CM=10;
const isSki=activity=>activity==='Skiing'||activity==='Backcountry skiing';
export const pastDaysFor=activity=>isSki(activity)?SKI_PAST_DAYS:activity==='Climbing'?PAST_DAYS:0;
// Open-Meteo reports snowfall in cm at about 7 cm per 10 mm of water.
const CM_PER_MM=0.7;
export function snowBefore(forecast,date,startHour=8,hours=72){
 const h=forecast?.hourly,d=forecast?.daily,days=[shiftDate(date,-3),shiftDate(date,-2),shiftDate(date,-1)];
 const daily=f=>days.map(k=>d?.[f]?.[d.time.indexOf(k)]);
 let newCm=null,rainMm=null,basis=null;
 if(Array.isArray(h?.time)&&Array.isArray(h?.snowfall)&&Array.isArray(h?.precipitation)&&Array.isArray(h?.temperature_2m)){
  const index=new Map(h.time.map((t,i)=>[t,i])),end=Date.parse(`${date}T${pad(startHour)}:00:00Z`);let snow=0,rain=0,complete=true;
  for(let k=0;k<hours&&complete;k++){const i=index.get(new Date(end-k*3600e3).toISOString().slice(0,16)),s=h.snowfall[i],p=h.precipitation[i],t=h.temperature_2m[i];
   if(![s,p,t].every(Number.isFinite)){complete=false;break}snow+=s;if(t>1)rain+=p}
  if(complete){newCm=snow;rainMm=rain;basis='hourly'}
 }
 if(newCm==null){const s=daily('snowfall_sum'),p=daily('precipitation_sum');if(s.every(Number.isFinite)&&p.every(Number.isFinite)){newCm=s.reduce((a,b)=>a+b,0);rainMm=p.reduce((a,v,i)=>a+Math.max(0,v-s[i]/CM_PER_MM),0);basis='daily'}}
 if(newCm==null)return null;
 const hi=daily('temperature_2m_max'),lo=daily('temperature_2m_min'),temps=hi.every(Number.isFinite)&&lo.every(Number.isFinite);
 const depth=h?.snow_depth?.[h?.time?.indexOf(`${date}T${pad(startHour)}:00`)];
 const week=Array.from({length:7},(_,i)=>d?.snowfall_sum?.[d.time.indexOf(shiftDate(date,-7+i))]);
 return {newCm,rainMm,basis,meltFreeze:temps&&hi.some((x,i)=>x>=3&&lo[i]<=-2),noFreeze:temps&&lo.every(x=>x>0),
  depthCm:Number.isFinite(depth)?depth*100:null,weekCm:week.every(Number.isFinite)?week.reduce((a,b)=>a+b,0):null};
}

const cmText=cm=>(cm<10?cm.toFixed(1):String(Math.round(cm)))+' cm';
// A ski assessment adjusted for the snow surface; adds `snow` when the days before are known. New
// snow of FRESH_CM or more covers a crust, so the surface rules only apply without it. Model snow
// depth is coarse (one value across a whole mountain), so it only caps a rating at Passable.
export function skiConditions(assessment,snow){
 if(!snow||!assessment||assessment.level==='unknown')return assessment;
 const fresh=snow.newCm>=FRESH_CM,notes=[];let cap=false;
 if(snow.newCm>=1)notes.push(`${cmText(snow.newCm)} of new snow in the 72 hours before`);
 if(!fresh&&snow.rainMm>=RAIN_ON_SNOW_MM){cap=true;notes.push(`${snow.rainMm.toFixed(snow.rainMm<10?1:0)} mm of rain in the 72 hours before: expect crust or wet snow`)}
 else if(!fresh&&snow.meltFreeze){cap=true;notes.push('melt–freeze in the days before: firm or icy early, softening later')}
 else if(!fresh&&snow.noFreeze){cap=true;notes.push('no overnight freeze in the days before: soft, wet snow')}
 if(!fresh&&snow.depthCm!=null&&snow.depthCm<THIN_CM){cap=true;notes.push(`little snow on the ground in the weather model (${cmText(snow.depthCm)})`)}
 const level=cap&&assessment.level==='excellent'?'passable':assessment.level;
 const base=assessment.reason===DRY_REASON?'':assessment.reason;
 return {...assessment,level,label:level==='passable'?'Passable':assessment.label,snow,reason:[base,...notes].filter(Boolean).join('; ')||assessment.reason};
}
