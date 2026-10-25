# Good Outside artifact edition

Builds the planner as a self-contained Claude Artifact page. Published copy (private to its owner): https://claude.ai/artifact/Y9tiYMi7tbGVhCN2zkd798

```sh
cd apps/good-outside/artifact
npm ci
NODE_USE_ENV_PROXY=1 node fetch-data.mjs   # pinned Natural Earth layers into .cache/ (prefix only behind a proxy)
npm test        # bridge, place search and label placement
npm run build   # writes dist/ and dist/files.json (published path -> source, content type)
```

Publish `dist/index.html` with the Artifact tool, passing `dist/files.json` as `files` (with `root` set to this folder) and the capability `{mcp: {servers: [{server: "host:claude_browser", tools: ["preview_start", "navigate", "get_page_text"]}]}}`.

## How it differs from the hosted planner

Artifact pages run in a locked frame: no fetch to other hosts, no remote images or tiles, no geolocation, no server code.

- **Shared logic, unchanged.** `engine.mjs`, `trips.mjs`, `services.mjs` and the curated catalogs are copied byte-for-byte from `../public` at build time. `src/app.mjs` is a fork of `../public/app.mjs` for this runtime.
- **Regions.** The 49 curated regions bundled with the planner, filtered the way `/api/locations` filters (activity, 450 km, nearest 24). The 44,692-record D1 database is not included.
- **Weather, drive times, postcodes.** `src/bridge.mjs` gives `createRegionClient` a transport that loads the Open-Meteo and OSRM JSON URLs in the Claude desktop app's built-in browser (`host:claude_browser`) and parses the page text. One tab, serialized requests, three allowlisted hosts. Each answer is checked against its request so a page still showing the previous response is re-read, forecasts request only the days the trip needs, and multi-point forecasts are chunked (and halved again if the page text comes back cut off). Moving trip dates past the fetched range refetches. Host servers answer only for the artifact's owner, inside the Claude desktop app; everywhere else forecasts and drive times stay unknown and the page says why.
- **Map.** Leaflet over geography shipped with the page: Natural Earth countries, rivers, lakes, mountain-range names, peaks and 61 US National Park Service unit boundaries (public domain; layers pinned by commit and SHA-256 in `data-sources.json`), US Census state and county lines (via `us-atlas`), and GeoNames labels for cities of 100,000+ (CC BY 4.0, via `all-the-cities`). Labels avoid each other and the planner's markers. No national forests, wilderness, state or non-US parks, roads, trails or terrain shading.
- **Origin search.** Offline over GeoNames places with 1,000+ residents; falls back to Open-Meteo geocoding through the bridge for postcodes.
- **Not included.** Device location, the `/locations` directory, `/api/health`, MCP refresh tools and the ODbL export.

The bridge relies on the documented `url`/`tabId` arguments and reads results defensively, but it has not yet been exercised against the real built-in browser.
