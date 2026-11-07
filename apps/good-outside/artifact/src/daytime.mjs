// Day-trip ratings use 8 am–6 pm instead of whole days. This rebuilds the forecast's daily values
// from its hourly ones for that window, so the planner's evaluate() and thresholds apply unchanged.
export const DAY_FROM=8,DAY_TO=18;
export const HOURLY_DAY_FIELDS=['temperature_2m','precipitation','precipitation_probability','wind_gusts_10m','snowfall'];

// Open-Meteo stamps instantaneous values (temperature) at the hour, and accumulations or maxima
// (precipitation, probability, gusts, snowfall) at the end of the hour they cover. So 8 am–6 pm is
// temperatures at 08:00–18:00 and accumulations stamped 09:00–18:00.
export function windowed(forecast,from=DAY_FROM,to=DAY_TO){
 const d=forecast?.daily,h=forecast?.hourly;if(!d?.time||!h?.time)return forecast;
 const index=new Map(h.time.map((t,i)=>[t,i])),pad=n=>String(n).padStart(2,'0');
 const values=(date,field,first,last)=>{const out=[];for(let hr=first;hr<=last;hr++){const i=index.get(`${date}T${pad(hr)}:00`),v=h[field]?.[i];out.push(i==null?NaN:v)}return out};
 const agg=(list,fn)=>list.length&&list.every(Number.isFinite)?fn(list):NaN;
 const sum=l=>l.reduce((a,b)=>a+b,0),daily={time:[...d.time],temperature_2m_max:[],temperature_2m_min:[],precipitation_sum:[],precipitation_probability_max:[],wind_gusts_10m_max:[],snowfall_sum:[]};
 for(const date of d.time){
  const temp=values(date,'temperature_2m',from,to);
  daily.temperature_2m_max.push(agg(temp,l=>Math.max(...l)));daily.temperature_2m_min.push(agg(temp,l=>Math.min(...l)));
  daily.precipitation_sum.push(agg(values(date,'precipitation',from+1,to),sum));
  daily.precipitation_probability_max.push(agg(values(date,'precipitation_probability',from+1,to),l=>Math.max(...l)));
  daily.wind_gusts_10m_max.push(agg(values(date,'wind_gusts_10m',from+1,to),l=>Math.max(...l)));
  daily.snowfall_sum.push(agg(values(date,'snowfall',from+1,to),sum));
 }
 return {...forecast,daily,window:[from,to]};
}
