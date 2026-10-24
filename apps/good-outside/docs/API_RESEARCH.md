# Activity destination API research

Checked October 23, 2026. No single verified provider covers all six activities, overnight legality, reservations, driving and avalanche safety. Destination data belongs in our spatial database; current forecasts, routing and avalanche bulletins remain separate.

## Selected for this implementation

OpenBeta: https://github.com/OpenBeta/openbeta-graphql and https://github.com/OpenBeta/openbeta-graphql/blob/develop/src/graphql/schema/Area.gql . Production anonymous GraphQL at https://api.openbeta.io was successfully paginated in the ingestion environment. The schema also has cragsNear and cragsWithin. Stable UUIDs, coordinate-bearing leaf areas, hierarchy and discipline evidence are useful for grouping real crags into source-named larger areas. Data is CC0 excluding photos; API code is separately AGPL. No dependable public SLA/quota was found. Initial import is 35,753 validated places from42,599 leaf rows. A separate anonymous researcher request got403, so access varies; bounded retries and retained prior data are necessary.

OpenSkiData: https://www.openskidata.org/ . Daily global ski-area/runs/lifts downloads, including GeoJSON and CSV. Automated download at most once/day; do not directly use its vector tiles. ODbL-derived records must keep the stated combined attribution (OpenSkiData/OpenSkiMap, OpenStreetMap, Skimap, Who’s On First, Mapterhorn) and offer the modified database to users. Initial ski-area import is6,935 valid named source-ID-bearing places from12,399features/82countrylabels. Downhill/nordic evidence does not imply backcountry skiing, usable snow, operations or avalanche safety.

## Next sources

OSM extracts: https://www.geofabrik.de/data/download.html and https://www.openstreetmap.org/copyright . Global parks, natural areas, hiking/cycling route relations, access tags and campsites; coverage is uneven. ODbL permits commercial caching/reuse with attribution and applicable share-alike obligations. Import permitted extracts or use a licensed hosted service. Public Overpass guidance https://dev.overpass-api.de/overpass-doc/en/preface/commons.html discourages using its public servers as a consumer-app backend. Our tested GET406 and POSTtimeouts at particular endpoints are observations, not proof all OSM services fail.

Geoapify Places: https://apidocs.geoapify.com/docs/places/ and https://www.geoapify.com/places-api/ . Documented circle/bounding-box/category discovery with an API key; caching/storage/redistribution allowed with attribution under provider terms. Current pricing https://www.geoapify.com/pricing/ advertises3,000credits/day free and5req/sec; Places consumes one credit per20returned places. Recheck before purchase. Generic natural/camping POIs do not prove a hiking route, outdoor crag, legal overnight trip or live campsite inventory.

RIDB: https://ridb.recreation.gov/ and current OpenAPI https://ridb.recreation.gov/shared/swagger/ridb.yaml . US federal recreation areas, facilities, activity joins and campgrounds; registered key in apikey header. Current radius cap25miles means a single large-radius driving search is unsuitable: import catalog data and query our own index. The spec states50req/sec on recareas/facilities, subject to agreement changes. Official full export https://ridb.recreation.gov/downloads/RIDBFullExport_V1_JSON.zip is572,606,026bytes. The implementation now selectively reads only three members with HTTP ranges (~17MB), validates ETag/CRC, and imports1,955US recreation areas with explicit activity joins: Hiking1,867/Biking808/Backpacking73. The bulk export requires no API key; the live API does. This avoids loading the full archive into the128MB Worker. Agreement https://ridb.recreation.gov/access-agreement-ridb . Ordinary catalog access is not the separately gated Availability API.

NPS: https://www.nps.gov/subjects/developer/guides.htm . Authoritative parks, activities, campgrounds, things-to-do and alerts, registered private key, default1,000requests/hour. Index coordinates locally; no current radius parameter verified. NPS-created text generally public-domain, but third-party media/trademarks have exceptions: https://www.nps.gov/aboutus/disclaimer.htm . Not all public lands; no reservation availability inference.

## Partner/commercial options

Outdooractive Data API v2: https://developers.outdooractive.com/API-Reference/Data-API.html and https://developers.outdooractive.com/Overview/Guidelines.html . Strongest richer hiking/cycling/mountaineering/ski-tour candidate. Requires licensed API/project keys and negotiated content entitlement; attribution/view tracking/daily synchronization obligations. Exact geo-query, caching, quotas and price need confirmation for current v2 rather than copied legacy v1 examples.

Trailforks: https://www.trailforks.com/about/api/ and https://www.trailforks.com/about/data/ . Relevant cycling regions/routes/reports, but approval and app credentials required; access not guaranteed and usually not granted for personal projects. Region/endpoint restrictions possible. Exact API geo-search, commercial server caching, pricing and quotas need agreement. Website export limits are not an API SLA.

theCrag: https://www.thecrag.com/en/article/api/openapi.json . Negotiated specialist climbing access; signed agreement/key, noncommercial applications currently closed, server storage/caching needs explicit permission.

## Not assumed available

AllTrails has no verified general public developer API; https://www.alltrails.com/terms prohibits automated scraping/searches and requires consent for commercial reuse. Third-party scraper wrappers are not official access. Mountain Project legacy API deprecation: https://www.mountainproject.com/forum/topic/120168991/mountain-project-data-api-deprecated . No supported replacement was verified. Hiking Project current supported API was not verified; do not claim confirmed retirement without evidence. Wikiloc explicitly has no public API: https://help.wikiloc.com/article/102-api-for-developers . FreeCampsites terms prohibit automated data harvesting/redistribution without permission: https://freecampsites.net/terms-of-service/ ; use an outbound nearby search until authorized.

## Architecture

Use D1 indexed coordinates, stable provider IDs and source-named hierarchy groups, with all licenses/provenance retained. Keep provider datasets separate and dedupe display only. Store activity evidence rather than inferring all sports from every forest. Query origin-dependent candidates, route real mapped points and show unverified gateways honestly, then score weather at activity coordinates/elevation. Keep access, camping permission, permit/seasonal requirements, inventory and avalanche source distinct unknowns. Publish health/freshness and retire absent records only after a complete validated source snapshot. Start with open datasets; evaluate Geoapify or Outdooractive only after keys/licensing are available.
