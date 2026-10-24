import {createDemoServer} from './server.js';
const port=Number(process.env.PORT||4173);
const offline=process.argv.includes('--offline');
const server=createDemoServer({offline});
server.on('error',error=>{console.error(`Cannot start demo: ${error.message}`);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`Trail desk: http://127.0.0.1:${port} (${offline?'synthetic offline data':'live API'})`));
