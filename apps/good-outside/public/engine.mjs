export const activities=['Hiking','Climbing','Biking','Bikepacking','Backpacking','Skiing','Backcountry skiing'];
export function dateKey(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
export function dates(start,days){const d=new Date(start+'T12:00:00');return Array.from({length:days},(_,i)=>{const x=new Date(d);x.setDate(d.getDate()+i);return dateKey(x)})}
export function tier(seconds){return !Number.isFinite(seconds)||seconds<0?'unknown':seconds<=7200?'near':seconds<=14400?'far':'outside'}
export function evaluate(forecast,start,days,activity,camping){
 const keys=dates(start,days),daily=forecast?.daily,hourly=forecast?.hourly;
 const unknown={level:'unknown',label:'Unranked',reason:'Complete trip forecast unavailable.',days:[]};
 if(!daily||!hourly)return unknown;
 const indexes=keys.map(k=>daily.time.indexOf(k));
 const fields=['temperature_2m_max','temperature_2m_min','precipitation_sum','precipitation_probability_max','wind_gusts_10m_max','snowfall_sum'];
 if(indexes.some(i=>i<0||fields.some(f=>!Number.isFinite(daily[f]?.[i]))))return unknown;
 const ski=activity.includes('skiing')||activity==='Skiing';let worst=2;const reasons=[];
 const rows=indexes.map((i,j)=>{
 const row={date:keys[j],high:daily.temperature_2m_max[i],low:daily.temperature_2m_min[i],rain:daily.precipitation_sum[i],prob:daily.precipitation_probability_max[i],gust:daily.wind_gusts_10m_max[i],snow:daily.snowfall_sum[i]};
 let score=2;const why=[];const mark=(n,s)=>{score=Math.min(score,n);why.push(s)};
 if(row.gust>65)mark(0,'strong gusts');else if(row.gust>35)mark(1,'breezy conditions');
 if(ski){if(row.high>8||row.high< -18)mark(0,'unfavorable ski temperatures');else if(row.high>3||row.high< -10)mark(1,'marginal ski temperatures');if(row.snow>25)mark(0,'heavy snowfall');else if(row.snow>10)mark(1,'snowfall');if(row.high>1&&row.rain>8)mark(0,'wet precipitation');}
 else {const rainPoor=activity==='Climbing'?3:(activity==='Bikepacking'||activity==='Biking')?10:15;const rainPass=activity==='Climbing'?0.5:3;if(row.rain>=rainPoor)mark(0,'wet conditions');else if(row.rain>rainPass||row.prob>45)mark(1,'rain possible');if(row.high<0||row.high>35)mark(0,'temperature extremes');else if(row.high<8||row.high>28)mark(1,'cool or hot daytime conditions');if(row.snow>1)mark(0,'snowfall');}
 // Use actual evening-through-morning hours for each night of the trip.
 if(camping!=='none'&&j<days-1){const next=keys[j+1];const night=hourly.time.map((t,k)=>({t,k})).filter(({t})=>(t.slice(0,10)===keys[j]&&+t.slice(11,13)>=20)||(t.slice(0,10)===next&&+t.slice(11,13)<=7));
 if(night.length!==12||night.some(({k})=>!Number.isFinite(hourly.temperature_2m?.[k])))return {...row,score:null,why:['overnight forecast incomplete']};
 row.nightLow=Math.min(...night.map(({k})=>hourly.temperature_2m[k]));if(row.nightLow<0)mark(0,'freezing overnight');else if(row.nightLow<7)mark(1,'cold overnight');}
 worst=Math.min(worst,score);reasons.push(...why);return {...row,score,why};});
 if(rows.some(r=>r.score===null))return {...unknown,reason:'Overnight forecast incomplete.'};
 return {level:['poor','passable','excellent'][worst],label:['Poor','Passable','Excellent'][worst],reason:[...new Set(reasons)].join(', ')||'Relatively dry, mild weather with lighter gusts.',days:rows};
}
