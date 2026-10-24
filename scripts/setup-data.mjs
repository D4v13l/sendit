// Credentials arrive only on stdin, consumed by the existing publisher after download.
await import('./download-data.mjs');
const {readCredentials,publish}=await import('../apps/good-outside/backend/ingestion/publish.mjs');
const credentials=await readCredentials();
for(const provider of ['curated','openskidata','openbeta','ridb'])await publish(provider,credentials);
