import { inflateRawSync } from 'node:zlib';
const MAX_MEMBER_COMPRESSED=10_000_000,MAX_MEMBER_RAW=30_000_000,MAX_TOTAL_RAW=32_000_000;
const decoder=new TextDecoder();
async function boundedBytes(response,max){const reader=response.body?.getReader();if(!reader)throw Error('ZIP range has no body');let size=0;const chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw Error('ZIP range exceeded requested size');chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}}
const view=bytes=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
export function parseCentralDirectory(bytes){const data=view(bytes),entries=new Map();let offset=0;while(offset<bytes.length){if(offset+46>bytes.length||data.getUint32(offset,true)!==0x02014b50)throw Error('Invalid ZIP central directory');const flags=data.getUint16(offset+8,true),method=data.getUint16(offset+10,true),crc=data.getUint32(offset+16,true),compressed=data.getUint32(offset+20,true),raw=data.getUint32(offset+24,true),nameLength=data.getUint16(offset+28,true),extraLength=data.getUint16(offset+30,true),commentLength=data.getUint16(offset+32,true),localOffset=data.getUint32(offset+42,true);const end=offset+46+nameLength+extraLength+commentLength;if(end>bytes.length)throw Error('Truncated ZIP directory entry');const name=decoder.decode(bytes.subarray(offset+46,offset+46+nameLength));if(entries.has(name))throw Error('Duplicate ZIP member name');entries.set(name,{flags,method,crc,compressed,raw,localOffset});offset=end;}return entries;}
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
export async function readZipJsonMembers(url,names,fetcher=fetch){
 let total=null,etag=null,downloadedBytes=0;
 const range=async(start,end,suffix=false)=>{
  const headers={Range:suffix?`bytes=-${end}`:`bytes=${start}-${end}`,'Accept-Encoding':'identity',...(etag?{'If-Match':etag}:{})};
  const response=await fetcher(url,{headers,signal:AbortSignal.timeout(15000)});
  if(response.status!==206){await response.body?.cancel();throw Error(`ZIP source must honor bounded HTTP Range (received ${response.status})`);}
  const match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range')||'');if(!match){await response.body?.cancel();throw Error('Missing ZIP Content-Range');}
  const [first,last,length]=match.slice(1).map(Number);if(!Number.isSafeInteger(length)||length<22||first<0||last>=length||last<first||(total!==null&&total!==length)){await response.body?.cancel();throw Error('ZIP size changed or invalid range');}
  if((!suffix&&(first!==start||last!==end))||(suffix&&(last!==length-1||first!==Math.max(0,length-end)))){await response.body?.cancel();throw Error('ZIP source returned a different range');}
  const nextEtag=response.headers.get('etag');if(etag&&nextEtag&&etag!==nextEtag){await response.body?.cancel();throw Error('ZIP source changed during refresh');}if(nextEtag)etag=nextEtag;total=length;
  const bytes=await boundedBytes(response,last-first+1);if(bytes.length!==last-first+1)throw Error('Truncated ZIP range');downloadedBytes+=bytes.length;return {bytes,start:first};
 };
 const tail=await range(0,65557,true),tailView=view(tail.bytes);let endOffset=-1;
 for(let i=tail.bytes.length-22;i>=0;i--)if(tailView.getUint32(i,true)===0x06054b50&&i+22+tailView.getUint16(i+20,true)===tail.bytes.length){endOffset=i;break;}
 if(endOffset<0)throw Error('ZIP end record missing');
 if(tailView.getUint16(endOffset+4,true)!==0||tailView.getUint16(endOffset+6,true)!==0)throw Error('Multi-disk ZIP unsupported');
 const directorySize=tailView.getUint32(endOffset+12,true),directoryOffset=tailView.getUint32(endOffset+16,true),entryCount=tailView.getUint16(endOffset+10,true);
 if(directorySize===0xffffffff||directoryOffset===0xffffffff||entryCount===65535||directorySize>1_000_000||directorySize<46||directoryOffset+directorySize>tail.start+endOffset)throw Error('ZIP64 or oversized ZIP directory unsupported');
 const directory=directoryOffset>=tail.start?tail.bytes.subarray(directoryOffset-tail.start,directoryOffset-tail.start+directorySize):(await range(directoryOffset,directoryOffset+directorySize-1)).bytes;
 const entries=parseCentralDirectory(directory);if(entries.size!==entryCount)throw Error('ZIP directory count mismatch');
 let rawTotal=0;/** @type {Record<string, any[]>} */ const members={};
 for(const name of names){const entry=entries.get(name);if(!entry)throw Error(`Missing ZIP member ${name}`);if(entry.flags&1||![0,8].includes(entry.method)||entry.compressed>MAX_MEMBER_COMPRESSED||entry.raw>MAX_MEMBER_RAW||entry.raw===0||entry.compressed===0)throw Error(`Unsupported or oversized ZIP member ${name}`);rawTotal+=entry.raw;if(rawTotal>MAX_TOTAL_RAW)throw Error('Selected ZIP members exceed memory budget');
  const header=(await range(entry.localOffset,entry.localOffset+29)).bytes,local=view(header);if(local.getUint32(0,true)!==0x04034b50||local.getUint16(8,true)!==entry.method)throw Error('Invalid ZIP local header');
  const contentOffset=entry.localOffset+30+local.getUint16(26,true)+local.getUint16(28,true);if(contentOffset+entry.compressed>directoryOffset)throw Error('ZIP member overlaps directory');
  const compressed=(await range(contentOffset,contentOffset+entry.compressed-1)).bytes;
  const raw=entry.method===0?compressed:inflateRawSync(compressed,{maxOutputLength:MAX_MEMBER_RAW});
  if(raw.length!==entry.raw||crc32(raw)!==entry.crc)throw Error(`Corrupt ZIP member ${name}`);
  const parsed=JSON.parse(decoder.decode(raw));if(!Array.isArray(parsed.RECDATA))throw Error(`Invalid RECDATA in ${name}`);members[name]=parsed.RECDATA;
 }
 return {members,downloadedBytes,archiveBytes:total,etag};
}
