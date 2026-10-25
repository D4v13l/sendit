// Artifact pages cannot fetch other hosts. This transport loads the planner's public
// JSON APIs in the Claude desktop app's built-in browser and reads the page text back.
// It matches services.mjs's transport(url, timeout) contract so the shared client is unchanged.
export const SERVER='host:claude_browser';
export const TOOLS=['preview_start','navigate','get_page_text'];
const HOSTS=new Set(['api.open-meteo.com','geocoding-api.open-meteo.com','router.project-osrm.org']);

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
// Take the outermost object or array that parses; the API's own `error` field is surfaced by fetchJSON's caller.
const WRAPPER_KEYS=new Set(['text','content','pageText','title','url','tabId']);
export function extractJSON(text){
 if(typeof text!=='string')return undefined;
 const trimmed=text.trim();let data;
 try{data=JSON.parse(trimmed)}catch{
  for(const [open,close] of [['[',']'],['{','}']]){
   const start=trimmed.indexOf(open),end=trimmed.lastIndexOf(close);
   if(start>=0&&end>start){try{data=JSON.parse(trimmed.slice(start,end+1));break}catch{}}
  }
 }
 // A structured tool result such as {"title":…,"text":"{…}"} carries the page inside a string.
 if(data&&!Array.isArray(data)&&typeof data==='object'&&Object.keys(data).length&&Object.keys(data).every(k=>WRAPPER_KEYS.has(k))){
  for(const k of ['text','content','pageText'])if(typeof data[k]==='string'){const inner=extractJSON(data[k]);if(inner!==undefined)return inner}
  return undefined;
 }
 return data;
}

export function createBrowserTransport(mcp,{wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 let tabId=null,opened=false,queue=Promise.resolve();
 const call=async(tool,input,timeout)=>{
  try{return await mcp.callTool(SERVER,tool,input,{cache:false,signal:AbortSignal.timeout(timeout)})}
  catch(e){throw new BridgeError(e?.code||'upstream_error',e?.message||'Built-in browser call failed')}
 };
 const withTab=input=>tabId==null?input:{...input,tabId};
 const run=async(url,timeout)=>{
  const host=new URL(url).hostname;if(!HOSTS.has(host))throw new BridgeError('bad_request','Host not allowed: '+host);
  // Consent prompts and site approvals can hold the first call, so allow well over the HTTP timeout.
  const limit=Math.max(90000,timeout||0);
  const open=async()=>{const r=await call('preview_start',{url},limit);opened=true;tabId=findTabId(r)};
  if(!opened)await open();
  else{try{await call('navigate',withTab({url}),limit)}catch(e){
   // The viewer may have closed the tab; open a fresh one once.
   if(e.code!=='tool_error')throw e;opened=false;tabId=null;await open();
  }}
  for(let attempt=0;attempt<3;attempt++){
   const data=extractJSON(resultText(await call('get_page_text',withTab({}),limit)));
   if(data!==undefined){if(data&&!Array.isArray(data)&&data.error)throw Error(data.reason||'Data unavailable');return data}
   await wait(800*(attempt+1));
  }
  throw new BridgeError('unreadable','The built-in browser did not return readable data for '+host+'.');
 };
 // One tab serves every request, so requests must not overlap.
 return (url,timeout)=>{const next=queue.catch(()=>{}).then(()=>run(url,timeout));queue=next;return next};
}
