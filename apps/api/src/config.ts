import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().url().default('postgres://claims:claims@localhost:5432/claims'),
  DATABASE_SSL: booleanString,
  REDIS_URL: z.string().url().optional(),
  JWT_SECRET: z.string().min(32).default('local-development-secret-change-me-please-0123456789'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(11),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  AUTH_RATE_LIMIT_WINDOW: z.string().default('1 minute'),
  CORS_ORIGINS: z.string().default('*'),
  AWS_REGION: z.string().default('af-south-1'),
  S3_BUCKET: z.string().default('claims-photos-local'),
  /** Set for LocalStack/MinIO. Leave empty on AWS. */
  S3_ENDPOINT: z.string().url().optional(),
  /** Host the device uses to reach S3 (e.g. your LAN IP for LocalStack). Defaults to S3_ENDPOINT. */
  S3_PUBLIC_ENDPOINT: z.string().url().optional(),
  S3_FORCE_PATH_STYLE: booleanString,
  UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  PUSH_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  APP_VERSION: z.string().default('1.0.0'),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.JWT_SECRET.startsWith('local-')) {
    throw new Error('JWT_SECRET must be set in production');
  }
  return parsed.data;
}
