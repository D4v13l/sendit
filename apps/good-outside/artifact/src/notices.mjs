// Where to check closures and alerts for a curated region, from the manager links it already carries.
// Forest Service and National Park Service pages follow site-wide paths; other managers post
// alerts on the park page itself, so that page is the link.
const MANAGERS=[
 ['fs.usda.gov','USDA Forest Service'],['nps.gov','National Park Service'],['dnr.wa.gov','Washington DNR'],
 ['recreation.gov','Recreation.gov'],['cpw.state.co.us','Colorado Parks and Wildlife'],['mass.gov','Massachusetts DCR'],
 ['nhstateparks.org','New Hampshire State Parks'],['parks.ca.gov','California State Parks'],['stateparks.oregon.gov','Oregon State Parks'],
 ['stateparks.utah.gov','Utah State Parks'],['parks.ny.gov','New York State Parks'],['dec.ny.gov','New York DEC'],
 ['tpwd.texas.gov','Texas Parks and Wildlife'],['dnr.state.mn.us','Minnesota DNR'],['surreyhills.org','Surrey Hills National Landscape'],
 ['southdowns.gov.uk','South Downs National Park'],['naturpark-ammergauer-alpen.de','Naturpark Ammergauer Alpen'],
 ['nationalpark-bayerischer-wald.bayern.de','Bavarian Forest National Park'],['nationalparks.nsw.gov.au','NSW National Parks'],
];
export function managerName(url){
 let host='';try{host=new URL(url).hostname.replace(/^www\./,'')}catch{}
 return MANAGERS.find(([h])=>host===h||host.endsWith('.'+h))?.[1]||host||'the land manager';
}

// Returns {url, label, manager, managerUrl, derived}. `derived` marks a link built from a site-wide
// path rather than one recorded in the catalog, so the page can offer the recorded page beside it.
export function closureNotice(region){
 // Provider records carry a source page rather than a land manager.
 if(region.provider==='ridb')return {url:region.url,label:'Recreation.gov alerts & notices',manager:'Recreation.gov',managerUrl:region.url,derived:false,note:'Recreation.gov area pages carry the managing agency’s alerts and closures.'};
 if(region.provider==='openbeta')return {url:region.url,label:'OpenBeta access notes',manager:'OpenBeta',managerUrl:region.url,derived:false,note:'No land manager is recorded for this climbing area. Check OpenBeta’s access notes and the local land manager for closures, raptor seasons and permits.'};
 if(region.provider==='openskidata')return {url:region.url,label:'Ski area on OpenStreetMap',manager:'OpenStreetMap',managerUrl:region.url,derived:false,note:'Check the resort’s own site for operating status, lift and road closures.'};
 const links=[region.url,region.camp,region.permit].filter(Boolean);
 for(const link of links){
  const fs=link.match(/^https:\/\/www\.fs\.usda\.gov\/(r\d{2})\/([a-z0-9-]+)\//);
  if(fs){const managerUrl=`https://www.fs.usda.gov/${fs[1]}/${fs[2]}/recreation`;return {url:`https://www.fs.usda.gov/${fs[1]}/${fs[2]}/alerts`,label:'Forest Service alerts & closures',manager:'USDA Forest Service',managerUrl:links.find(l=>l.startsWith(managerUrl))||region.url,derived:true}}
  const nps=link.match(/^https:\/\/www\.nps\.gov\/([a-z]{4})\//);
  if(nps)return {url:`https://www.nps.gov/${nps[1]}/planyourvisit/conditions.htm`,label:'Park current conditions & closures',manager:'National Park Service',managerUrl:region.url,derived:true};
 }
 // New York DEC keeps Catskills closures on its backcountry information page.
 const dec=links.find(l=>/^https:\/\/dec\.ny\.gov\/things-to-do\/hiking\/catskill-backcountry-information/.test(l));
 if(dec)return {url:dec,label:'Backcountry conditions & closures',manager:'New York DEC',managerUrl:region.url,derived:false};
 const manager=managerName(region.url);
 return {url:region.url,label:`${manager} notices`,manager,managerUrl:region.url,derived:false};
}
