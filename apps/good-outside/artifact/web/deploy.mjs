// Deploys dist-web/ as a static-assets-only Cloudflare Worker on one custom hostname, and refuses to
// unless a Cloudflare Access application with an identity-based allow policy already covers that
// hostname. workers.dev and preview URLs stay off, so the hostname behind Access is the only way in.
//
// Environment: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, GOOD_OUTSIDE_HOSTNAME (e.g. outside.example.com),
// optional GOOD_OUTSIDE_WORKER_NAME (default good-outside-web).
// Flags: --check-only (Access check, no deploy), --dry-run (no Access check, `wrangler deploy --dry-run`).
import {writeFile,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const API='https://api.cloudflare.com/client/v4';
export const COMPATIBILITY_DATE='2026-10-01';

const hostPattern=/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
// Access application domains look like "outside.example.com", "outside.example.com/*" or "*.example.com".
export function domainCovers(domain,host){
 const d=String(domain||'').toLowerCase().replace(/^https?:\/\//,'').replace(/\/\*?$/,'');
 if(d.includes('/'))return false; // a path-scoped app leaves the rest of the hostname open
 return d===host||(d.startsWith('*.')&&host.endsWith(d.slice(1)));
}
const appDomains=app=>[app.domain,...(app.self_hosted_domains||[]),...(app.destinations||[]).filter(x=>x.type!=='private').map(x=>x.uri)].filter(Boolean);
const opensToAll=rules=>(rules||[]).some(r=>r&&('everyone' in r||'any_valid_service_token' in r));
// Problems that leave the hostname reachable without signing in; an empty list means it is protected.
export function accessProblems(apps,host){
 const covering=apps.filter(a=>a.type==='self_hosted'&&appDomains(a).some(d=>domainCovers(d,host)));
 if(!covering.length)return [`No Cloudflare Access self-hosted application covers ${host}.`];
 const problems=[];
 for(const a of covering){
  const policies=a.policies||[],name=`Access application "${a.name||a.id}"`;
  if(!policies.some(p=>p.decision==='allow'))problems.push(`${name} has no Allow policy.`);
  for(const p of policies){
   if(p.decision==='bypass')problems.push(`${name} has a Bypass policy ("${p.name}"), which lets requests through without signing in.`);
   if(p.decision==='non_identity')problems.push(`${name} has a Service Auth policy ("${p.name}"); remove it unless you added it on purpose.`);
   if(p.decision==='allow'&&opensToAll(p.include))problems.push(`${name}'s policy "${p.name}" allows everyone. List your friends' emails instead.`);
  }
 }
 return problems;
}

async function api(path,token){
 const r=await fetch(API+path,{headers:{authorization:'Bearer '+token}});
 const body=await r.json().catch(()=>null);
 if(!r.ok||!body?.success)throw Error(`Cloudflare API ${path.split('?')[0]} answered ${r.status}: ${(body?.errors||[]).map(e=>e.message).join('; ')||'no details'}`);
 return body;
}
async function accessApps(account,token){
 const apps=[];
 for(let page=1;;page++){
  const b=await api(`/accounts/${account}/access/apps?per_page=100&page=${page}`,token);apps.push(...b.result);
  if(!b.result_info||page>=b.result_info.total_pages)break;
 }
 // Older application records list policies separately.
 for(const a of apps)if(!a.policies)a.policies=(await api(`/accounts/${account}/access/apps/${a.id}/policies`,token)).result;
 return apps;
}

export function wranglerConfig(name,host){
 return {name,compatibility_date:COMPATIBILITY_DATE,assets:{directory:'../dist-web'},workers_dev:false,preview_urls:false,routes:[{pattern:host,custom_domain:true}]};
}

// After deploying, the site must answer with the Access sign-in, never the page.
async function verifyLive(host){
 for(let attempt=0;attempt<12;attempt++){
  try{
   const r=await fetch(`https://${host}/`,{redirect:'manual'});const to=r.headers.get('location')||'';
   if([301,302,303,307].includes(r.status)&&/\.cloudflareaccess\.com\//.test(to))return 'protected';
   if(r.status===401||r.status===403)return 'protected';
   if(r.status===200)return 'open';
  }catch{}
  await new Promise(res=>setTimeout(res,10000));
 }
 return 'unverified';
}

async function main(){
 const args=new Set(process.argv.slice(2)),dry=args.has('--dry-run');
 const host=(process.env.GOOD_OUTSIDE_HOSTNAME||'').trim().toLowerCase(),name=process.env.GOOD_OUTSIDE_WORKER_NAME||'good-outside-web';
 const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
 if(!hostPattern.test(host))throw Error('Set GOOD_OUTSIDE_HOSTNAME to the hostname to serve, e.g. outside.example.com.');
 if(!/^[a-z0-9-]{1,63}$/.test(name))throw Error('GOOD_OUTSIDE_WORKER_NAME may use lowercase letters, digits and hyphens.');
 await access(fileURLToPath(new URL('../dist-web/index.html',import.meta.url))).catch(()=>{throw Error('Build first: node build.mjs && node build-web.mjs')});
 if(!dry){
  if(!token||!/^[0-9a-f]{32}$/.test(account||''))throw Error('Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.');
  const problems=accessProblems(await accessApps(account,token),host);
  if(problems.length){console.error('Not deploying, because the site would be reachable without signing in:\n- '+problems.join('\n- '));process.exit(2)}
  console.log('Cloudflare Access protects the hostname.');
  if(args.has('--check-only'))return;
 }
 const config=fileURLToPath(new URL('wrangler.generated.json',import.meta.url));
 await writeFile(config,JSON.stringify(wranglerConfig(name,host),null,1));
 const bin=fileURLToPath(new URL('../node_modules/.bin/wrangler',import.meta.url));
 const run=spawnSync(bin,['deploy','--config',config,...(dry?['--dry-run']:[])],{stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
 if(run.status!==0)process.exit(run.status||1);
 if(dry)return;
 const live=await verifyLive(host);
 if(live==='open'){console.error(`DANGER: https://${host}/ answers without the Access sign-in. Check the Access application now, or delete the Worker "${name}" in the dashboard.`);process.exit(3)}
 console.log(live==='protected'?'Deployed. The site answers with the Cloudflare Access sign-in.':'Deployed, but the site did not answer yet (new certificates can take a few minutes). Open it in a private window and confirm you see the Cloudflare Access sign-in.');
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(e=>{console.error(e.message);process.exit(1)});
