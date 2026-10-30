import type { Redis } from 'ioredis';
import type { Config } from './config';
import type { Database } from './db/client';
import type { Notifier } from './services/notifier';
import type { PhotoStorage } from './services/storage';

export interface AppDeps {
  config: Config;
  db: Database;
  storage: PhotoStorage;
  notifier: Notifier;
  redis?: Redis;
}

declare module 'fastify' {
  interface FastifyInstance {
    deps: AppDeps;
  }
}
