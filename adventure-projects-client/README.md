# Adventure Projects client

A small, unofficial, read-only JavaScript client with TypeScript declarations for the website endpoints behind Hiking Project, MTB Project, Powder Project, Trail Run Project, and Mountain Project. Includes a local browser demo, CLI example, tests, and the endpoint investigation notes.

**No API key or login was needed for the verified endpoints.** This is not the retired official public API, and it is not an onX-supported SDK. Website contracts may change without notice. Findings were tested October 23, 2026 (US Eastern).

## Run the demo

Requires **Node.js 20 or newer**. No installation or build step is required; there are no runtime dependencies.

```bash
cd adventure-projects-client
npm test
npm run demo
```

Open **http://127.0.0.1:4173**. Choose a guide, search, select a route, inspect the geometry/metadata, and download the JSON. The demo's local server calls the library; the UI never reimplements the upstream protocol.

If the network is unavailable, stop the server and run:

```bash
npm run demo:offline
```

Offline mode uses explicitly labeled **synthetic** records via an injected `fetch` implementation. It exercises the same client request construction, validation, and parsers. It never silently replaces live data. The starting query `a` matches three examples; changing the query really filters them.

`PORT=4180 npm run demo` selects another port. The server binds only to loopback. It is a development demo, not a production hosting service. Route geometry is drawn without a basemap; it is not a navigation map. Climbing records show parent-area coordinates rather than inventing a climbing line. Raw HTML is never inserted into the demo DOM.

## Use the library

Import directly from the extracted folder, or install that local folder into another project:

```bash
npm install /absolute/path/to/adventure-projects-client
```

```js
import { AdventureClient, routeId } from 'adventure-projects-client';
// Inside this repository: import from './src/index.js'.

const client = new AdventureClient({ site: 'hike' });
const page = await client.search('Gorham', {
  limit: 5,
  sort: [{ field: 'length.value', order: 'desc' }],
});

for (const item of page.items) console.log(item.title, item.length);
if (page.items.length) {
  const route = await client.getRoute(routeId(page.items[0].id));
  console.log(route.geometry, route.properties);
}
```

ES modules only. Import TypeScript types from the same package. Runtime source is plain modern JavaScript, with a matching `src/index.d.ts`; no transpilation is needed. A literal `site: 'climb'` gives `getRoute()` a `ClimbRoute` return type; the other sites return `TrailFeature`.

## Site mapping and capabilities

| `site` | Host | Routes | Elevation | Area JSON / photo lists | Conditions HTML |
|---|---|---|---|---|---|
| `hike` | www.hikingproject.com | GeoJSON | Yes | Not supported | Yes |
| `mtb` | www.mtbproject.com | GeoJSON | Yes | Not verified | Yes |
| `ski` | www.powderproject.com | GeoJSON | Rejected upstream | Not verified | Yes |
| `trailrun` | www.trailrunproject.com | GeoJSON | Rejected upstream | Not verified | Yes |
| `climb` | www.mountainproject.com | Climbing JSON | Not applicable | Yes | Not supported |
| `nationalparks` | www.hikingproject.com | GeoJSON | Yes | Not supported | Yes |

