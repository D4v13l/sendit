// Offline starting-point search over GeoNames cities (population 1,000+), shipped with the page.
// Rows: [name, countryCode, adminCode, population, lat, lon].
const fold=s=>String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
let index=null;
export async function loadPlaces(path='data/cities-search.json'){
 if(!index)index=fetch(path).then(r=>{if(!r.ok)throw Error('Place list unavailable');return r.json()}).then(rows=>rows.map(r=>({row:r,key:fold(r[0])})));
 return index.catch(e=>{index=null;throw e});
}
// Alphabetic admin codes (US states, Canadian provinces) are readable; numeric GeoNames codes are not.
export const placeLabel=r=>[r[0],/^[A-Z]{2,3}$/.test(r[2])?r[2]:'',r[1]].filter(Boolean).join(', ');
// "boulder co" matches Boulder in Colorado; "boulder, us" narrows by country.
export function searchPlaces(entries,query,limit=6){
 const words=fold(query).split(' ').filter(Boolean);if(!words.length)return [];
 const results=[];
 for(let n=words.length;n>=1&&!results.length;n--){
  const name=words.slice(0,n).join(' '),rest=words.slice(n);
  for(const e of entries){
   if(!e.key.startsWith(name))continue;
   const codes=[e.row[1].toLowerCase(),e.row[2].toLowerCase()];
   if(rest.every(w=>codes.includes(w)))results.push({...e,exact:e.key===name});
  }
 }
 return results.sort((a,b)=>b.exact-a.exact||b.row[3]-a.row[3]).slice(0,limit).map(e=>e.row);
}
