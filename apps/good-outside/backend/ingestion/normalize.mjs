export const SKI_ATTRIBUTION = "Data from OpenSkiData / OpenSkiMap.org, © OpenStreetMap contributors (ODbL), Skimap.org, Who's On First, © Mapterhorn";
export function validCoordinate(lat,lon) { return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180; }
export function normalizeSki(feature, fetchedAt) {
 const p=feature.properties; if(!p?.name?.trim())return null;
 const upstream=(p.sources??[]).map(s=>`${s.type}:${s.id}`).sort();
 const sourceId=p.wikidataID?`wikidata:${p.wikidataID}`:upstream[0]; if(!sourceId)return null;
 const xy=feature.geometry?.type==='Point'?feature.geometry.coordinates:p.viewportHint?.center;
 if(!xy||!validCoordinate(xy[1],xy[0]))return null;
 const activities=(p.activities??[]).flatMap(a=>a==='downhill'?['downhill_skiing']:a==='nordic'?['cross_country_skiing']:[]); if(!activities.length)return null;
 const src=(p.sources??[]).find(s=>s.type==='openstreetmap');const ski=(p.sources??[]).find(s=>s.type==='skimap.org');
 return {sourceId,name:p.name,lat:xy[1],lon:xy[0],activities,sourceUrl:src?`https://www.openstreetmap.org/${src.id}`:ski?`https://skimap.org/SkiAreas/view/${ski.id}`:'https://www.openskidata.org/',license:'ODbL-1.0',attribution:SKI_ATTRIBUTION,country:p.places?.[0]?.localized?.en?.country??'Unknown',sourceFetchedAt:fetchedAt,lastVerifiedAt:fetchedAt,access:'unknown',camp:'unknown',status:p.status??'unknown',upstreamSources:upstream,activityEvidence:{sourceStatus:p.status??'unknown',outdoor:'unknown',sourceActivities:p.activities,coordinateKind:feature.geometry?.type==='Point'?'source point':'source viewport center',avalanche:'unknown',backcountry:'unknown'}};
}
export function normalizeOpenBeta(a,fetchedAt) {
 const {lat,lng:lon}=a.metadata??{};if(!a.metadata?.leaf||!a.uuid||!a.area_name?.trim()||!validCoordinate(lat,lon)||(lat===0&&lon===0)||!a.totalClimbs)return null;
 const disciplines=Object.fromEntries(Object.entries(a.aggregate?.byDiscipline??{}).filter(([,v])=>v?.total>0).map(([k,v])=>[k,v.total]));
 return {sourceId:a.uuid,name:a.area_name,lat,lon,activities:['climbing'],sourceUrl:`https://openbeta.io/area/${a.uuid}`,license:'CC0-1.0',attribution:'OpenBeta contributors (CC0; excludes photos)',country:a.pathTokens?.[0]??'Unknown',sourceFetchedAt:fetchedAt,lastVerifiedAt:fetchedAt,access:'unknown',camp:'unknown',activityEvidence:{totalClimbs:a.totalClimbs,disciplines,path:a.pathTokens,access:'unverified'}};
}
export async function fetchJson(url,options={},fetcher=fetch){for(let i=0;i<3;i++){try{const r=await fetcher(url,{...options,signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error(`HTTP ${r.status}`);const data=await r.json();if(data.errors)throw Error(JSON.stringify(data.errors));return data;}catch(e){if(i===2)throw e;await new Promise(r=>setTimeout(r,1000*2**i));}}}
export async function fetchOpenBetaPage(offset=0,limit=500,fetcher=fetch){const query=`{areas(filter:{leaf_status:{isLeaf:true}},limit:${limit},offset:${offset}){uuid area_name pathTokens metadata{lat lng leaf} totalClimbs aggregate{byDiscipline{trad{total} sport{total} bouldering{total} ice{total} mixed{total} alpine{total}}}}}`;return (await fetchJson('https://api.openbeta.io',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query})},fetcher)).data.areas;}
