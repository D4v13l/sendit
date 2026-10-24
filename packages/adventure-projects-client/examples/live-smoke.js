import {AdventureClient} from '../src/index.js';
// Explicit opt-in: ten small read-only calls, no crawling.
const samples=[['hike','Gorham',7019235],['mtb','Saguaro',7034858],['ski','Steg',7000630],['trailrun','Dead Horse',7018118],['climb','Serenity',105862912]];
for(const [site,query,id] of samples) {
  const client=new AdventureClient({site});
  try {
    const search=await client.search(query,{limit:1});
    const route=await client.getRoute(id);
    console.log(JSON.stringify({site,ok:true,results:search.items.length,title:route.title||route.properties.title}));
  } catch(error) {console.log(JSON.stringify({site,ok:false,error:error.message}));process.exitCode=1;}
}
