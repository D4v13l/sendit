/** Unofficial read-only website client. No API keys, login, or automatic retries. */
export const SITES = Object.freeze({
  hike: 'www.hikingproject.com',
  mtb: 'www.mtbproject.com',
  ski: 'www.powderproject.com',
  trailrun: 'www.trailrunproject.com',
  climb: 'www.mountainproject.com',
  nationalparks: 'www.hikingproject.com',
});

export class ApiError extends Error {
  constructor(message, {status, url, retryAfterMs} = {}) {
    super(message); this.name = 'ApiError';
    this.status = status; this.url = url; this.retryAfterMs = retryAfterMs;
  }
}
export class SchemaError extends Error {
  constructor(message) { super(message); this.name = 'SchemaError'; }
}
export class UnsupportedCapabilityError extends Error {
  constructor(message) { super(message); this.name = 'UnsupportedCapabilityError'; }
}

function integer(value, name, min, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError(`${name} must be an integer from ${min} to ${max}`);
  return value;
}
function id(value) {
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) value = Number(value);
  return integer(value, 'id', 1);
}
export function routeId(value) {
  if (typeof value === 'number' || /^[1-9]\d*$/.test(value)) return id(value);
  const match = typeof value === 'string' && /^(?:trails|routes)\.([1-9]\d*)$/.exec(value);
  if (match) return id(match[1]);
  try {
    const url = new URL(value);
    const path = /^\/(?:trail|route)\/([1-9]\d*)(?:\/|$)/.exec(url.pathname);
    if (url.protocol === 'https:' && Object.values(SITES).includes(url.hostname) && path) return id(path[1]);
  } catch { /* Give one consistent validation error below. */ }
  throw new TypeError('Expected a positive route ID, trails.ID, routes.ID, or a known Project route URL');
}
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function schema(condition, message) { if (!condition) throw new SchemaError(message); }
function coordinate(p) { return Array.isArray(p) && p.length >= 2 && p.every(Number.isFinite); }
function validateRoute(value, site) {
  if (site === 'climb') {
    schema(object(value) && Number.isSafeInteger(value.id) && typeof value.title === 'string', 'Invalid climbing route response');
  } else {
    schema(value?.type === 'Feature' && object(value.properties) && Number.isSafeInteger(value.properties.id) && typeof value.properties.title === 'string', 'Invalid trail feature response');
    const g = value.geometry;
    const line = points => Array.isArray(points) && points.length >= 2 && points.every(coordinate);
    schema(g && (g.type === 'LineString' ? line(g.coordinates) : g.type === 'MultiLineString' && Array.isArray(g.coordinates) && g.coordinates.length > 0 && g.coordinates.every(line)), 'Invalid route geometry');
  }
  return value;
}
function validateSearch(value) {
  schema(object(value) && object(value.total) && Number.isSafeInteger(value.total.value) && value.total.value >= 0 && ['eq','gte'].includes(value.total.relation) && Array.isArray(value.hits), 'Invalid search response');
  schema(value.hits.every(h => object(h) && object(h._source) && typeof h._source.id === 'string' && typeof h._source.title === 'string'), 'Invalid search hit');
  return value;
}
function checkOptions(options, allowed) {
  if (!object(options)) throw new TypeError('Options must be an object');
  for (const key of Object.keys(options)) if (!allowed.includes(key)) throw new TypeError(`Unsupported option: ${key}`);
}
function wait(ms, signal) {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const finish = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(finish, ms);
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason); };
    signal?.addEventListener('abort', abort, {once:true});
  });
}

