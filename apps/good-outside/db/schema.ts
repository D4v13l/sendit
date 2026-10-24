import { sql } from 'drizzle-orm';
import { sqliteTable, text, real, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const locations = sqliteTable('locations', {
  id: text('id').primaryKey(), provider: text('provider').notNull(), sourceId: text('source_id').notNull(),
  canonicalId: text('canonical_id').notNull(), name: text('name').notNull(), lat: real('lat').notNull(), lon: real('lon').notNull(),
  geometry: text('geometry'), activities: text('activities').notNull(), activityEvidence: text('activity_evidence').notNull(),
  sourceUrl: text('source_url').notNull(), license: text('license').notNull(), attribution: text('attribution').notNull(),
  country: text('country'), road: text('road'), camp: text('camp').notNull().default('unknown'), campNote: text('camp_note'),
  access: text('access').notNull().default('unknown'), upstreamSources: text('upstream_sources'),
  fetchedAt: text('fetched_at').notNull(), lastVerifiedAt: text('last_verified_at').notNull(),
  staleAt: text('stale_at').notNull(), removedAt: text('removed_at'), runId: text('run_id').notNull(),
}, t => [uniqueIndex('locations_provider_source').on(t.provider,t.sourceId), index('locations_coordinates').on(t.lat,t.lon), index('locations_canonical').on(t.canonicalId)]);

export const providerRuns = sqliteTable('provider_runs', {
  id: text('id').primaryKey(), provider: text('provider').notNull(), startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'), status: text('status').notNull(), receivedCount: integer('received_count').notNull().default(0),
  writtenCount: integer('written_count').notNull().default(0), error: text('error'), lastSuccessAt: text('last_success_at'),
}, t => [index('provider_runs_provider').on(t.provider,t.startedAt)]);

// One provider lock prevents concurrent snapshots from retiring one another's rows.
export const providerSnapshots = sqliteTable('provider_snapshots', {
  id: text('id').primaryKey(), provider: text('provider').notNull(), expectedCount: integer('expected_count').notNull(),
  status: text('status').notNull(), startedAt: text('started_at').notNull(), finishedAt: text('finished_at'), error: text('error'),
}, t => [uniqueIndex('provider_snapshots_active').on(t.provider).where(sql`status = 'running'`)]);

export const refreshJobs = sqliteTable('refresh_jobs', {
  provider: text('provider').primaryKey(), status: text('status').notNull(), snapshotId: text('snapshot_id'),
  lastAttemptAt: text('last_attempt_at'), lastSuccessAt: text('last_success_at'), cursor: integer('cursor').notNull().default(0),
  receivedCount: integer('received_count').notNull().default(0), writtenCount: integer('written_count').notNull().default(0),
  error: text('error'), updatedAt: text('updated_at').notNull(), leaseUntil: text('lease_until'),
});
