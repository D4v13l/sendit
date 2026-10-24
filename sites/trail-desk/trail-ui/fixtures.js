// Synthetic records. Never presented as live trail information.
const trails = [
  {id:9000001,title:'Granite Lake Circuit',length:6200,ascent:410,stars:4.6,diff:'blue',lineType:'loop',cityState:'Sample landscape',points:[[-120.02,40.01],[-120.018,40.018],[-120.009,40.021],[-120.002,40.016],[-120.006,40.01],[-120.015,40.006],[-120.02,40.01]]},
  {id:9000002,title:'North Ridge Traverse',length:11300,ascent:870,stars:4.8,diff:'black',lineType:'pointToPoint',cityState:'Sample landscape',points:[[-120.05,40.01],[-120.04,40.012],[-120.031,40.02],[-120.023,40.018],[-120.012,40.023],[-120.004,40.028]]},
  {id:9000003,title:'Creekside Path',length:2300,ascent:65,stars:4.2,diff:'green',lineType:'outAndBack',cityState:'Sample landscape',points:[[-120.02,40.01],[-120.018,40.012],[-120.012,40.013],[-120.01,40.017],[-120.012,40.013],[-120.018,40.012],[-120.02,40.01]]},
];
const response = data => new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
export async function fixtureFetch(input, init = {}) {
  const url=new URL(input);
  const climb=url.hostname.includes('mountainproject');
  const feature=t=>({type:'Feature',geometry:{type:'LineString',coordinates:t.points},properties:{...t,points:undefined,descent:-t.ascent,drawRide:1,drawTrail:0}});
  if(url.pathname==='/api/v2/search') {
    let rows=trails.filter(t=>t.title.toLowerCase().includes((url.searchParams.get('q')||'').toLowerCase()));
    const body=JSON.parse(init.body||'{}');
    const sort=body.sort?.[0];
    if(sort) {const field=sort.field==='length.value'?'length':sort.field==='rating'?'stars':'diff';rows.sort((a,b)=>(a[field]>b[field]?1:a[field]<b[field]?-1:0)*(sort.order==='desc'?-1:1));}
    const total=rows.length;
    const from=Number(url.searchParams.get('from')||0),limit=Number(url.searchParams.get('limit')||25);
    rows=rows.slice(from,from+limit);
    return response({total:{value:total,relation:'eq'},hits:rows.map(t=>({_id:`${climb?'routes':'trails'}.${t.id}`,_source:{id:`${climb?'routes':'trails'}.${t.id}`,type:'Route',title:t.title,breadcrumbs:'Synthetic demo data',rating:t.stars,difficulty:{string:climb?'5.9':t.diff,value:2},length:{value:climb?200:t.length,unit:climb?'ft':'m'},description:'Invented example for exploring the client offline.'}}))});
  }
  const match=/^\/api\/v2\/routes\/(\d+)$/.exec(url.pathname);
  if(match) {
    const t=trails.find(t=>t.id===Number(match[1]));
    if(t) return response(climb?{id:t.id,title:t.title,difficulty:'5.9',pitches:2,height_feet:200,types:['Trad'],rating:t.stars,summary:'Synthetic climbing record',sections:[{title:'Description',html:'<p>Invented climb for demonstrating the client. Not a real route.</p>'}],parent:{name:'Sample crag',coordinates:[-120.02,40.01]}}:feature(t));
  }
  return new Response('Fixture not found',{status:404});
}
