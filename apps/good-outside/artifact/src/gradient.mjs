// Trip-weather surface for the search map: a grid of forecast samples around the starting point,
// each ranked with the planner's own evaluate(), interpolated between samples and coloured along
// the three tiers. Samples without a complete trip forecast drop out rather than being guessed.
export const SCORE={poor:0,passable:1,excellent:2};

export function gradientGrid(origin,{halfKm=300,n=8}={}){
 const dLat=halfKm/111,dLon=halfKm/(111*Math.cos(origin.lat*Math.PI/180));
 const bounds={south:origin.lat-dLat,north:origin.lat+dLat,west:origin.lon-dLon,east:origin.lon+dLon},points=[];
 for(let row=0;row<n;row++)for(let col=0;col<n;col++){
  const lat=+(bounds.north-row*(bounds.north-bounds.south)/(n-1)).toFixed(3),lon=+(bounds.west+col*(bounds.east-bounds.west)/(n-1)).toFixed(3);
  points.push({id:'grid:'+lat+','+lon,point:[lat,lon],row,col});
 }
 return {bounds,points,n};
}

// Bilinear interpolation at grid coordinates (fx across columns, fy down rows). Unknown corners drop
// out and the known ones are reweighted; with no known corner the answer is null.
export function sampleGrid(values,n,fx,fy){
 const x0=Math.max(0,Math.min(n-2,Math.floor(fx))),y0=Math.max(0,Math.min(n-2,Math.floor(fy))),tx=fx-x0,ty=fy-y0;
 let sum=0,weight=0;
 for(const [dx,dy,w] of [[0,0,(1-tx)*(1-ty)],[1,0,tx*(1-ty)],[0,1,(1-tx)*ty],[1,1,tx*ty]]){
  const v=values[(y0+dy)*n+x0+dx];if(v==null||w<=0)continue;sum+=v*w;weight+=w;
 }
 return weight>0?sum/weight:null;
}

// 0 Poor (red) → 1 Passable (yellow) → 2 Excellent (green), matching the planner's tier colours.
const STOPS=[[170,64,53],[228,177,47],[40,115,76]];
export function tierColor(score){
 const s=Math.max(0,Math.min(2,score)),i=Math.min(1,Math.floor(s)),t=s-i;
 return STOPS[i].map((c,k)=>Math.round(c+(STOPS[i+1][k]-c)*t));
}

const mercY=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
const invMercY=y=>(2*Math.atan(Math.exp(y))-Math.PI/2)*180/Math.PI;
// Pixel size of a canvas covering bounds with Web Mercator proportions.
export function canvasSize(bounds,width=360){
 const h=(mercY(bounds.north)-mercY(bounds.south))/((bounds.east-bounds.west)*Math.PI/180)*width;
 return {width,height:Math.max(1,Math.round(h))};
}

// Fills an RGBA ImageData-like buffer. Rows are spaced evenly in Mercator so the image lines up
// with the map when stretched over `bounds`.
// The outer `feather` fraction of the box fades out so the surface has no hard edge.
export function paintGradient(data,width,height,values,n,bounds,alpha=0.5,feather=0.08){
 const yN=mercY(bounds.north),yS=mercY(bounds.south),fw=Math.max(1,width*feather),fh=Math.max(1,height*feather);
 for(let py=0;py<height;py++){
  const lat=invMercY(yN-(py+0.5)/height*(yN-yS)),fy=(bounds.north-lat)/(bounds.north-bounds.south)*(n-1);
  for(let px=0;px<width;px++){
   const fx=(px+0.5)/width*(n-1),s=sampleGrid(values,n,fx,fy),i=(py*width+px)*4;
   if(s==null){data[i+3]=0;continue}
   const edge=Math.min(1,(Math.min(px,width-1-px)+0.5)/fw,(Math.min(py,height-1-py)+0.5)/fh);
   const [r,g,b]=tierColor(s);data[i]=r;data[i+1]=g;data[i+2]=b;data[i+3]=Math.round(255*alpha*edge);
  }
 }
}
