import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { LogController, type FastifyInstance, type FastifyServerOptions } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import authPlugin from './plugins/auth';
import { registerErrorHandling } from './plugins/errors';
import { authRoutes, meRoutes } from './routes/auth';
import { claimRoutes } from './routes/claims';
import { healthRoutes } from './routes/health';
import { policyRoutes } from './routes/policies';
import type { AppDeps } from './types';

export const CORRELATION_HEADER = 'x-correlation-id';

export function loggerOptions(deps: Pick<AppDeps, 'config'>): FastifyServerOptions['logger'] {
  const { config } = deps;
  return {
    level: config.NODE_ENV === 'test' ? 'silent' : config.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'body.password',
        'body.refreshToken',
      ],
      censor: '[redacted]',
    },
    ...(config.NODE_ENV === 'development'
      ? {
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
          },
        }
      : {}),
  };
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;

  const app = Fastify({
    logger: loggerOptions(deps),
    trustProxy: true,
    // Reuse the caller's correlation ID when present so logs can be joined across services.
    requestIdHeader: CORRELATION_HEADER,
    genReqId: () => randomUUID(),
    logController: new LogController({ requestIdLogLabel: 'correlationId' }),
    routerOptions: { ignoreTrailingSlash: true },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('deps', deps);

  app.addHook('onSend', async (request, reply) => {
    void reply.header(CORRELATION_HEADER, request.id);
  });

  registerErrorHandling(app);

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin:
      config.CORS_ORIGINS === '*' ? true : config.CORS_ORIGINS.split(',').map((o) => o.trim()),
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type', 'idempotency-key', CORRELATION_HEADER],
    exposedHeaders: [CORRELATION_HEADER, 'idempotent-replayed'],
  });
  await app.register(rateLimit, {
    global: false,
    ...(deps.redis ? { redis: deps.redis, nameSpace: 'claims-rl:' } : {}),
  });

  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Claims Tracker API',
        description: 'Submit and track insurance claims. All money values are integer cents (ZAR).',
        version: config.APP_VERSION,
      },
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      },
      tags: [
        { name: 'auth' },
        { name: 'me' },
        { name: 'policies' },
        { name: 'claims' },
        { name: 'health' },
      ],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  await app.register(authPlugin, {
    secret: config.JWT_SECRET,
    accessTokenTtlSeconds: config.ACCESS_TOKEN_TTL_SECONDS,
  });

  await app.register(healthRoutes);
  await app.register(
    async (v1) => {
      await v1.register(authRoutes, { prefix: '/auth' });
      await v1.register(meRoutes, { prefix: '/me' });
      await v1.register(policyRoutes, { prefix: '/policies' });
      await v1.register(claimRoutes, { prefix: '/claims' });
    },
    { prefix: '/v1' },
  );

  return app;
}
