import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { ClaimsStack } from '../lib/claims-stack';

function synth(stage: string) {
  const app = new App();
  const stack = new ClaimsStack(app, `Test-${stage}`, {
    stage,
    env: { account: '123456789012', region: 'af-south-1' },
  });
  return Template.fromStack(stack);
}

describe('ClaimsStack', () => {
  const template = synth('dev');

  it('creates an encrypted private Postgres 16 database', () => {
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      Engine: 'postgres',
      EngineVersion: Match.stringLikeRegexp('^16'),
      StorageEncrypted: true,
      PubliclyAccessible: false,
    });
  });

  it('blocks public access to the photo bucket and enforces TLS', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      CorsConfiguration: { CorsRules: [Match.objectLike({ AllowedMethods: ['PUT', 'GET'] })] },
    });
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
        ]),
      },
    });
  });

  it('runs the API on Fargate behind a load balancer with health checks', () => {
    template.resourceCountIs('AWS::ECS::Service', 1);
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      HealthCheckPath: '/health',
    });
    const taskDefinitions = template.findResources('AWS::ECS::TaskDefinition');
    const container = Object.values(taskDefinitions)[0]!.Properties.ContainerDefinitions[0];
    const envNames = container.Environment.map((e: { Name: string }) => e.Name);
    expect(envNames).toEqual(
      expect.arrayContaining(['S3_BUCKET', 'DB_HOST', 'REDIS_URL', 'DATABASE_SSL']),
    );
    const secretNames = container.Secrets.map((s: { Name: string }) => s.Name);
    expect(secretNames).toEqual(expect.arrayContaining(['DB_PASSWORD', 'JWT_SECRET']));
  });

  it('provisions encrypted Redis', () => {
    template.hasResourceProperties('AWS::ElastiCache::ReplicationGroup', {
      Engine: 'redis',
      TransitEncryptionEnabled: true,
      AtRestEncryptionEnabled: true,
    });
  });

  it('hardens production', () => {
    const prod = synth('prod');
    prod.hasResourceProperties('AWS::RDS::DBInstance', { MultiAZ: true, DeletionProtection: true });
    prod.hasResource('AWS::S3::Bucket', { DeletionPolicy: 'Retain' });
  });
});
