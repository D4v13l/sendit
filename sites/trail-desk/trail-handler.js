import {AdventureClient,SITES} from './adventure-client/index.js';
import html from './trail-ui/index.html?raw';
import js from './trail-ui/app.js?raw';
import css from './trail-ui/style.css?raw';
const assets={'/':[html,'text/html'],'/app.js':[js,'text/javascript'],'/style.css':[css,'text/css']};
const clients=new Map();
const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store'}});
export function trailFetch(request){
  const url=new URL(request.url);
  if(!assets[url.pathname]&&!url.pathname.startsWith('/api/'))return null;
  return handle(request,url);
}
async function handle(request,url){
  if(request.method!=='GET')return json({error:'GET only'},405);
  if(assets[url.pathname]){const [body,type]=assets[url.pathname];return new Response(body,{headers:{'content-type':type+'; charset=utf-8','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'"}});}
  if(url.pathname==='/api/config')return json({offline:false});
  if(!['/api/search','/api/route'].includes(url.pathname))return json({error:'Not found'},404);
  try{
    const site=url.searchParams.get('site')||'hike';
    if(!Object.hasOwn(SITES,site))throw new TypeError('Unknown site');
    if(!clients.has(site))clients.set(site,new AdventureClient({site,fetch:(url,options)=>globalThis.fetch(url,{...options,redirect:"manual"})}));
    const client=clients.get(site);
    if(url.pathname==='/api/route')return json(await client.getRoute(url.searchParams.get('id'),{signal:request.signal}));
    const sort=url.searchParams.get('sort');
    const sortOptions=sort==='rating'?[{field:'rating',order:'desc'}]:sort==='length'?[{field:'length.value',order:'desc'}]:[];
    return json(await client.search(url.searchParams.get('q')||'',{limit:10,from:Number(url.searchParams.get('from')||0),sort:sortOptions,signal:request.signal}));
  }catch(error){return json({error:error.message,name:error.name,upstreamStatus:error.status},error instanceof TypeError?400:502);}
}
