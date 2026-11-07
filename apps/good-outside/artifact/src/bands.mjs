// Elevation bands for an area's detail forecast: below and above 3,000 ft, from terrain samples
// within the area's 10-mile radius. Used at build time.
export const BAND_M=914.4,MIN_SHARE=0.08;

// samples: [{e (metres), lat, lon, km (from the area's point)}].
// Returns {minFt, maxFt, below, above}; a band is null when under MIN_SHARE of the terrain lies in it.
// Each band's sample sits near that band's median elevation, preferring points close to the centre.
export function elevationBands(samples){
 const land=samples.filter(s=>Number.isFinite(s.e)&&s.e>0);if(!land.length)return null;
 const ft=m=>Math.round(m*3.28084);
 const pick=list=>{
  if(list.length/land.length<MIN_SHARE)return null;
  const sorted=list.map(s=>s.e).sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)];
  const best=list.reduce((a,s)=>{const score=((s.e-median)/100)**2+(s.km/8)**2;return score<a.score?{s,score}:a},{s:null,score:Infinity}).s;
  return {lat:+best.lat.toFixed(4),lon:+best.lon.toFixed(4),m:Math.round(best.e),share:+(list.length/land.length).toFixed(2)};
 };
 const es=land.map(s=>s.e);
 return {minFt:ft(Math.min(...es)),maxFt:ft(Math.max(...es)),below:pick(land.filter(s=>s.e<BAND_M)),above:pick(land.filter(s=>s.e>=BAND_M))};
}
