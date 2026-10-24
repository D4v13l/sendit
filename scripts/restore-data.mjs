import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
const dir=new URL('../apps/good-outside/data/',import.meta.url);
for(const provider of ['curated','openbeta','openskidata','ridb']){
 const data=gunzipSync(await readFile(new URL(provider+'.json.gz',dir)));
 const snapshot=JSON.parse(data);if(snapshot.provider!==provider||snapshot.records.length!==snapshot.count)throw Error('Invalid snapshot: '+provider);
 await writeFile(new URL(provider+'.json',dir),data);
 console.log(provider+': '+snapshot.count+' records restored');
}
