# Good Outside artifact edition

Builds the planner as a self-contained Claude Artifact page. Published copy (private to its owner): https://claude.ai/artifact/Y9tiYMi7tbGVhCN2zkd798

```sh
cd apps/good-outside/artifact
npm ci
npm test        # bridge, place search and label placement
npm run build   # writes dist/ and dist/files.json (published path -> source, content type)
```

Publish `dist/index.html` with the Artifact tool, passing `dist/files.json` as `files` (with `root` set to this folder) and the capability `{mcp: {servers: [{server: "host:claude_browser", tools: ["preview_start", "navigate", "get_page_text"]}]}}`.

## How it differs from the hosted planner

Artifact pages run in a locked frame: no fetch to other hosts, no remote images or tiles, no geolocation, no server code.

- **Shared logic, unchanged.** `engine.mjs`, `trips.mjs`, `services.mjs` and the curated catalogs are copied byte-for-byte from `../public` at build time. `src/app.mjs` is a fork of `../public/app.mjs` for this runtime.
- **Regions.** The 49 curated regions bundled with the planner, filtered the way `/api/locations` filters (activity, 450 km, nearest 24). The 44,692-record D1 database is not included.
- **Weather, drive times, postcodes.** `src/bridge.mjs` gives `createRegionClient` a transport that loads the Open-Meteo and OSRM JSON URLs in the Claude desktop app's built-in browser (`host:claude_browser`) and parses the page text. One tab, serialized requests, three allowlisted hosts. Host servers answer only for the artifact's owner, inside the Claude desktop app; everywhere else forecasts and drive times stay unknown and the page says why.
- **Map.** Leaflet with Natural Earth country borders and US Census state and county lines (public domain, via `world-atlas`/`us-atlas`), plus GeoNames city labels (CC BY 4.0, via `all-the-cities`). No streets, terrain or trails.
- **Origin search.** Offline over GeoNames places with 1,000+ residents; falls back to Open-Meteo geocoding through the bridge for postcodes.
- **Not included.** Device location, the `/locations` directory, `/api/health`, MCP refresh tools and the ODbL export.

The bridge relies on the documented `url`/`tabId` arguments and reads results defensively, but it has not yet been exercised against the real built-in browser.
