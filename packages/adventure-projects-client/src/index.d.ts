export type Site = 'hike' | 'mtb' | 'ski' | 'trailrun' | 'climb' | 'nationalparks';
export const SITES: Readonly<Record<Site, string>>;
export type Position = [number, number, ...number[]];
export interface RequestOptions { signal?: AbortSignal }
export interface ClientOptions<S extends Site = Site> {
  site?: S;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  minIntervalMs?: number;
}
export interface Sort { field: 'rating' | 'length.value' | 'difficulty.value'; order: 'asc' | 'desc' }
export interface SearchOptions extends RequestOptions {
  limit?: number;
  from?: number;
  types?: Array<'Route' | 'Area' | 'Gem' | 'Photo'>;
  sort?: Sort[];
}
export interface SearchItem {
  id: string;
  type: string;
  title: string;
  url?: string;
  description?: string;
  summary?: string;
  breadcrumbs?: string;
  thumbnail?: string;
  rating?: number;
  difficulty?: { string: string; value: number };
  length?: { value: number; unit: string };
  location?: Position;
  bounds?: { type: 'envelope'; coordinates: [Position, Position] };
  created?: number;
  updated?: number;
  [key: string]: unknown;
}
export interface RawSearch {
  total: {value: number; relation: 'eq' | 'gte'};
  hits: Array<{_id?: string; _index?: string; _score?: number; _source: SearchItem}>;
  [key: string]: unknown;
}
export interface SearchPage {
  items: SearchItem[];
  total: number;
  totalRelation: 'eq' | 'gte';
  nextFrom: number | null;
  raw: RawSearch;
}
export interface TrailFeature {
  type: 'Feature';
  geometry: {type: 'LineString'; coordinates: Position[]} | {type: 'MultiLineString'; coordinates: Position[][]};
  properties: {
    id: number; title: string; type?: string; diff?: string;
    length?: number; ascent?: number; descent?: number; stars?: number;
    lineType?: string; cityState?: string; surface?: string; start?: Position; end?: Position;
    drawRide?: number; drawTrail?: number;
    allowsDogs?: boolean; isFamilyFriendly?: boolean; thumbnail?: string;
    [key: string]: unknown;
  };
}
export interface HtmlSection { title: string; html: string }
export interface ClimbRoute {
  id: number; title: string; area_id?: number;
  parent?: {id?: number; name?: string; coordinates?: Position};
  url?: string; difficulty?: string; pitches?: number; height_feet?: number;
  types?: string[]; summary?: string; sections?: HtmlSection[];
  access_notes?: HtmlSection[]; rating?: number; thumbnail?: string;
  first_ascent?: string; submitted_by?: string;
  [key: string]: unknown;
}
export interface ClimbArea {
  id: number; title: string; coordinates?: Position; radius?: number;
  parent?: {id: number; name: string}; breadcrumbs?: string; is_leaf?: boolean;
  sections?: HtmlSection[]; access_notes?: HtmlSection[];
  children: Array<{id: number; type: string; title: string; difficulty?: string; [key: string]: unknown}>;
  [key: string]: unknown;
}
export interface Photo { id: number; url: string; title?: string; thumbnail?: string; rating?: number; submitted_by?: string; [key: string]: unknown }
/** Undocumented upstream tuple. Intentionally not labeled as SI units. */
export type ElevationSample = [number, number, number, number, number, number];
export class ApiError extends Error { status?: number; url?: string; retryAfterMs?: number; constructor(message: string, options?: {status?: number; url?: string; retryAfterMs?: number}) }
export class SchemaError extends Error {}
export class UnsupportedCapabilityError extends Error {}
export function routeId(value: string | number): number;
export class AdventureClient<S extends Site = 'hike'> {
  constructor(options?: ClientOptions<S>);
  readonly site: S;
  readonly origin: string;
  readonly capabilities: Readonly<{search: boolean; routes: boolean; elevation: boolean; areas: boolean; photos: boolean; conditions: boolean}>;
  search(query: string, options?: SearchOptions): Promise<SearchPage>;
  searchPages(query: string, options?: SearchOptions & {maxPages?: number}): AsyncGenerator<SearchPage>;
  getRoute(id: number | string, options?: RequestOptions): Promise<S extends 'climb' ? ClimbRoute : TrailFeature>;
  getElevationProfile(id: number | string, options?: RequestOptions): Promise<ElevationSample[]>;
  getArea(id: number | string, options?: RequestOptions): Promise<ClimbArea>;
  getPhotos(kind: 'route' | 'area', id: number | string, options?: RequestOptions): Promise<Photo[]>;
  getConditionsHtml(id: number | string, options?: RequestOptions): Promise<string>;
  getAreaPopupHtml(id: number | string, options?: RequestOptions): Promise<string>;
}
