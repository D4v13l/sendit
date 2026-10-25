# Good Outside artifact edition

Builds the planner as a self-contained Claude Artifact page. Published copy (private to its owner): https://claude.ai/artifact/Y9tiYMi7tbGVhCN2zkd798

```sh
cd apps/good-outside/artifact
npm ci
NODE_USE_ENV_PROXY=1 node fetch-data.mjs      # pinned Natural Earth layers into .cache/ (prefix only behind a proxy)
NODE_USE_ENV_PROXY=1 node fetch-terrain.mjs   # elevation tiles for the hillshade, checked against terrain-tiles.json
npm test        # bridge, place search and label placement
npm run build   # writes dist/ and dist/files.json (published path -> source, content type)
```

Publish `dist/index.html` with the Artifact tool, passing `dist/files.json` as `files` (with `root` set to this folder) and the capability `{mcp: {servers: [{server: "host:claude_browser", tools: ["preview_start", "navigate", "get_page_text"]}]}}`.

## How it differs from the hosted planner

Artifact pages run in a locked frame: no fetch to other hosts, no remote images or tiles, no geolocation, no server code.

- **Shared logic, unchanged.** `engine.mjs`, `trips.mjs`, `services.mjs` and the curated catalogs are copied byte-for-byte from `../public` at build time. `src/app.mjs` is a fork of `../public/app.mjs` for this runtime.
- **Regions.** The 49 curated regions bundled with the planner, filtered the way `/api/locations` filters (activity, 450 km, nearest 24). Biking and Bikepacking match the same areas (the curated set tags none as Biking). The 44,692-record D1 database is not included.
- **List.** One list instead of under-2-hour and 2–4-hour tabs: best weather first, then shortest modeled drive. Areas over four modeled hours are left out; areas without a drive estimate stay listed with their straight-line distance.
- **Closures.** The detail sheet's camping-and-access section is replaced by a closures link (`src/notices.mjs`): Forest Service forest alerts pages and NPS current-conditions pages are derived from each region's recorded links, with the recorded page offered beside them; other managers' own park pages are linked directly. The derived addresses follow those agencies' site-wide paths but were not loaded during the build.
- **Weather, drive times, postcodes.** `src/bridge.mjs` gives `createRegionClient` a transport that loads the Open-Meteo and OSRM JSON URLs in the Claude desktop app's built-in browser (`host:claude_browser`) and parses the page text. One tab, serialized requests, three allowlisted hosts. Each answer is checked against its request so a page still showing the previous response is re-read, forecasts request only the days the trip needs, and multi-point forecasts are chunked (and halved again if the page text comes back cut off). Moving trip dates past the fetched range refetches. Host servers answer only for the artifact's owner, inside the Claude desktop app; everywhere else forecasts and drive times stay unknown and the page says why.
- **Weather map.** After a search the map shows no per-area markers. Instead `src/gradient.mjs` ranks an 8×8 grid of forecast points (about 300 km around the origin) with the planner's `evaluate()` and paints a red–yellow–green surface, interpolated between ranked points only, feathered at the edges and clipped to land. Grid forecasts share the bridge and cache; activity and date changes repaint without refetching unless the dates outrun the stored forecast. Day trips request no hourly data, which keeps responses small.
- **Map.** Leaflet over geography shipped with the page: Natural Earth countries, rivers, lakes, major highways with route plates, mountain-range names, peaks and 61 US National Park Service unit boundaries (public domain; layers pinned by commit and SHA-256 in `data-sources.json`), US Census interior state borders (via `us-atlas`), and GeoNames labels for cities of 100,000+ (CC BY 4.0, via `all-the-cities`). Coastlines and borders are drawn once from topology meshes. Light hillshade is rendered at build time (`src/hillshade.mjs`) from AWS Terrain Tiles (Tilezen; tiles pinned by SHA-256 in `terrain-tiles.json`): a zoom-4 world layer plus zoom-7 layers around each cluster of curated regions, multiplied over land and the weather surface. Labels avoid each other and the planner's markers. No national forests, wilderness, state or non-US parks, minor roads or trails.
- **Origin search.** Offline over GeoNames places with 1,000+ residents; falls back to Open-Meteo geocoding through the bridge for postcodes.
- **Not included.** Device location, the `/locations` directory, `/api/health`, MCP refresh tools and the ODbL export.

The bridge relies on the documented `url`/`tabId` arguments and reads results defensively, but it has not yet been exercised against the real built-in browser.
