#!/usr/bin/env python3
"""Local-only RIDB catalog importer. Reads selected ZIP members, never campsites/media."""
import argparse,collections,datetime,gzip,json,math,os,pathlib,subprocess,zipfile
URL='https://ridb.recreation.gov/downloads/RIDBFullExport_V1_JSON.zip'
ROOT=pathlib.Path(__file__).resolve().parents[2]
MEMBERS=['RecAreas_API_v1.json','Activities_API_v1.json','EntityActivities_API_v1.json']
MAPPING={'HIKING':'Hiking','HIKING TRAIL':'Hiking','TRAILS, DIFFICULT HIKING':'Hiking','BIKING':'Biking','MOUNTAIN BIKING':'Biking','BACKPACKING':'Backpacking'}
def normalize(area,evidence,fetched_at):
    try: lat=float(area['RecAreaLatitude']);lon=float(area['RecAreaLongitude'])
    except (KeyError,ValueError,TypeError):return None
    if not(math.isfinite(lat) and math.isfinite(lon) and -90<=lat<=90 and -180<=lon<=180) or (lat==0 and lon==0) or not area.get('RecAreaName') or area.get('Enabled') is False or not evidence:return None
    activities=sorted({MAPPING[e['name']] for e in evidence})
    return dict(sourceId=str(area['RecAreaID']),name=area['RecAreaName'],lat=lat,lon=lon,activities=activities,sourceUrl=area.get('RecAreaURL') or f"https://www.recreation.gov/camping/gateways/{area['RecAreaID']}",license='US federal RIDB catalog; source-specific terms',attribution='Recreation.gov RIDB and participating federal land management agencies',country='US',sourceFetchedAt=fetched_at,lastVerifiedAt=fetched_at,access='unknown',camp='unknown',activityEvidence=dict(activities=evidence,entityType='Rec Area',coordinateKind='RIDB recreation area source point; not a verified trailhead',sourceLastUpdated=area.get('LastUpdatedDate'),sourceEnabled=area.get('Enabled'),routeSuitability='unknown',campingAvailability='unknown',primaryURL=URL))
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--zip',default='/private/tmp/good-outside-RIDBFullExport.zip');parser.add_argument('--refresh',action='store_true');args=parser.parse_args();cache=pathlib.Path(args.zip)
    if args.refresh or not cache.exists():
        if cache.exists() and datetime.datetime.now().timestamp()-cache.stat().st_mtime<7*86400:raise SystemExit('RIDB refresh limited to weekly; reuse cached ZIP')
        temp=str(cache)+'.tmp';subprocess.run(['curl','--fail','-L','--retry','2','--max-time','600','-o',temp,URL],check=True);os.replace(temp,cache)
    fetched_at=datetime.datetime.fromtimestamp(cache.stat().st_mtime,datetime.timezone.utc).isoformat().replace('+00:00','Z')
    with zipfile.ZipFile(cache) as archive:
        directory=[dict(name=f.filename,bytes=f.file_size) for f in archive.infolist()];print(json.dumps({'stage':'zip-directory','members':directory}))
        for name in MEMBERS:
            if archive.getinfo(name).file_size>30_000_000:raise ValueError('Unexpected member growth; inspect schema before import')
        activities={str(a['ActivityID']):a['ActivityName'] for a in json.load(archive.open(MEMBERS[1]))['RECDATA']}
        joins=collections.defaultdict(list)
        for j in json.load(archive.open(MEMBERS[2]))['RECDATA']:
            name=activities.get(str(j.get('ActivityID')))
            if j.get('EntityType')=='Rec Area' and name in MAPPING:joins[str(j['EntityID'])].append(dict(id=j['ActivityID'],name=name))
        areas=json.load(archive.open(MEMBERS[0]))['RECDATA'];records=[r for a in areas if (r:=normalize(a,joins.get(str(a['RecAreaID']),[]),fetched_at))]
    records=sorted({r['sourceId']:r for r in records}.values(),key=lambda r:r['sourceId']);counts=collections.Counter(a for r in records for a in r['activities'])
    snapshot=dict(provider='ridb',fetchedAt=fetched_at,complete=True,rawCount=len(areas),count=len(records),countries=['US'],activityCounts=dict(counts),sourceURL=URL,refreshCadence='weekly',records=records)
    dest=ROOT/'data/ridb.json';text=json.dumps(snapshot,separators=(',',':'),ensure_ascii=False).encode();temp=dest.with_suffix('.json.tmp');temp.write_bytes(text);os.replace(temp,dest)
    with gzip.open(str(dest)+'.gz','wb') as output:output.write(text)
    print(json.dumps({k:v for k,v in snapshot.items() if k!='records'}))
if __name__=='__main__':main()
