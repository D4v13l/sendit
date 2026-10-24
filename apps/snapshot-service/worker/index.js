const manifest = {"version": 1, "release": "2026-10-23", "baseUrl": "https://sendit-catalog-data.johnlhenning.chatgpt.site/snapshots/", "providers": [{"provider": "curated", "key": "2026-10-23/curated.json.gz", "count": 49, "bytes": 6948, "sha256": "69c98c35bc0159d9b615f70a81018c65ec3c59cd1f43853e205756ac92c9bd0c", "license": "Source-specific terms", "fetchedAt": "2026-10-24T01:30:53.946Z"}, {"provider": "openbeta", "key": "2026-10-23/openbeta.json.gz", "count": 35753, "bytes": 3166491, "sha256": "0fc40da15d6270942a8711bef9f15cc55c4d6de0463822d083e8d4455b0f7714", "license": "CC0-1.0", "fetchedAt": "2026-10-24T01:25:10.982Z"}, {"provider": "openskidata", "key": "2026-10-23/openskidata.json.gz", "count": 6935, "bytes": 378902, "sha256": "709a56536c3842dbd725e22467595f510c4906f42c8c0d4692f22bdd0b313764", "license": "ODbL-1.0", "fetchedAt": "2026-10-24T01:25:05.182Z"}, {"provider": "ridb", "key": "2026-10-23/ridb.json.gz", "count": 1955, "bytes": 73905, "sha256": "7fc18e70f787bdb5dd6200373b702408eaaeaf1f253c3d7a3742e6cbe8b41102", "license": "US federal RIDB catalog; source-specific terms", "fetchedAt": "2026-10-24T01:45:18.832643Z"}]};
export default {async fetch(request,env){
 const path=new URL(request.url).pathname;
 if(path==='/'||path==='/manifest.json')return Response.json(manifest);
 const key=path.replace(/^\/snapshots\//,'');const entry=manifest.providers.find(p=>p.key===key);
 if(!entry||!path.startsWith('/snapshots/'))return new Response('Not found',{status:404});
 if(!env.BUCKET)return new Response('Storage unavailable',{status:503});
 if(request.method==='PUT'){
  if(!env.UPLOAD_SECRET||request.headers.get('Authorization')!=='Bearer '+env.UPLOAD_SECRET)return new Response('Unauthorized',{status:401});
  const chunks=[];let size=0;if(!request.body)return new Response('Missing body',{status:400});
  for await(const chunk of request.body){size+=chunk.length;if(size>entry.bytes)return new Response('Too large',{status:413});chunks.push(chunk);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  if(size!==entry.bytes||digest!==entry.sha256)return new Response('Checksum mismatch',{status:400});
  await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:'application/gzip'},customMetadata:{sha256:digest,license:entry.license}});
  return Response.json({key,bytes:size,sha256:digest});
 }
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 const object=await env.BUCKET.get(key);if(!object)return new Response('Snapshot not uploaded',{status:404});
 return new Response(request.method==='HEAD'?null:object.body,{headers:{'content-type':'application/gzip','content-length':String(entry.bytes),'cache-control':'public, max-age=31536000, immutable','etag':'"'+entry.sha256+'"','x-content-type-options':'nosniff'}});
}};
