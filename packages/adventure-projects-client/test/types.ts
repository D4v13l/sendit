import {AdventureClient, type TrailFeature, type ClimbRoute, type Site} from '../src/index.js';
const trail: TrailFeature = await new AdventureClient().getRoute(1);
const climb: ClimbRoute = await new AdventureClient({site:'climb'}).getRoute(1);
const site: Site = Math.random() > .5 ? 'climb' : 'hike';
const mixed: ClimbRoute | TrailFeature = await new AdventureClient({site}).getRoute(1);
void trail; void climb; void mixed;
// @ts-expect-error unsupported option must not appear to work
new AdventureClient().search('a',{filter:[]});
// @ts-expect-error invalid site
new AdventureClient({site:'other'});
