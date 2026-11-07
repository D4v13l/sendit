// Surf ratings for a stretch of open coast, from Open-Meteo marine and wind forecasts.
// Each daylight hour scores 0 Poor / 1 Passable / 2 Excellent on size, period, swell direction
// and wind, taking the worst. A day is its best three-hour session; a trip is its worst day.
// Tides and water temperature are shown, not rated: which tide works depends on the break.
export const MARINE_HOURLY=['wave_height','swell_wave_height','swell_wave_period','swell_wave_direction','sea_surface_temperature','sea_level_height_msl'];
export const WIND_HOURLY=['wind_speed_10m','wind_direction_10m','wind_gusts_10m'];
const LEVELS=['poor','passable','excellent'],LABELS=['Poor','Passable','Excellent'];

// Smallest angle between two compass bearings.
export const angle=(a,b)=>{const d=Math.abs(((a-b)%360+360)%360);return d>180?360-d:d};

// seaward: compass bearing pointing out to sea. Directions are where swell and wind come FROM.
export function hourScore(h,seaward){
 const size=h.swell??h.wave;if(!Number.isFinite(size)||!Number.isFinite(h.period))return {score:null,why:[]};
 let score=2;const why=[];const mark=(n,s)=>{score=Math.min(score,n);why.push(s)};
 if(size<0.5)mark(0,'flat');else if(size<0.9)mark(1,'small surf');else if(size>4)mark(0,'very large surf');else if(size>2.5)mark(1,'large surf');
 if(h.period<7)mark(0,'short-period wind swell');else if(h.period<10)mark(1,'moderate swell period');
 if(Number.isFinite(h.swellDir)){const off=angle(h.swellDir,seaward);if(off>100)mark(0,'swell blocked from this coast');else if(off>60)mark(1,'swell at a steep angle to this coast')}
 if(Number.isFinite(h.wind)){
  const offshore=Number.isFinite(h.windDir)?angle(h.windDir,(seaward+180)%360):90;
  if(h.wind>35||h.gust>55)mark(0,'strong wind');
  else if(h.wind<10){}
  else if(offshore<=60){if(h.wind>30)mark(1,'strong offshore wind')}
  else if(offshore<=120){if(h.wind>18)mark(0,'strong cross-shore wind');else mark(1,'cross-shore wind')}
  else if(h.wind>12)mark(0,'onshore wind');else mark(1,'light onshore wind');
 }else mark(1,'wind unknown');
 return {score,why};
}

const pad=n=>String(n).padStart(2,'0');
// marine/wind: Open-Meteo responses for one point (hourly arrays with matching local times).
export function rateSurf(marine,wind,seaward,dates,[from,to]=[8,18]){
 const unknown={level:'unknown',label:'Unranked',reason:'Complete surf forecast unavailable.',days:[]};
 const mh=marine?.hourly,wh=wind?.hourly;if(!mh?.time)return unknown;
 const mi=new Map(mh.time.map((t,i)=>[t,i])),wi=new Map((wh?.time||[]).map((t,i)=>[t,i]));
 const days=[];let worst=2;const reasons=[];
 for(const date of dates){
  const hours=[];
  for(let hr=from;hr<=to;hr++){
   const t=`${date}T${pad(hr)}:00`,i=mi.get(t),j=wi.get(t);if(i==null){hours.push(null);continue}
   const h={hour:hr,wave:mh.wave_height?.[i],swell:mh.swell_wave_height?.[i],period:mh.swell_wave_period?.[i],swellDir:mh.swell_wave_direction?.[i],water:mh.sea_surface_temperature?.[i],
    wind:j==null?NaN:wh.wind_speed_10m?.[j],windDir:j==null?NaN:wh.wind_direction_10m?.[j],gust:j==null?NaN:wh.wind_gusts_10m?.[j]};
   hours.push({...h,...hourScore(h,seaward)});
  }
  // Best three-hour session: the window whose weakest hour is strongest, earliest first.
  let best=null;
  for(let k=0;k+2<hours.length;k++){const w=hours.slice(k,k+3);if(w.some(x=>!x||x.score==null))continue;const s=Math.min(...w.map(x=>x.score));if(!best||s>best.score)best={score:s,hours:w}}
  if(!best)return {...unknown,reason:'Surf forecast incomplete for '+date+'.'};
  const mid=best.hours[1],tides=tideTurns(mh,date);
  days.push({date,score:best.score,from:best.hours[0].hour,to:best.hours[2].hour+1,swellM:mid.swell??mid.wave,period:mid.period,swellDir:mid.swellDir,wind:mid.wind,windDir:mid.windDir,water:mid.water,why:[...new Set(best.hours.flatMap(x=>x.why))],tides});
  worst=Math.min(worst,best.score);reasons.push(...days.at(-1).why);
 }
 return {level:LEVELS[worst],label:LABELS[worst],reason:[...new Set(reasons)].join(', ')||'Good size and period with favourable wind.',days};
}

// Local highs and lows of sea level (tide plus surge) during a date, as [{time:'HH:00', high}].
export function tideTurns(mh,date){
 const out=[],level=mh.sea_level_height_msl;if(!level)return out;
 for(let i=1;i<mh.time.length-1;i++){
  if(!mh.time[i].startsWith(date))continue;const a=level[i-1],b=level[i],c=level[i+1];
  if(![a,b,c].every(Number.isFinite))continue;
  if(b>a&&b>=c)out.push({time:mh.time[i].slice(11,16),high:true});else if(b<a&&b<=c)out.push({time:mh.time[i].slice(11,16),high:false});
 }
 return out;
}
