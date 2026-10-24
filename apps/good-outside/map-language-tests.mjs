import assert from 'node:assert/strict';
const m=await import('./public/map-language.mjs').catch(()=>({}));assert.equal(typeof m.localizeMapStyle,'function','Map labels must use device language instead of destination language');
const style={version:8,layers:[{id:'city',layout:{'text-field':['concat',['get','name:latin'],'\n',['get','name:nonlatin']]}},{id:'shield',layout:{'text-field':['get','ref']}}]};
const en=m.localizeMapStyle(style,'en-US');assert.deepEqual(en.layers[1],style.layers[1]);assert.notDeepEqual(en.layers[0],style.layers[0]);assert.ok(JSON.stringify(en.layers[0]).includes('name:en'));assert.ok(!JSON.stringify(en.layers[0]).includes('name:nonlatin'));
const fr=m.localizeMapStyle(style,'fr-CA');assert.ok(JSON.stringify(fr.layers[0]).includes('name:fr'));assert.deepEqual(style.layers[0].layout['text-field'],['concat',['get','name:latin'],'\n',['get','name:nonlatin']]);
assert.equal(m.preferredMapLanguage(['de-DE','en-US']),'de-DE');assert.equal(m.preferredMapLanguage([]),'en');
console.log('PASS: map follows device language, removes native bilingual labels, retains road shields and has a fallback');
