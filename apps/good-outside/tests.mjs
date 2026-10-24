import assert from 'node:assert/strict';import {evaluate,dates,tier} from './public/engine.mjs';
const start='2026-10-24';const keys=dates(start,3);const daily={time:keys,temperature_2m_max:[18,19,18],temperature_2m_min:[10,10,10],precipitation_sum:[0,0,0],precipitation_probability_max:[10,10,10],wind_gusts_10m_max:[10,10,10],snowfall_sum:[0,0,0]};const hourly={time:keys.flatMap(k=>Array.from({length:24},(_,h)=>k+'T'+String(h).padStart(2,'0')+':00')),temperature_2m:Array(72).fill(10)};let f={daily,hourly};
assert.equal(evaluate(f,start,3,'Hiking','none').label,'Excellent');
daily.precipitation_sum[2]=20;assert.equal(evaluate(f,start,3,'Hiking','none').label,'Poor');assert.equal(evaluate(f,start,2,'Hiking','none').label,'Excellent');daily.precipitation_sum[2]=0;
hourly.temperature_2m[24]=-2;assert.equal(evaluate(f,start,2,'Hiking','car').label,'Poor');assert.equal(evaluate(f,start,2,'Hiking','none').label,'Excellent');assert.equal(evaluate(f,start,1,'Hiking','car').label,'Excellent');hourly.temperature_2m[24]=10;
daily.precipitation_sum[0]=4;assert.equal(evaluate(f,start,1,'Climbing','none').label,'Poor');assert.equal(evaluate(f,start,1,'Hiking','none').label,'Passable');daily.precipitation_sum[0]=0;
assert.equal(evaluate(f,'2026-11-30',2,'Hiking','none').level,'unknown');daily.wind_gusts_10m_max[1]=null;assert.equal(evaluate(f,start,2,'Hiking','none').level,'unknown');daily.wind_gusts_10m_max[1]=10;
hourly.temperature_2m[24]=null;assert.equal(evaluate(f,start,2,'Hiking','backcountry').level,'unknown');hourly.temperature_2m[24]=10;
daily.temperature_2m_max[0]=5;assert.equal(evaluate(f,start,1,'Skiing','none').label,'Passable');daily.temperature_2m_max[0]=0;assert.equal(evaluate(f,start,1,'Backcountry skiing','none').label,'Excellent');
assert.equal(tier(7200),'near');assert.equal(tier(7201),'far');assert.equal(tier(14400),'far');assert.equal(tier(14401),'outside');assert.equal(tier(null),'unknown');
assert.deepEqual(dates('2026-10-31',2),['2026-10-31','2026-11-01']);console.log('Passed: full-trip ranking, overnight hours, activity thresholds, missing data, forecast horizon, drive tiers, date rollover.');

await import("./location-tests.mjs");
await import("./discovery-tests.mjs");
await import("./service-tests.mjs");

await import("./near-term-tests.mjs");

await import("./map-language-tests.mjs");