All five hosts support structured search. `nationalparks` is an alias, **not a park-only search filter**. The [National Parks index](https://www.hikingproject.com/nationalparks) links to Hiking Project directories, which link to trails. This SDK does not scrape park directories or claim to enumerate every trail in a park. Search by park name is text search, not geographic membership.

## Client API

```js
const c = new AdventureClient({
  site: 'hike',
  timeoutMs: 15_000,       // Per network request; includes response-body reading
  minIntervalMs: 250,     // Minimum spacing between starts on this instance
  fetch: globalThis.fetch // Injectable for tests, controlled proxies, or caching
});
```

The client makes no authenticated requests and omits browser credentials. It rejects redirects, never automatically retries, and does not crawl. The pacing default is a client courtesy, **not a known server rate limit**. Reuse a client to retain pacing; separate clients do not share a limiter. Requests can overlap after their start interval. Calls queued for pacing are outside the per-request timeout.

### Search

```js
const page = await c.search('Acadia', {
  types: ['Route'], // Default. Also Area, Gem, Photo; availability varies by site
  from: 0,
  limit: 10,       // Client guard: 1–100; not a claimed upstream maximum
  sort: [{ field: 'rating', order: 'desc' }],
});
// {items, total, totalRelation, nextFrom, raw}
```

`items` unwraps `hits[]._source`. `raw` preserves the search response, including original IDs and index fields. `totalRelation` is `eq` or `gte`; the latter is a lower bound. `nextFrom` is null when complete, otherwise advances by the number actually returned. `types` defaults to routes rather than mixed results that can include user profiles. The SDK intentionally does not expose user-profile search.

Search field examples: `id: "trails.7019235"` (or `routes.ID` for climbing), `title`, `url`, `description`, `breadcrumbs`, `difficulty`, `rating`, `length: {value, unit}`, `location`, `bounds`, `created`, and `updated`. Fields vary; do not assume every result has all of them. Some trail search results contain descriptions that the route GeoJSON omits.

`routeId()` accepts positive numeric IDs, `trails.ID`, `routes.ID`, or an HTTPS route URL on a known `www` host. It rejects area identifiers. IDs must be used with the correct site; identical numbers need not identify the same route across sites.

Supported sort fields are `rating`, `length.value`, and `difficulty.value`, with `asc` or `desc`. These fields are advertised by the Hiking Project search UI. Length sorting was live-verified there; semantic usefulness and support on other domains are not guaranteed. Climbing numeric difficulty in the search index may not represent the displayed grade meaningfully.

### Bounded pagination

```js
for await (const page of c.searchPages('Gorham', {limit: 10, maxPages: 2})) {
  console.log(page.items);
}
```

`maxPages` defaults to **1** and is capped at 100 by the client. Pagination is offset-based, not a stable snapshot: upstream updates or tied scores can change ordering. The SDK does not automatically fetch the whole catalog or deduplicate across pages.

### Routes and supporting resources

```js
await c.getRoute(7019235);
await c.getElevationProfile(7019235);
await c.getConditionsHtml(7019235);

const climbing = new AdventureClient({site: 'climb'});
await climbing.getRoute(105862912);
const area = await climbing.getArea(116973579);
console.log(area.children); // Route and/or area summaries, including IDs
await climbing.getPhotos('route', 105862912);
await climbing.getPhotos('area', 116973579);
await climbing.getAreaPopupHtml(116973579);
```

Trail route responses are GeoJSON Features with `LineString` or `MultiLineString` geometry and `[longitude, latitude]` coordinates. `length`, `ascent`, and `descent` are in meters in the tested responses; descent can be negative. Geometry may be simplified, and must not be assumed to be the original GPX track. `drawRide` and `drawTrail` are upstream display flags, not a universal activity classification.

Mountain Project route responses are a different schema: grade, pitches, height in feet, climbing types, HTML description/protection/descent sections, access notes, and parent-area coordinates. Area coordinates are **not** the traced climb. Area responses include `children`; use their explicit `type` before requesting each child.

Photo endpoints return metadata and thumbnail references, not downloaded image bytes. Conditions and area popups return HTML strings. Treat all external HTML as untrusted: use a sanitizer appropriate to your application or show it as text. Availability of content does not grant redistribution rights.

Elevation responses are arrays of six-number tuples. The client preserves them unchanged: the observed format mixes elevation, grade, distance, and projected-coordinate fields, and their full semantics were **not independently verified**. No normalized-unit elevation chart is claimed. `project=ski` and `project=trailrun` returned `400 {"error":"Invalid project. Must be hike or mtb"}`. The client rejects those capabilities locally instead of substituting another project and risking the wrong trail.

### Cancellation and errors

Every data method accepts `{signal}`; search accepts it inside its options.

```js
import {ApiError, SchemaError, UnsupportedCapabilityError} from 'adventure-projects-client';
const abort = new AbortController();
try {
  await c.search('Gorham', {signal: abort.signal});
} catch (error) {
  if (error instanceof ApiError) console.log(error.status, error.retryAfterMs);
  else if (error instanceof SchemaError) console.log('Upstream response changed');
  else if (error instanceof UnsupportedCapabilityError) console.log('Not supported on this site');
  else throw error; // Includes AbortError, TimeoutError, and fetch/network failures
}
```

HTTP failures carry `status`, `url`, and a parsed `Retry-After` hint when present. Error-page HTML is not exposed. Malformed JSON, HTML returned as a successful JSON response, and missing core response fields produce `SchemaError`. Validation is deliberately lightweight rather than a complete upstream schema. Optional fields are preserved. Unknown search options such as `filter` are rejected instead of silently suggesting they work.

## Verified HTTP interface

Paths are relative to the selected host.

| Method / path | Scope | Response |
|---|---|---|
| GET or POST `/api/v2/search?q=…&limit=…&from=…` | All five hosts | Structured JSON; use POST for typed search/sorting |
| GET `/api/v2/routes/{id}` | All five hosts | Trail GeoJSON or climbing JSON |
| GET `/api/v2/trails/{id}/elevation-profile?project=hike` | Hiking / parks | Tuple arrays |
| GET `/api/v2/trails/{id}/elevation-profile?project=mtb` | MTB | Tuple arrays |
| GET `/api/v2/areas/{id}` | Mountain Project | Area JSON with children |
| GET `/api/v2/routes/{id}/photos` | Mountain Project | Photo metadata array |
| GET `/api/v2/areas/{id}/photos` | Mountain Project | Photo metadata array |
| GET `/ajax/public/trail/conditions/{id}` | Hiking, MTB, Powder, Trail Run | HTML |
| GET `/ajax/climb-area/{id}` | Mountain Project | HTML |
| GET `/ajax/public/search/suggestions?q=…` | All five hosts | JSON wrapping HTML; superseded by structured search in this client |
| GET `/ajax/public/search/location?q=…&source=ride-finder` | Verified on Hiking only | JSON wrapping location-suggestion HTML; not wrapped by SDK |

The search POST body used by the website and client is:

```json
{"types":["Route"],"filter":[],"sort":[{"field":"length.value","order":"desc"}]}
```

These POST requests perform searches, not writes. Direct requests returned wildcard CORS headers on several tested endpoints. Browser CORS behavior is **not** exhaustively verified, including JSON POST preflight. The demo uses its own loopback server to avoid depending on that behavior.

## Rejected hypotheses and unresolved questions

| Test | Observation | Client treatment |
|---|---|---|
| Search `size=2` | Ignored; returned default 25 | Uses `limit` |
| Search query-string `type=Trail` | Ignored; mixed types | Uses POST `types: ["Route"]` |
| Elasticsearch-shaped `range` / `geo_distance` in `filter` | Ignored in tests | No arbitrary filter option |
| Sort `[{"length.value":"desc"}]` | Ignored | Uses `{field, order}` |
| Hiking `/api/v2/areas/8008454` | 401 HTML | No hiking area method |
| Hiking `/api/v2/trails/7019235` | 401 HTML | Uses `/routes/` |
| Hiking `/api/v2/areas/8008454/routes` | 404 | Not exposed |
| Hiking `/api/v2/routes/7019235/photos` | 404 | Photo method climbing-only |
| Hiking `/api/v2/routes/7019235/elevation-profile` | 404 | Uses `/trails/…/elevation-profile` |
| Mountain `/api/v2/areas/116973579/children` | 404 | Reads `area.children` |
| Mountain `/api/v2/areas/116973579/routes` | 200 with `[]`, despite children | Not trusted / not exposed |
| Legacy Hiking Mapbox tileset | Direct metadata request returned 403 | No tile extraction or token reuse |

A 401 does not establish that a useful resource exists; it could be generic middleware. A 200 does not establish that a guessed parameter was honored. No authentication bypass was attempted. Geographic/bounding-box search, complete park membership, upstream limits, original GPX fidelity, full response schemas, and stability remain unresolved.

## Commands and verification

```bash
npm test                            # Offline contract and local demo integration tests
npm run example -- hike Gorham      # Three live results + first route JSON
npm run test:live                   # Ten opt-in live calls: search + route on five sites
npm pack                           # Package src, declarations, README, docs for local use
```

The downloadable source archive also includes the browser demo and examples. The npm package intentionally ships the client and documentation only. This package has not been published to npm. There is no license grant for the upstream data; the package is marked UNLICENSED pending an explicit distribution decision.

See [docs/verification.md](docs/verification.md) for the recorded validation and [docs/design.md](docs/design.md) for implementation choices. Keep request volumes modest, cache appropriate results in your application, and honor upstream failures and rate-limit responses. Do not use the demo route previews for outdoor navigation.
