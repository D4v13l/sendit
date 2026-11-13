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
