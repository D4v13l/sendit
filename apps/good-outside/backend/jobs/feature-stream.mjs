// Retain one feature at a time, never the entire global FeatureCollection.
export async function* streamFeatures(stream) {
 if(!stream)throw Error('Source response has no body');
 const reader=stream.getReader(),decoder=new TextDecoder();
 let header='',tail='',feature='',found=false,closed=false,depth=0,quoted=false,escaped=false,afterValue=false,seen=0;
 const consume=function*(text){
  for(const char of text){
   if(!found){header+=char;if(header.length>65536)throw Error('FeatureCollection header exceeds limit');if(/"features"\s*:\s*\[$/.test(header)){found=true;header=header.slice(0,-1);}continue;}
   if(closed){tail+=char;if(tail.length>65536)throw Error('FeatureCollection trailer exceeds limit');continue;}
   if(!feature){if(/\s/.test(char))continue;if(char===']'){if(seen&&!afterValue)throw Error('Trailing feature comma');closed=true;continue;}if(char===','&&afterValue){afterValue=false;continue;}if(char!=='{'||afterValue)throw Error('Expected feature object');feature='{';depth=1;quoted=false;escaped=false;continue;}
   feature+=char;if(feature.length>2_000_000)throw Error('Individual feature exceeds limit');
   if(quoted){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')quoted=false;}
   else if(char==='"')quoted=true;else if(char==='{'||char==='[')depth++;else if(char==='}'||char===']')depth--;
   if(depth===0){const parsed=JSON.parse(feature);if(parsed.type!=='Feature')throw Error('Expected GeoJSON Feature');feature='';afterValue=true;seen++;yield parsed;}
  }
 };
 try{while(true){const {value,done}=await reader.read();if(done)break;yield* consume(decoder.decode(value,{stream:true}));}yield* consume(decoder.decode());
  if(!found||!closed||feature)throw Error('Truncated FeatureCollection');
  const envelope=JSON.parse(header+'[]'+tail);if(envelope.type!=='FeatureCollection')throw Error('Expected FeatureCollection');
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
