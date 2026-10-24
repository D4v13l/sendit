import {AdventureClient,routeId} from '../src/index.js';
const [site='hike',query='Gorham']=process.argv.slice(2);
try {
  const client=new AdventureClient({site});
  const page=await client.search(query,{limit:3});
  console.log(`${page.total} matches; showing ${page.items.length}`);
  console.table(page.items.map(({id,title,rating})=>({id,title,rating})));
  if(page.items[0]) console.log(JSON.stringify(await client.getRoute(routeId(page.items[0].id)),null,2));
} catch(error) {console.error(error.name+': '+error.message);process.exitCode=1;}
