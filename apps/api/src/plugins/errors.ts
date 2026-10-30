import type { FastifyError, FastifyInstance } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors';

export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    void reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
        correlationId: request.id,
      },
    });
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const correlationId = request.id;

    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.validation.map((v) => ({
            path: v.instancePath || error.validationContext,
            message: v.message,
          })),
          correlationId,
        },
      });
    }

    if (error instanceof AppError) {
      if (error.statusCode >= 500) request.log.error({ err: error }, error.message);
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details, correlationId },
      });
    }

    if (error.statusCode === 429) {
      return reply.status(429).send({
        error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down', correlationId },
      });
    }

    if (isResponseSerializationError(error)) {
      request.log.error(
        { err: error, issues: error.cause.issues },
        'response serialization failed',
      );
    } else if (!error.statusCode || error.statusCode >= 500) {
      request.log.error({ err: error }, 'unhandled error');
    }

    const statusCode = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    return reply.status(statusCode).send({
      error: {
        code: statusCode === 500 ? 'INTERNAL_ERROR' : (error.code ?? 'ERROR'),
        message: statusCode === 500 ? 'Something went wrong' : error.message,
        correlationId,
      },
    });
  });
}
