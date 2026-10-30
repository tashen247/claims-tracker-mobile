# Infrastructure (AWS CDK)

One stack per stage (`dev`, `prod`) in `af-south-1` (Cape Town):

| Resource            | Notes                                                                                                                                           |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| VPC                 | 2 AZs; public, private-with-egress (API) and isolated (data) subnets; 1 NAT gateway                                                             |
| ECS Fargate         | API container from `apps/api/Dockerfile`, ARM64, behind an Application Load Balancer, CPU autoscaling, deployment circuit breaker with rollback |
| RDS PostgreSQL 16   | Isolated subnets, encrypted, generated credentials in Secrets Manager; Multi-AZ and deletion protection in `prod`                               |
| S3                  | Private, encrypted, TLS-only photo bucket with CORS for pre-signed PUT uploads                                                                  |
| ElastiCache Redis 7 | Encrypted in transit and at rest; backs the auth rate limiter across API tasks                                                                  |
| Secrets Manager     | DB credentials and JWT signing secret, injected as ECS secrets                                                                                  |

```bash
pnpm --filter @claims/infra test        # assertion tests on the synthesized template
pnpm synth                              # cdk synth (runs in CI)
pnpm --filter @claims/infra deploy -c stage=dev                        # needs AWS credentials + Docker
pnpm --filter @claims/infra deploy -c stage=prod -c certificateArn=arn:aws:acm:...
```

Migrations run when each API task starts (`node dist/migrate.js && node dist/server.js`). Drizzle's
migrator takes a Postgres advisory lock, so concurrent tasks do not race.
