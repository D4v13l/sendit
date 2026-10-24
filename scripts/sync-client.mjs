import {readFile,writeFile} from 'node:fs/promises';
for(const name of ['index.js','index.d.ts']){
 const source=await readFile(new URL('../packages/adventure-projects-client/src/'+name,import.meta.url));
 const dest=new URL('../apps/trail-desk/adventure-client/'+name,import.meta.url);
 if(process.argv.includes('--check')){if(!source.equals(await readFile(dest)))throw Error('Client copy differs: '+name);}
 else await writeFile(dest,source);
}
console.log(process.argv.includes('--check')?'Client copies match':'Client copies synchronized');
