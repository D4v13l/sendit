import { isRefreshOwner,isSiteReader,locationHealth,refreshSource,type RefreshEnv } from '../jobs/refresh';
const tools=[{name:'read_location_health',description:'Read persistent location counts, provider snapshots, source refresh status and stale coverage.',inputSchema:{type:'object',properties:{},additionalProperties:false}},{name:'refresh_location_source',description:'Refresh licensed provider data in persistent storage. OpenSkiData allows one attempt daily. RIDB refreshes weekly via bounded archive ranges and explicit source activity joins for Hiking, Biking and Backpacking. OpenBeta continues a weekly paginated snapshot: call again while needsContinuation is true. Failure preserves previous records.',inputSchema:{type:'object',properties:{provider:{type:'string',enum:['openskidata','openbeta','ridb']},maxPages:{type:'integer',minimum:1,maximum:10,default:2}},required:['provider'],additionalProperties:false}}];
export async function handleMcpRequest(request:Request,env:RefreshEnv){
 if(request.method!=='POST')return Response.json({error:'POST required'},{status:405});
 let rpc:any;try{rpc=await request.json();}catch{return Response.json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}},{status:400});}
 const reply=(result:any)=>Response.json({jsonrpc:'2.0',id:rpc.id??null,result});const error=(message:string,code=-32601)=>Response.json({jsonrpc:'2.0',id:rpc.id??null,error:{code,message}});
 if(rpc.method==='notifications/initialized')return new Response(null,{status:202});
 if(rpc.method==='initialize')return reply({protocolVersion:'2026-07-28',capabilities:{tools:{listChanged:false}},serverInfo:{name:'good-outside-locations',version:'1.0.0'}});
 if(rpc.method==='server/discover')return reply({supportedVersions:['2026-07-28'],capabilities:{tools:{}},name:'good-outside-locations',title:'Good Outside location sources',description:'Persistent licensed outdoor destination database and source refresh jobs.',tools});
 if(rpc.method==='tools/list')return reply({tools});
 if(rpc.method==='ping')return reply({});
 if(rpc.method!=='tools/call')return error('Method not found');
 if(!isSiteReader(request,env))return Response.json({error:'Authenticated site access required'},{status:401});
 try{let value:any;const name=rpc.params?.name;if(name==='read_location_health')value=await locationHealth(env);else if(name==='refresh_location_source'){if(!isRefreshOwner(request,env))return error('Only the configured owner may refresh sources',-32001);value=await refreshSource(env,rpc.params.arguments?.provider,rpc.params.arguments?.maxPages??2);}else return error('Unknown tool',-32602);return reply({content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value,isError:value?.status==='failed'});}catch(e){return reply({content:[{type:'text',text:e instanceof Error?e.message:String(e)}],isError:true});}
}
