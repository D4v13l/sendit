# Location catalog sources

Only public APIs and explicitly licensed bulk downloads are used. No restricted website scraping. This catalog identifies activity places; it does not verify current access, camping, snow safety, conditions, or campsite availability.

## OpenSkiData — worldwide ski areas

Official source/terms: https://www.openskidata.org/ . Bulk: https://tiles.openskimap.org/geojson/ski_areas.geojson . Metadata: https://tiles.openskimap.org/metadata.json .

The official download policy allows automated downloads at most once daily; direct vector tile use is prohibited. `refresh.mjs` blocks another bulk download within 24 hours of its saved snapshot. Reuse the saved source when testing. The initial October 23 build had 12,399 source features; 6,935 named areas survive coordinate/activity/stable-ID validation and source deduplication. Nameless or source-less features are deliberately omitted. The output covers worldwide locations, but is not a complete inventory.

**ODbL-1.0** derived data is kept in its own file/provider and must remain downloadable under that license. Preserve the attribution wherever shown: “Data from OpenSkiData / OpenSkiMap.org, © OpenStreetMap contributors (ODbL), Skimap.org, Who's On First, © Mapterhorn”. See https://opendatacommons.org/licenses/odbl/1-0/ . The catalog records are a filtered modified database.

Upstream feature `properties.id` is a content hash and changes between builds. Keys use Wikidata or a sorted upstream OSM/Skimap identifier. Merges/splits or upstream-source removal can still change a key; `upstreamSources` permits later reconciliation. Activity flags map only `downhill` to `downhill_skiing` and `nordic` to `cross_country_skiing`. Neither proves backcountry skiing. Polygon coordinates use the source viewport center for discovery and are labelled as such; this is not a trailhead or access point. Operating status is preserved but is not a live opening report.

## OpenBeta — climbing leaf areas

Official API: https://api.openbeta.io . Official API documentation: https://github.com/OpenBeta/openbeta-graphql . Data license statement: https://openbeta.io/about . Climbing content excludes photos and is Creative Commons Public Domain/CC0; API source code's AGPL license is distinct from the data license. No photos are imported.

Live GraphQL schema verified October 24 UTC: `areas(filter:Filter,sort:Sort,limit:Int,offset:Int)` returns `Area`; `filter:{leaf_status:{isLeaf:true}}` limits discovery to leaf areas. Requested fields: `uuid area_name pathTokens metadata{lat lng leaf} totalClimbs aggregate{byDiscipline{trad{total} sport{total} bouldering{total} ice{total} mixed{total} alpine{total}}}`. Stable identity is `uuid`. Only leaf areas with at least one climbing route, a name and valid nonzero coordinates are imported; broad countries/regions are not outdoor destinations. Country labels preserve the source path spelling. Discipline totals are evidence, not a guarantee of any route's suitability. General `climbing` is deliberately conservative.

The initial complete traversal ended on page86 with99rows:42,599raw leaf areas became35,753validated places in21source country labels. This reflects uneven community coverage, not worldwide climbing completeness. The JSON is22.54MB uncompressed and about3MB gzip.

Pagination is bounded (default max 120 pages ×500, sequential requests with delay; up to three retries/request). A short page ends a full traversal; hitting the cap records `complete:false`. Offset pagination is not a transaction and source edits during a run can cause drift. Deduplication handles repeated UUIDs; never treat a capped/error run as authoritative deletion evidence.

## Operation

Run `node backend/ingestion/refresh.mjs openbeta` or `node backend/ingestion/refresh.mjs openskidata`. Results are atomic JSON snapshots plus `.json.gz` downloads under `data/`, separate by license. `SKI_LOCAL_FILE` permits re-normalizing an already downloaded GeoJSON; it must not be used to bypass download policy. `MAX_PAGES` sets the OpenBeta safety bound.

Every record retains source ID, source URL, license, attribution, fetched timestamp, source verification timestamp, evidence and unknown access/camping. `lastVerifiedAt` means the source record was read, not a field visit or access verification. No safety/access facts are inferred.

`worker-adapter.mjs` imports only bounded OpenBeta pages (250 by default, max500) within a Worker; full ski normalization is a local ingestion job because parsed worldwide GeoJSON plus copies risks a 128MB Worker. `publishSnapshot` sends batches of250 to authenticated `/api/ingest` and never flags a partial batch as a complete source snapshot. For a complete source traversal, publishing uses staged begin/chunk/finalize requests with an expected unique count. Only an exact persisted count permits source retirement. Capped traversals remain additive. A failed transfer reports health and releases the staged run without retiring unseen locations. Failed refreshes retain prior successful data.

