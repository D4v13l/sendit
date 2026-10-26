// Artifact pages cannot fetch other hosts. This transport loads the planner's public
// JSON APIs in the Claude desktop app's built-in browser and reads the page text back.
// It matches services.mjs's transport(url, timeout) contract so the shared client is unchanged.
export const SERVER='host:claude_browser';
export const TOOLS=['preview_start','navigate','get_page_text'];
const HOSTS=new Set(['api.open-meteo.com','marine-api.open-meteo.com','geocoding-api.open-meteo.com','router.project-osrm.org']);
// Point forecasts whose answers are per-coordinate and can be split into smaller requests.
const pointForecast=u=>(u.hostname==='api.open-meteo.com'&&u.pathname==='/v1/forecast')||(u.hostname==='marine-api.open-meteo.com'&&u.pathname==='/v1/marine');

export class BridgeError extends Error{constructor(code,message){super(message);this.name='BridgeError';this.code=code}}

// Codes that no retry or refresh can fix without the viewer acting.
const BLOCKING=new Set(['server_not_connected','not_in_manifest','not_granted','capability_disabled','capability_removed','blocked_by_policy','approval_required','cancelled','needs_reauth','selection_required']);
export const isBlocking=error=>error instanceof BridgeError&&BLOCKING.has(error.code);

// Every text block of a tool result, joined. The payload is used when the tool returned no text.
export function resultText(result){
 const blocks=(result?.content||[]).filter(b=>b?.type==='text'&&typeof b.text==='string').map(b=>b.text);
 if(blocks.length)return blocks.join('\n');
 const p=result?.payload;if(typeof p==='string')return p;if(p&&typeof p==='object')return JSON.stringify(p);return '';
}

