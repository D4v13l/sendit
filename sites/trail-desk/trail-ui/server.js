import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {AdventureClient, SITES} from '../src/index.js';
import {fixtureFetch} from './fixtures.js';

// Fixed local API surface, not a general URL proxy. Shared clients retain pacing.
export function createDemoServer({offline = false, fetch: fetchImpl = globalThis.fetch} = {}) {
  const clients=new Map();
  const getClient=site=>{
    if(!Object.hasOwn(SITES,site)) throw new TypeError('Unknown site');
    if(!clients.has(site)) clients.set(site,new AdventureClient({site,fetch:offline?fixtureFetch:fetchImpl}));
    return clients.get(site);
  };
  const assets={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css']};
  return createServer(async(req,res)=>{
    const send=(status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
    try {
      if(req.method!=='GET') return send(405,{error:'GET only'});
      // Bind locally and reject cross-origin browser use of the local service.
      if(req.headers['sec-fetch-site']==='cross-site') return send(403,{error:'Cross-site requests are not allowed'});
      const host=req.headers.host||'';
      if(!/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(host)) return send(403,{error:'Local host only'});
      const url=new URL(req.url,'http://localhost');
      if(assets[url.pathname]) {
        const [file,type]=assets[url.pathname];
        res.writeHead(200,{'content-type':`${type}; charset=utf-8`,'x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});
        return res.end(await readFile(new URL(file,import.meta.url)));
      }
      if(url.pathname==='/api/config') return send(200,{offline});
      if(!['/api/search','/api/route'].includes(url.pathname)) return send(404,{error:'Not found'});
      const client=getClient(url.searchParams.get('site')||'hike');
      const controller=new AbortController();
      const disconnect=()=>{if(!res.writableEnded) controller.abort();};
      res.on('close',disconnect);
      try {
        if(url.pathname==='/api/route') return send(200,await client.getRoute(url.searchParams.get('id'),{signal:controller.signal}));
        const sort=url.searchParams.get('sort');
        const sortOptions=sort==='rating'?[{field:'rating',order:'desc'}]:sort==='length'?[{field:'length.value',order:'desc'}]:[];
        return send(200,await client.search(url.searchParams.get('q')||'',{limit:10,from:Number(url.searchParams.get('from')||0),sort:sortOptions,signal:controller.signal}));
      } finally {res.removeListener('close',disconnect);}
    } catch(error) {
      if(res.destroyed) return;
      send(error instanceof TypeError?400:502,{error:error.message,name:error.name,upstreamStatus:error.status});
    }
  });
}