Scheduled coordination must persist the OpenBeta next offset/run state, and enforce the ski daily guard centrally for multiple runners; the local snapshot timestamp is only a single-runner guard. The main application's recurring job owns scheduler persistence. Provider removal must never be inferred from a partial page or failed request.

## RIDB — imported US recreation areas

Official bulk source: https://ridb.recreation.gov/downloads/RIDBFullExport_V1_JSON.zip . Access agreement: https://ridb.recreation.gov/access-agreement-ridb . The official ZIP was downloaded once on October24UTC (572,606,026bytes). Terms are recorded conservatively as **US federal RIDB catalog; source-specific terms**; neither CC0 nor ODbL is asserted. The access-agreement page was reachable but did not expose readable terms in the web text response; preserve source attribution and check the agreement before redistributing additional source materials. This import retains identifiers, names, factual coordinates and activity joins, not source descriptions or media.

The ZIP contains21members. The importer inspects directory metadata, then reads only `RecAreas_API_v1.json` (7.46MB), `Activities_API_v1.json` (14KB), and `EntityActivities_API_v1.json` (9.46MB). It does not extract campsite attributes, campsite inventories, facilities, or photos. Source entities must have `EntityType=Rec Area`, valid nonzero coordinates, a name, no explicit disabled flag, and a supported activity join. From3,651source recreation areas,1,955validated places were retained:1,867Hiking,808Biking,73Backpacking (activities overlap).

Supported explicit dictionary mappings:14 HIKING,100066 HIKING TRAIL,100076 TRAILS, DIFFICULT HIKING → Hiking;5 BIKING and100002 MOUNTAIN BIKING → Biking;100036 BACKPACKING → Backpacking. Hiking does not imply backpacking, and biking does not imply bikepacking. Each row retains evidence activity IDs/names, source enablement and source modification date. Coordinates are source recreation-area points and may represent broad areas or administrative points; they are not verified trailheads, routes or road access. Fallback source links use the recreation.gov gateway corresponding to RecAreaID when no RecAreaURL is supplied. No camping permission, campsite availability or current opening claims are made.

Run `python3 backend/ingestion/ridb-refresh.py` to normalize the cached ZIP. `--refresh` downloads a new ZIP only if the cache is at least7days old; the weekly cadence is a conservative operational choice. Download has two bounded retries and a ten-minute timeout, writes a temporary file and atomically replaces a completed cache. Output JSON/gzip is also separate by provider. Publisher and manual refresh runner support `ridb`. A Worker must not fetch/parse the entire573MBZIP. A64KBsuffix Range request was live-verified to return HTTP206, Accept-Ranges:bytes and Content-Range572540490-572606025/572606026. The three needed members currently use ZIP stored compression and total about17MB. A bounded central-directory/member Range reader can therefore support hosted refresh without downloading the entire archive; reject servers ignoring Range and guard ETag consistency across requests. `ridb-normalize.mjs` exports a pure Worker-safe `normalizeRidb(recAreas,activities,recAreaActivities,fetchedAt)` function accepting unwrapped RECDATA arrays. The local CLI installs no recurring scheduler.

## Existing curated discovery catalog

`data/curated.json` migrates49 existing hand-selected entries from `public/catalog.mjs`, preserving the original IDs and primary-source URLs. Its source-specific terms are explicitly recorded; this file does **not** claim CC0 licensing for linked source material. The import contains a factual index and existing short editorial notes, not scraped source descriptions. Migration time is not source-content verification time; no `lastVerifiedAt` is assigned without rereading a source. All camping remains unknown except explicit no-camping flags. Existing gateway/sample/noCamping/noCarCamping/noBackcountry metadata is retained in activity evidence. Selected approximate weather points are distinct from exact chosen road/gateway points.

## Initial/manual publishing

`node backend/ingestion/publish.mjs all` accepts JSON `{origin,token}` on standard input only. It publishes curated/OpenSkiData/OpenBeta/RIDB in1000-record chunks using staged begin/chunk/finalize, with bounded retries and provider health readback. Token is held only in memory and sent in both required authorization headers; never put credentials in CLI arguments, logs, committed files, or chat. A provider name restricts publishing to one snapshot. `refresh-runner.mjs` accepts the same stdin credentials and refreshes then publishes OpenSkiData/OpenBeta/RIDB for manual runs. The ski daily guard can intentionally stop a same-day refresh; use the publisher to transfer its existing snapshot. These CLIs do not install a scheduler.