export function findTabId(result){
 const p=result?.payload??result?.structuredContent;
 for(const v of [p?.tabId,p?.tab?.id,p?.id])if(Number.isInteger(v)||(typeof v==='string'&&/^\d+$/.test(v)))return Number(v);
 const m=resultText(result).match(/tab\s*_?id["'\s:=]*(\d+)/i)||resultText(result).match(/\btab\s+(\d+)\b/i);
 return m?Number(m[1]):null;
}

// A browser renders a JSON response as plain text, sometimes with a title or URL line around it.
// Take the outermost object or array that parses; the API's own `error` field is surfaced by the caller.
const WRAPPER_KEYS=new Set(['text','content','pageText','title','url','tabId']);
export function extractJSON(text){
 if(typeof text!=='string')return undefined;
 const trimmed=text.trim();let data;
 try{data=JSON.parse(trimmed)}catch{
  // Only the outermost value: on a cut-off page an inner fragment such as [] must not pass for an answer.
  const start=trimmed.search(/[[{]/),end=start<0?-1:trimmed.lastIndexOf(trimmed[start]==='['?']':'}');
  if(end>start){try{data=JSON.parse(trimmed.slice(start,end+1))}catch{}}
 }
 // A structured tool result such as {"title":…,"text":"{…}"} carries the page inside a string.
 if(data&&!Array.isArray(data)&&typeof data==='object'&&Object.keys(data).length&&Object.keys(data).every(k=>WRAPPER_KEYS.has(k))){
  for(const k of ['text','content','pageText'])if(typeof data[k]==='string'){const inner=extractJSON(data[k]);if(inner!==undefined)return inner}
  return undefined;
 }
 return data;
}

const coords=(u,key)=>(u.searchParams.get(key)||'').split(',').filter(Boolean).map(Number);
// Does this JSON answer this URL? A tab can still show the previous response right after navigating.
export function answers(url,data){
 const u=new URL(url);if(data==null||typeof data!=='object')return false;
 if(!Array.isArray(data)&&data.error===true)return typeof data.reason==='string';
 if(pointForecast(u)){
  const lat=coords(u,'latitude'),lon=coords(u,'longitude'),list=Array.isArray(data)?data:[data];
  if(list.length!==lat.length||(lat.length>1&&!Array.isArray(data)))return false;
  // Open-Meteo snaps each point to its model grid, so allow a small offset.
  const daily=u.searchParams.has('daily'),hourly=u.searchParams.has('hourly');
  return list.every((f,i)=>(!daily||f?.daily)&&(!hourly||f?.hourly)&&Math.abs(f.latitude-lat[i])<0.3&&Math.abs(f.longitude-lon[i])<0.3);
 }
 if(u.hostname==='geocoding-api.open-meteo.com')return !Array.isArray(data)&&'generationtime_ms' in data&&!('daily' in data);
 if(u.hostname==='router.project-osrm.org'){
  const n=u.pathname.split('/').pop().split(';').length;
  return typeof data.code==='string'&&(data.code!=='Ok'||(data.durations||data.distances)?.[0]?.length===n);
 }
 return false;
}

// Forecast requests for many points are split so each page stays small enough to read in full.
// Measured: about 600 characters per point, ~460 per day of hourly timestamps, ~150 per hourly
// field per day and ~15 per daily field per day.
export function requestDays(u){
 const a=u.searchParams.get('start_date'),b=u.searchParams.get('end_date');
 if(a&&b)return Math.max(1,Math.round((Date.parse(b)-Date.parse(a))/864e5)+1);
 return Math.max(1,Number(u.searchParams.get('forecast_days'))||16);
}
export function forecastChunks(url,budget=60000){
 const u=new URL(url);if(!pointForecast(u))return null;
 const lat=coords(u,'latitude'),lon=coords(u,'longitude');if(lat.length<2)return null;
 const fields=k=>(u.searchParams.get(k)||'').split(',').filter(Boolean).length,hourly=fields('hourly');
 const perPoint=600+requestDays(u)*((hourly?460+hourly*150:0)+fields('daily')*15);
 const size=Math.max(1,Math.floor(budget/perPoint));
 return chunkUrls(u,lat,lon,size);
}
function chunkUrls(u,lat,lon,size){
 const out=[];for(let i=0;i<lat.length;i+=size){const c=new URL(u);c.searchParams.set('latitude',lat.slice(i,i+size).join(','));c.searchParams.set('longitude',lon.slice(i,i+size).join(','));out.push(c.toString())}
 return out;
}

// `log` receives one summary per page load: the tools used, reads, text length and outcome.
export function createBrowserTransport(mcp,{wait=ms=>new Promise(r=>setTimeout(r,ms)),log=()=>{}}={}){
 let tabId=null,opened=false,queue=Promise.resolve();
 const call=async(tool,input,timeout)=>{
  try{return await mcp.callTool(SERVER,tool,input,{cache:false,signal:AbortSignal.timeout(timeout)})}
  catch(e){throw new BridgeError(e?.code||'upstream_error',e?.message||'Built-in browser call failed')}
 };
 const withTab=input=>tabId==null?input:{...input,tabId};
 // Load one URL and read back JSON that answers it.
 const page=async(url,limit)=>{
  const at=Date.now(),host=new URL(url).hostname,entry={kind:'page',host,tabId,reads:0};
  try{const data=await load(url,limit,entry);const {head,...rest}=entry;log({...rest,ms:Date.now()-at,ok:true});return data}
  catch(e){log({...entry,ms:Date.now()-at,code:e?.code||e?.name,message:String(e?.message||'').slice(0,200)});throw e}
 };
 const load=async(url,limit,entry)=>{
  const open=async()=>{const r=await call('preview_start',{url},limit);opened=true;tabId=findTabId(r);entry.opened=true;entry.tabId=tabId;if(tabId==null)entry.noTabId=String(resultText(r)).slice(0,160)};
  if(!opened)await open();
  else{try{await call('navigate',withTab({url}),limit)}catch(e){
   // The viewer may have closed the tab; open a fresh one once.
   if(e.code!=='tool_error')throw e;opened=false;tabId=null;await open();
  }}
  let text='',stale=false,cutOff=false;
  for(const delay of [0,500,1000,1500,2500,4000]){
   if(delay)await wait(delay);
   const previous=text;text=resultText(await call('get_page_text',withTab({}),limit));const data=extractJSON(text);entry.reads++;entry.chars=text.length;entry.head=text.slice(0,160);
   if(data!==undefined&&answers(url,data)){if(!Array.isArray(data)&&data.error===true)throw Error(data.reason||'Data unavailable');return data}
   stale=data!==undefined;
   // The same unparseable JSON twice means the page has loaded and its text is being cut off.
   if(data===undefined&&text===previous&&text.length>2000&&/[[{]/.test(text.slice(0,200))){cutOff=true;break}
  }
  const host=new URL(url).hostname,looksJSON=/[[{]/.test(text.slice(0,200));
  if(cutOff)throw new BridgeError('too_large','The '+host+' answer ('+text.length.toLocaleString()+' characters) came back cut off.');
  if(stale)throw new BridgeError('stale','The built-in browser kept showing an earlier answer instead of '+host+'.');
  if(looksJSON&&text.length>2000)throw new BridgeError('too_large','The '+host+' answer ('+text.length.toLocaleString()+' characters) came back cut off.');
  throw new BridgeError('unreadable','The built-in browser did not return readable data for '+host+'.');
 };
 // Forecasts for several points, halving a chunk whose page text came back cut off.
 const forecast=async(url,limit)=>{
  try{const d=await page(url,limit);return Array.isArray(d)?d:[d]}
  catch(e){
   const u=new URL(url),lat=coords(u,'latitude'),lon=coords(u,'longitude');
   if(e.code!=='too_large'||lat.length<2)throw e;
   const out=[];for(const c of chunkUrls(u,lat,lon,Math.ceil(lat.length/2)))out.push(...await forecast(c,limit));return out;
  }
 };
 const run=async(url,timeout)=>{
  const host=new URL(url).hostname;if(!HOSTS.has(host))throw new BridgeError('bad_request','Host not allowed: '+host);
  // Consent prompts and site approvals can hold the first call, so allow well over the HTTP timeout.
  const limit=Math.max(90000,timeout||0),chunks=forecastChunks(url);
  if(!chunks){if(!pointForecast(new URL(url)))return page(url,limit);return (await forecast(url,limit))[0]}
  const out=[];for(const c of chunks)out.push(...await forecast(c,limit));return out;
 };
 // One tab serves every request, so requests must not overlap.
 return (url,timeout)=>{const next=queue.catch(()=>{}).then(()=>run(url,timeout));queue=next;return next};
}