export class AdventureClient {
  #fetch; #timeoutMs; #interval; #queue = Promise.resolve(); #lastStart = 0;
  constructor({site = 'hike', fetch: fetchImpl = globalThis.fetch, timeoutMs = 15000, minIntervalMs = 250} = {}) {
    if (!Object.hasOwn(SITES, site)) throw new TypeError(`Unknown site: ${site}`);
    if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required');
    this.site = site;
    this.origin = `https://${SITES[site]}`;
    this.#fetch = fetchImpl;
    this.#timeoutMs = integer(timeoutMs, 'timeoutMs', 1, 120000);
    this.#interval = integer(minIntervalMs, 'minIntervalMs', 0, 60000);
    this.capabilities = Object.freeze({
      search:true, routes:true, elevation: ['hike','mtb','nationalparks'].includes(site),
      areas: site === 'climb', photos: site === 'climb', conditions: site !== 'climb',
    });
  }
  #require(capability) {
    if (!this.capabilities[capability]) throw new UnsupportedCapabilityError(`${capability} is not verified for ${this.site}`);
  }
  async #request(path, {signal, body, html = false} = {}) {
    signal?.throwIfAborted();
    // Space request starts per instance; a rejected/aborted call does not poison the queue.
    const gate = this.#queue.then(async () => {
      signal?.throwIfAborted();
      const delay = this.#interval - (Date.now() - this.#lastStart);
      if (delay > 0) await wait(delay, signal);
      signal?.throwIfAborted();
      this.#lastStart = Date.now();
    });
    this.#queue = gate.catch(() => {});
    await gate;
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal?.addEventListener('abort', abort, {once:true});
    if (signal?.aborted) abort();
    const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), this.#timeoutMs);
    const url = this.origin + path;
    try {
      const response = await this.#fetch(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? {Accept: html ? 'text/html' : 'application/json'} : {'Content-Type':'application/json', Accept:'application/json'},
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials:'omit', redirect:'error', signal:controller.signal,
      });
      if (!response.ok) {
        const retry = response.headers.get('retry-after');
        let retryAfterMs;
        if (retry !== null) {
          const parsed = /^\d+(?:\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
          if (Number.isFinite(parsed)) retryAfterMs = Math.max(0, parsed);
        }
        // Do not expose error-page HTML (which may contain session information).
        await response.body?.cancel();
        throw new ApiError(`HTTP ${response.status} from ${new URL(url).pathname}`, {status:response.status,url,retryAfterMs});
      }
      if (html) return await response.text();
      schema((response.headers.get('content-type') || '').includes('application/json'), 'Expected JSON; received another content type');
      try { return await response.json(); }
      catch (error) {
        if (controller.signal.aborted) throw controller.signal.reason;
        throw new SchemaError(`Invalid JSON response: ${error.message}`);
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
  async search(query, options = {}) {
    checkOptions(options, ['limit','from','types','sort','signal']);
    if (typeof query !== 'string' || !query.trim() || query.length > 500) throw new TypeError('query must contain 1–500 characters');
    const {limit = 25, from = 0, types = ['Route'], sort = [], signal} = options;
    integer(limit, 'limit', 1, 100); integer(from, 'from', 0);
    if (!Array.isArray(types) || !types.length || !types.every(t=>['Route','Area','Gem','Photo'].includes(t))) throw new TypeError('types must contain Route, Area, Gem, or Photo');
    if (!Array.isArray(sort) || !sort.every(s=>object(s) && ['rating','length.value','difficulty.value'].includes(s.field) && ['asc','desc'].includes(s.order))) throw new TypeError('Invalid search sort');
    const params = new URLSearchParams({q:query.trim(),limit:String(limit),from:String(from)});
    const raw = validateSearch(await this.#request(`/api/v2/search?${params}`, {signal,body:{types,filter:[],sort}}));
    const next = from + raw.hits.length;
    return {items:raw.hits.map(h=>h._source),total:raw.total.value,totalRelation:raw.total.relation,
      nextFrom:raw.hits.length && (raw.total.relation === 'gte' || next < raw.total.value) ? next : null,raw};
  }
  async *searchPages(query, options = {}) {
    const {maxPages = 1, ...searchOptions} = options;
    integer(maxPages, 'maxPages', 1, 100);
    let from = searchOptions.from ?? 0;
    for (let page = 0; page < maxPages; page++) {
      const result = await this.search(query, {...searchOptions,from});
      yield result;
      if (result.nextFrom === null) return;
      from = result.nextFrom;
    }
  }
  async getRoute(value, {signal} = {}) {
    return validateRoute(await this.#request(`/api/v2/routes/${id(value)}`, {signal}), this.site);
  }
  async getElevationProfile(value, {signal} = {}) {
    this.#require('elevation');
    const project = this.site === 'mtb' ? 'mtb' : 'hike';
    const rows = await this.#request(`/api/v2/trails/${id(value)}/elevation-profile?project=${project}`, {signal});
    schema(Array.isArray(rows) && rows.every(r=>Array.isArray(r) && r.length === 6 && r.every(Number.isFinite)), 'Invalid elevation tuples');
    return rows;
  }
  async getArea(value, {signal} = {}) {
    this.#require('areas');
    const area = await this.#request(`/api/v2/areas/${id(value)}`, {signal});
    schema(object(area) && Number.isSafeInteger(area.id) && typeof area.title === 'string' && Array.isArray(area.children), 'Invalid climbing area');
    return area;
  }
  async getPhotos(kind, value, {signal} = {}) {
    this.#require('photos');
    if (!['route','area'].includes(kind)) throw new TypeError('kind must be route or area');
    const photos = await this.#request(`/api/v2/${kind}s/${id(value)}/photos`, {signal});
    schema(Array.isArray(photos) && photos.every(p=>object(p) && Number.isSafeInteger(p.id) && typeof p.url === 'string'), 'Invalid photo list');
    return photos;
  }
  async getConditionsHtml(value, {signal} = {}) {
    this.#require('conditions');
    return this.#request(`/ajax/public/trail/conditions/${id(value)}`, {signal,html:true});
  }
  async getAreaPopupHtml(value, {signal} = {}) {
    this.#require('areas');
    return this.#request(`/ajax/climb-area/${id(value)}`, {signal,html:true});
  }
}
