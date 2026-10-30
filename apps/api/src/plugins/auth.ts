import fastifyJwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import fp from 'fastify-plugin';
import type { Role } from '@claims/shared';
import { forbidden, unauthorized } from '../lib/errors';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AccessTokenPayload;
    user: AccessTokenPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: preHandlerHookHandler;
    requireRole: (...roles: Role[]) => preHandlerHookHandler;
  }
}

export interface AuthPluginOptions {
  secret: string;
  accessTokenTtlSeconds: number;
}

export default fp<AuthPluginOptions>(
  async (app, opts) => {
    await app.register(fastifyJwt, {
      secret: opts.secret,
      sign: {
        expiresIn: opts.accessTokenTtlSeconds,
        iss: 'claims-tracker-api',
        aud: 'claims-tracker-app',
      },
      verify: { allowedIss: 'claims-tracker-api', allowedAud: 'claims-tracker-app' },
    });

    async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
      try {
        await request.jwtVerify();
      } catch {
        throw unauthorized('Invalid or expired access token');
      }
    }

    app.decorate('authenticate', authenticate);
    app.decorate('requireRole', (...roles: Role[]) => {
      return async (request: FastifyRequest, reply: FastifyReply) => {
        await authenticate(request, reply);
        if (!roles.includes(request.user.role)) {
          throw forbidden(`Requires role: ${roles.join(' or ')}`);
        }
      };
    });
  },
  { name: 'auth' },
);
