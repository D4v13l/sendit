// Hillshade from terrarium-encoded elevation tiles, used at build time.
// Only shadows are kept: flat ground and water stay white so the layer can be multiplied over the map.
export const decodeTerrarium=(r,g,b)=>r*256+g+b/256-32768;

// elevation: Float32Array (w*h, metres). metersPerPixel(row) gives ground resolution for each row.
// Returns Uint8Array greyscale, 255 = no shading.
export function hillshade(elevation,w,h,metersPerPixel,{azimuth=315,altitude=45,zFactor=1,strength=0.55}={}){
 const out=new Uint8Array(w*h),zen=(90-altitude)*Math.PI/180,az=(360-azimuth+90)*Math.PI/180;
 const flat=Math.cos(zen),at=(x,y)=>elevation[Math.min(h-1,Math.max(0,y))*w+Math.min(w-1,Math.max(0,x))];
 for(let y=0;y<h;y++){
  const cell=metersPerPixel(y)*8;
  for(let x=0;x<w;x++){
   const e=at(x,y);if(!(e>0)){out[y*w+x]=255;continue}
   // Horn's method over the 3x3 neighbourhood.
   const a=at(x-1,y-1),b=at(x,y-1),c=at(x+1,y-1),d=at(x-1,y),f=at(x+1,y),g=at(x-1,y+1),hh=at(x,y+1),i=at(x+1,y+1);
   const dzdx=((c+2*f+i)-(a+2*d+g))/cell*zFactor,dzdy=((g+2*hh+i)-(a+2*b+c))/cell*zFactor;
   const slope=Math.atan(Math.hypot(dzdx,dzdy)),aspect=Math.atan2(dzdy,-dzdx);
   const shade=Math.max(0,Math.cos(zen)*Math.cos(slope)+Math.sin(zen)*Math.sin(slope)*Math.cos(az-aspect));
   out[y*w+x]=Math.round(255*(1-strength*Math.max(0,1-shade/flat)));
  }
 }
 return out;
}
