# 0004. Pre-signed S3 uploads for claim photos

- Status: accepted
- Date: 2026-10-30

## Context

Each claim carries up to five photos of several megabytes. Streaming them through the API ties up
Fargate tasks and memory, and slows down every other request.

## Decision

The app asks the API for an upload URL (`POST /v1/claims/:id/photos/upload-url`), then PUTs the file
straight to S3.

- The API checks ownership, that the claim is still open and the five-photo limit, inside a
  transaction that locks the claim row so concurrent requests cannot exceed the limit.
- Keys are generated server-side (`claims/<claimId>/<uuid>.<ext>`) and the content type is fixed in
  the signature, so the client cannot choose where or what it writes.
- Upload URLs live 10 minutes; download URLs returned on the claim detail live 15 minutes.
- The bucket is private, encrypted and TLS-only, with CORS for PUT/GET.
- Locally, LocalStack provides S3. `S3_PUBLIC_ENDPOINT` lets URLs be signed for the host a phone can
  reach (your LAN IP) while the API talks to LocalStack directly.

## Consequences

- The API never handles photo bytes and stays fast.
- A photo row exists once a URL is issued, even if the upload never happens (see ADR 0003).
  Server-side verification (S3 event or HEAD check) would close that gap.
