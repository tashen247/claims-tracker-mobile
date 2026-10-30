import { Redis } from 'ioredis';
import { buildApp } from './app';
import { loadConfig } from './config';
import { createDatabase } from './db/client';
import { ExpoNotifier, NoopNotifier } from './services/notifier';
import { S3PhotoStorage } from './services/storage';

async function main(): Promise<void> {
  const config = loadConfig();
  const database = createDatabase(config.DATABASE_URL, { ssl: config.DATABASE_SSL });
  const redis = config.REDIS_URL
    ? new Redis(config.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: false })
    : undefined;

  const app = await buildApp({
    config,
    db: database.db,
    storage: new S3PhotoStorage(config),
    notifier: new NoopNotifier(),
    redis,
  });
  // Swap in the real notifier once the logger exists.
  if (config.PUSH_ENABLED) {
    app.deps.notifier = new ExpoNotifier(app.log, config.EXPO_ACCESS_TOKEN);
  }

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await database.close();
    redis?.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.HOST, port: config.PORT });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
