export const RIDB_URL='https://ridb.recreation.gov/downloads/RIDBFullExport_V1_JSON.zip';
export const RIDB_MEMBERS=['RecAreas_API_v1.json','Activities_API_v1.json','EntityActivities_API_v1.json'];
export const RIDB_ACTIVITIES={'HIKING':'Hiking','HIKING TRAIL':'Hiking','TRAILS, DIFFICULT HIKING':'Hiking','BIKING':'Biking','MOUNTAIN BIKING':'Biking','BACKPACKING':'Backpacking'};
// Pure Worker-safe normalizer. Call with each member's RECDATA array, not wrapper objects.
export function normalizeRidb(recAreas,activities,recAreaActivities,fetchedAt){
 if(![recAreas,activities,recAreaActivities].every(Array.isArray))throw Error('RIDB expected RECDATA arrays');
 const names=new Map(activities.map(a=>[String(a.ActivityID),a.ActivityName]));const joins=new Map();
 for(const j of recAreaActivities){const name=names.get(String(j.ActivityID));if(j.EntityType!=='Rec Area'||!RIDB_ACTIVITIES[name])continue;const id=String(j.EntityID);if(!joins.has(id))joins.set(id,[]);joins.get(id).push({id:j.ActivityID,name});}
 const records=new Map();for(const a of recAreas){const lat=Number(a.RecAreaLatitude),lon=Number(a.RecAreaLongitude),evidence=joins.get(String(a.RecAreaID));if(a.RecAreaLatitude==null||a.RecAreaLongitude==null||a.RecAreaLatitude===''||a.RecAreaLongitude===''||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||(lat===0&&lon===0)||!a.RecAreaName||a.Enabled===false||!evidence?.length)continue;
 const sourceId=String(a.RecAreaID);records.set(sourceId,{sourceId,name:a.RecAreaName,lat,lon,activities:[...new Set(evidence.map(e=>RIDB_ACTIVITIES[e.name]))].sort(),sourceUrl:a.RecAreaURL||`https://www.recreation.gov/camping/gateways/${sourceId}`,license:'US federal RIDB catalog; source-specific terms',attribution:'Recreation.gov RIDB and participating federal land management agencies',country:'US',sourceFetchedAt:fetchedAt,lastVerifiedAt:fetchedAt,access:'unknown',camp:'unknown',activityEvidence:{activities:evidence,entityType:'Rec Area',coordinateKind:'RIDB recreation area source point; not a verified trailhead',sourceLastUpdated:a.LastUpdatedDate,sourceEnabled:a.Enabled,routeSuitability:'unknown',campingAvailability:'unknown',primaryURL:RIDB_URL}});
 }return [...records.values()].sort((a,b)=>a.sourceId.localeCompare(b.sourceId));
}
