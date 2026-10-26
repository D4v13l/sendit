// Forecasts where the desktop app's built-in browser is missing (phones, the web). Searching a new
// starting location fires a Claude background task through the Claude Code Remote connector; the
// task fetches Open-Meteo forecasts for every nearby area and saves them in this viewer's private
// storage, where the page reads them. Nothing is fetched at any other time.
// It matches services.mjs's transport(url) contract so the shared client is unchanged.
export const SERVER='Claude Code Remote',TOOL='fire_trigger',TRIGGER='trig_01SY6HoyK5ZB8WHzbsLz2ZRh';
// PART and MAX_POINTS match the task's fetch script.
const PART=10,MAX_POINTS=30,FRESH_MS=6*36e5,WAIT_MS=8*6e4,KEEP_MS=3*864e5;

export class RemoteError extends Error{constructor(code,message){super(message);this.name='RemoteError';this.code=code}}

// About 1 km: searching the same town again finds the same saved forecasts.
export const originKey=o=>Math.round(o.lat*100)+'_'+Math.round(o.lon*100);
const pointKey=(lat,lon)=>+(+lat).toFixed(4)+','+(+(+lon).toFixed(4));
const coords=(u,key)=>(u.searchParams.get(key)||'').split(',').filter(Boolean).map(Number);
const requestId=()=>'fc-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10).padEnd(4,'0');

// Connector failures a repeat cannot fix without the viewer acting.
const UNAVAILABLE=new Set(['server_not_connected','server_not_found','needs_reauth','selection_required','not_granted','capability_disabled','capability_removed','blocked_by_policy']);
const DENIED=new Set(['not_in_manifest','approval_required','consent_required','cancelled']);
// The task may have started despite these, so the page keeps waiting for its documents.
const AMBIGUOUS=new Set(['server_unavailable','upstream_error','rate_limited']);

export function createRemote({mcp,db,uid,origin}){
 const col=db.collection('data/users/'+uid),known=new Map();let armed=null,pruned=false;
 const remember=doc=>{for(const p of doc.points||[])if(p?.forecast)known.set(pointKey(p.lat,p.lon),{...p.forecast,retrievedAt:doc.fetchedAtMs})};
 const fresh=f=>f&&Date.now()-f.retrievedAt<FRESH_MS;
 // The newest complete fetch for this origin that is still fresh.
 async function stored(key){
  const snap=await col.where('origin','==',key).get(),groups=new Map();
  for(const s of snap.docs){const d=s.data();if(d?.status!=='ok'||!(Date.now()-d.fetchedAtMs<FRESH_MS))continue;if(!groups.has(d.request))groups.set(d.request,[]);groups.get(d.request).push(d)}
  const best=[...groups.values()].filter(g=>g.length===g[0].parts).sort((a,b)=>b[0].fetchedAtMs-a[0].fetchedAtMs)[0];
  best?.forEach(remember);
 }
 // Resolves with every part of one request, or rejects on its error document or the deadline.
 function wait(id,parts){
  let settle,timer;const subs=[],docs=[];
  const promise=new Promise((resolve,reject)=>{settle=(fn,v)=>{if(!settle)return;settle=null;clearTimeout(timer);subs.forEach(u=>u());fn(v)};
   timer=setTimeout(()=>settle?.(reject,new RemoteError('remote_timeout','The forecast task has not finished yet.')),WAIT_MS);
   for(let i=0;i<parts;i++)subs.push(col.doc(id+'-p'+i).onSnapshot(s=>{if(!s.exists)return;const d=s.data();
    if(d.status==='error')return settle?.(reject,new RemoteError('remote_failed',String(d.reason||'')));
    docs[d.part]=d;if(docs.filter(Boolean).length===parts)settle?.(resolve,docs)},
    e=>settle?.(reject,new RemoteError('remote_failed','Saved forecasts could not be read ('+(e?.code||'error')+').'))));
  });
  return {promise,cancel:()=>{if(settle){settle=null;clearTimeout(timer);subs.forEach(u=>u())}}};
 }
 async function fetchNew(key,points){
  const id=requestId(),parts=Math.ceil(points.length/PART),waiting=wait(id,parts);
  try{await mcp.callTool(SERVER,TOOL,{trigger_id:TRIGGER,text:JSON.stringify({request:id,origin:key,points:points.map(([lat,lon])=>({lat,lon}))})},{cache:false})}
  catch(e){const code=e?.code;if(!AMBIGUOUS.has(code)){waiting.cancel();
   throw new RemoteError(UNAVAILABLE.has(code)?'remote_unavailable':DENIED.has(code)?'remote_denied':'remote_failed',code==='tool_error'?'the task could not start':'')}}
  (await waiting.promise).forEach(remember);
 }
 return {
  // The next forecast request for this origin may fetch: the viewer just searched it.
  arm(o,points){armed={key:originKey(o),points}},
  disarm(){armed=null},
  async transport(url){
   const u=new URL(url);
   if(u.hostname!=='api.open-meteo.com'||u.pathname!=='/v1/forecast'||u.searchParams.has('elevation'))throw new RemoteError('desktop_only','');
   const lat=coords(u,'latitude'),lon=coords(u,'longitude'),keys=lat.map((v,i)=>pointKey(v,lon[i]));
   const o=origin(),key=o?originKey(o):null,search=armed?.key===key?armed:null;armed=null;
   const answer=()=>{const list=keys.map(k=>known.get(k));return list.every(fresh)?(list.length===1?list[0]:list):null};
   let hit=answer();if(hit)return hit;
   if(key){await stored(key);if((hit=answer()))return hit}
   if(!search)throw new RemoteError('search_needed','');
   const want=new Map(lat.map((v,i)=>[keys[i],[v,lon[i]]]));for(const p of search.points){const k=pointKey(p[0],p[1]);if(!want.has(k))want.set(k,p)}
   await fetchNew(key,[...want.values()].slice(0,MAX_POINTS));
   if((hit=answer()))return hit;throw new RemoteError('remote_failed','some forecasts were missing');
  },
  // Saved fetches older than KEEP_MS are deleted once per visit.
  async prune(){if(pruned)return;pruned=true;try{const snap=await col.where('fetchedAtMs','<',Date.now()-KEEP_MS).limit(50).get();for(const s of snap.docs)await col.doc(s.id).delete()}catch{}},
 };
}
