import assert from 'node:assert/strict';
import * as catalog from './public/catalog.mjs';
// Previously the same Washington list was routed for every selected origin.
const nearby=catalog.nearbyRegions?.(catalog.regions,{lat:42.36,lon:-71.06})??catalog.regions;
assert.ok(nearby.every(r=>Math.abs(r.road[1]+71.06)<8),'Boston discovery must exclude the Washington destinations');
console.log('PASS: candidate set follows origin');
