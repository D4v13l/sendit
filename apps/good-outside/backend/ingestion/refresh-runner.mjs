// Initial/manual CLI only. Credentials are accepted from stdin and kept in memory.
import {spawn} from 'node:child_process';
import {readCredentials,publish} from './publish.mjs';
const credentials=await readCredentials();const requested=process.argv[2]??'all';
for(const provider of requested==='all'?['openskidata','openbeta','ridb']:[requested]){
 if(!['openskidata','openbeta','ridb'].includes(provider))throw Error('Refresh supports openskidata, openbeta or ridb');
 await new Promise((resolve,reject)=>{const child=spawn(provider==='ridb'?'python3':process.execPath,provider==='ridb'?[new URL('./ridb-refresh.py',import.meta.url).pathname,'--refresh']:[new URL('./refresh.mjs',import.meta.url).pathname,provider],{stdio:['ignore','inherit','inherit']});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`${provider} refresh failed`)));});
 await publish(provider,credentials);
}
