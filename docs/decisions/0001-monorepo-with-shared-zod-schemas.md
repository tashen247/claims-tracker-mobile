# 0001. pnpm monorepo with shared Zod schemas

- Status: accepted
- Date: 2026-10-30

## Context

The API and the mobile app validate the same payloads: registration, claims, status changes.
Writing the rules twice drifts quickly; a form that accepts what the API rejects is a support ticket.

## Decision

One pnpm workspace with `apps/api`, `apps/mobile`, `packages/shared` and `infra`.
`@claims/shared` exports Zod schemas, inferred TypeScript types, the claim status machine and ZAR
helpers. The API uses the schemas for request validation and for the OpenAPI document; the app's
React Hook Form resolver uses the same schemas (the claim form `.pick()`s the API fields and only adds
UI concerns such as the rand text field and the local photo list).

The shared package ships TypeScript source. Metro, Vitest and `tsx` compile it directly, and the API's
production bundle (`tsup`) inlines it, so there is no build step to forget.

## Consequences

- A rule change (e.g. maximum amount, allowed transitions) is made once and covered by one test suite.
- The app can only offer status transitions the API will accept.
- `node-linker=hoisted` is used so Metro and Expo native modules resolve predictably in the workspace.
