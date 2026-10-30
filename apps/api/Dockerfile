# Build context: repository root (docker build -f apps/api/Dockerfile .)
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @claims/api...
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @claims/api build \
 && pnpm --filter @claims/api deploy --prod --legacy /out \
 && cp -r apps/api/dist apps/api/drizzle /out/

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["sh", "-c", "node dist/migrate.js && node dist/server.js"]
