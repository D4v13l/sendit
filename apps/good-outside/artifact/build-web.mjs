// Turns the artifact build (dist/, from build.mjs) into a self-hosted static site in dist-web/:
// a full HTML document, Leaflet and topojson-client served from the site itself instead of CDNs,
// and response headers that let the page talk only to itself and the forecast and routing services.
import {mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {HOSTS} from './src/bridge.mjs';

const here=new URL('./',import.meta.url),dist=new URL('dist/',here),out=new URL('dist-web/',here);

// The services the page calls from the viewer's browser: the same hosts the Claude bridge allows.
export const SERVICES=[...HOSTS].map(h=>'https://'+h);
// Vendored scripts: Leaflet is checked against the SRI hash Leaflet publishes for 1.9.4; topojson-client
// comes from npm at the exact version, verified by the lockfile's integrity hash.
const VENDOR=[
 {cdn:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js',from:new URL('../public/leaflet.js',here),to:'vendor/leaflet-1.9.4.js',sha256:'20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo='},
 {cdn:'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js',from:new URL('node_modules/topojson-client/dist/topojson-client.min.js',here),to:'vendor/topojson-client-3.1.0.min.js',version:['topojson-client','3.1.0']},
];

export const HEADERS=`/*
  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ${SERVICES.join(' ')}; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
  X-Frame-Options: DENY
  X-Robots-Tag: noindex, nofollow
  Strict-Transport-Security: max-age=31536000
`;

// The artifact page is a body fragment led by its <title> and <style>; give it a document around them.
export function webDocument(fragment){
 let body=fragment;const head=[];
 for(const re of [/^\s*<title>[\s\S]*?<\/title>/,/^\s*<style>[\s\S]*?<\/style>/]){const m=body.match(re);if(m){head.push(m[0].trim());body=body.slice(m[0].length)}}
 for(const v of VENDOR){const tag=`<script src="${v.cdn}">`;if(!body.includes(tag))throw Error('Page no longer loads '+v.cdn);body=body.replace(tag,`<script src="${v.to}">`)}
 if(/https?:\/\/(cdnjs|cdn\.jsdelivr|unpkg)/.test(body))throw Error('Page still loads a script from a CDN');
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">${head.join('')}</head><body>${body.trim()}</body></html>\n`;
}

if(import.meta.url===`file://${process.argv[1]}`){
 const files=JSON.parse(await readFile(new URL('files.json',dist),'utf8'));
 await rm(out,{recursive:true,force:true});await mkdir(new URL('vendor/',out),{recursive:true});
 for(const [path,src] of Object.entries(files)){const to=new URL(path,out);await mkdir(new URL('./',to),{recursive:true});await copyFile(new URL(src.from??src,here),to)}
 for(const v of VENDOR){
  const bytes=await readFile(v.from);
  if(v.sha256&&createHash('sha256').update(bytes).digest('base64')!==v.sha256)throw Error(v.to+' does not match the published hash');
  if(v.version){const pkg=JSON.parse(await readFile(new URL(`node_modules/${v.version[0]}/package.json`,here),'utf8'));if(pkg.version!==v.version[1])throw Error(v.to+': installed '+pkg.version)}
  await writeFile(new URL(v.to,out),bytes);
 }
 await writeFile(new URL('index.html',out),webDocument(await readFile(new URL('index.html',dist),'utf8')));
 await writeFile(new URL('_headers',out),HEADERS);
 await writeFile(new URL('robots.txt',out),'User-agent: *\nDisallow: /\n');
 console.log(`Built dist-web/: ${Object.keys(files).length+VENDOR.length+3} files.`);
}
