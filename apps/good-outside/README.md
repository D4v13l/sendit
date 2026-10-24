# Good Outside

**Portable repository setup:** location payloads are stored in R2 rather than Git. From the repository root run `npm run data:download`, then follow [setup](../../docs/GOOD-OUTSIDE-SETUP.md) and [storage operations](../../docs/DATA-STORAGE.md). The publication URLs and schedule descriptions below refer to the original deployment; they are not transferred with this source.

Published app: https://good-outside-jh.johnlhenning.chatgpt.site/
All-location directory: https://good-outside-jh.johnlhenning.chatgpt.site/locations

Phone-friendly near-term outdoor weather planner with a persistent Cloudflare D1 location database. The existing Site identity and access policy are preserved. The frontend is authored in public/; Vinext/Cloudflare build output in dist/ is generated. The root serves the static planner, with Worker API and MCP routes for data and unattended refresh.

## Current data

44,692 source records were imported and independently read back from the hosted database:

- OpenBeta:35,753 validated climbing places, CC0 excluding photos.
- OpenSkiData:6,935 named source-ID-bearing ski areas, ODbL with combined-source attribution.
- Recreation.gov RIDB:1,955 US recreation areas with explicit activity joins (Hiking1,867/Biking808/Backpacking73; activities overlap).
- Curated seed:49 sourced regions retained as a provider, including additional hiking and specialist activities.

Counts are source records, not claims of unique physical places or current openings. Climbing and skiing have broad international coverage. RIDB hiking/biking/backpacking coverage is US federal recreation data; coverage is not globally exhaustive. Regular Biking is separate from Bikepacking; neither overnight suitability nor backcountry skiing is inferred from generic activity tags.

## Product

New visits default to Today/one day. Today, Tomorrow, Next3days and This weekend shortcuts follow destination-local dates; custom trip dates remain available. Today is a full-day forecast, not a remaining-hours nowcast. Open-Meteo forecasts are selected over the full trip, including hourly overnight minima when camping. The worst daily/overnight preference score determines Excellent/Passable/Poor. Incomplete data stays Unranked. Weather is not access, terrain, snowpack, operations or avalanche safety.

The planner queries /api/locations by actual manual/device origin and activity. A450km straight-line radius selects candidates, capped at24 source-named areas. Only live OSRM road-network estimates assign under-two-hour and two-to-four-hour tiers. Routes are approximate to disclosed source/gateway points, not verified open trailheads; missing durations and distant road snaps stay unknown. Climbing leaf records are grouped using their real source hierarchy. Explicit buildering/indoor hierarchy records and source-reported inactive ski areas are excluded from recommendations. Indoor/outdoor classification can otherwise be unknown.

Zoom level10+ shows nine real weather sample coordinates in a10-mile-radius circle, using the same activity/dates/overnight ranking. Dots are not invented recreation sites, trails, campsites or access points; model resolution can be coarser than spacing. Point forecasts can be explored beyond destination catalog coverage. Map labels use device/browser language through OpenFreeMap/OpenMapTiles, with translated/transliterated fallback. Three suggested activity/area combinations use complete forecasts and known drives within4hours.

Browser-local bookmarks store absolute trip dates, origin, activity, overnight selection and optional source ID/map center. Reopening checks fresh forecasts. /api/location resolves exact stable source IDs even when nearby grouping changes. These are not reservations or cloud-synced personal records.

/locations browses the entire database without an origin: bounded text search, activity/provider filters, stable50-record pagination, expandable provenance/access details, and planner handoff preserving the user's starting point. All nonremoved source records are browsable, including inactive records with their source status disclosed; browsing is distinct from recommendation eligibility.

## Sources and permitted refresh

Provider-separated snapshots live under data/ and retain IDs, coordinates, activity evidence, source URLs, license/attribution and retrieval timestamps. D1 also stores staleness/removal state, provider snapshots, ingestion runs and refresh-job health. Only a complete, exact-count snapshot can retire absent records. Failed/partial/truncated or unexpectedly small snapshots preserve prior records. /api/health exposes progress, errors and last success. /api/export?provider=openskidata offers the full ODbL-derived provider database via paginated next links.

OpenSkiData streams its GeoJSON with a centrally enforced once-per24-hour attempt guard. OpenBeta continues a weekly paginated snapshot across bounded tool calls. RIDB uses strict206HTTPRange, ETag and CRC checks to retrieve only RecAreas, Activities and EntityActivities (~17MB from a573MB archive). The first real hosted RIDB run completed and persisted1,955records.

Three native cloud schedules are saved, enabled and read back (America/New_York): SkiData daily04:00; OpenBeta Sunday04:30; RIDB Sunday05:00. They use the installed Good Outside MCP tools, which were exercised successfully. Initial imports and a hosted refresh were verified; the first scheduled occurrence has not yet happened. Cadence guards may return up_to_date rather than download again. Normal healthy runs remain quiet; failures require attention.

/mcp exposes read_location_health and owner-only refresh_location_source. /api/ingest and /api/jobs/refresh additionally accept the configured secret bearer for unattended service access. Credentials stay in Sites environment configuration, never client bundles, source or schedule prompts. Signed-in viewers can browse; only the configured owner/service writer can refresh.

FreeCampsites.net terms prohibit automated harvesting/redistribution without authorization. Regional/sample details therefore link to its native coordinate-centered search, with no invented campsite IDs, names or availability. Embedded individual listings remain unimplemented pending an authorized feed. Official source camping/permit links and explicit unknowns are retained.

Provider evidence and research: docs/data-sources.md and docs/API_RESEARCH.md. Potential expansion includes licensed OSM extracts/Geoapify or approved Outdooractive content; no paid services or restricted scrapers were purchased or used.

## Development and verification

Node>=22.13, locked npm dependencies. Use the Sites skill helpers for installation/build/publication. Generate schema-only migrations with npm run db:generate; apply pending migrations to local D1 using the generated dist/server/wrangler.json before preview. Hosted migrations apply through Sites deployment. npm start -- --port8767 previews the built Worker; local and hosted databases are separate.

Checks: node tests.mjs; node database-tests.mjs; node job-tests.mjs; node ingestion-tests.mjs; node directory-tests.mjs; npx tsc --noEmit. Build with the Sites build-site helper. Tests cover complete-trip weather, overnight hours, activity distinctions, missing data, relative dates, map language/grid geometry, bookmarks/recommendations, real SQLite upserts and staged snapshots, authorization, source parser/range/CRC failures, source cadence, browse search/pagination and exact-record handoff.

Live checks covered Denver, Boston, Seattle, London and Sydney weather/routes, Tokyo no-data then source-based skiing discovery, actual44,692-record D1 ingestion, the hosted RIDB refresher, and native Good Outside read/refresh tools. Browser QA covered planner controls, nine-point weather detail, map-label language over Japan, bookmarks,390px phone layout, the all-location directory, Biking search and exact location handoff. Physical-device geolocation permission was not exercised. Free third-party weather/routing services remain best-effort and suitable service arrangements are needed for commercial scale.
