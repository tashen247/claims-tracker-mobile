import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export interface ClaimsStackProps extends StackProps {
  stage: string;
  /** ACM certificate for HTTPS on the load balancer. Without it the API is served over HTTP. */
  certificateArn?: string;
}

export class ClaimsStack extends Stack {
  constructor(scope: Construct, id: string, props: ClaimsStackProps) {
    super(scope, id, props);
    const isProd = props.stage === 'prod';

    // --- Network -------------------------------------------------------------------------------
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'app', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 22 },
        { name: 'data', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    // --- Photo storage -------------------------------------------------------------------------
    const photos = new s3.Bucket(this, 'PhotoBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
      cors: [
        {
          // Phones upload directly with pre-signed PUT URLs.
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
      lifecycleRules: [
        { abortIncompleteMultipartUploadAfter: Duration.days(1) },
        {
          transitions: [
            { storageClass: s3.StorageClass.INFREQUENT_ACCESS, transitionAfter: Duration.days(90) },
          ],
        },
      ],
    });

    // --- Database ------------------------------------------------------------------------------
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSg', {
      vpc,
      allowAllOutbound: false,
    });
    const database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSecurityGroup],
      databaseName: 'claims',
      credentials: rds.Credentials.fromGeneratedSecret('claims'),
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      storageEncrypted: true,
      multiAz: isProd,
      backupRetention: Duration.days(isProd ? 14 : 1),
      deletionProtection: isProd,
      removalPolicy: isProd ? RemovalPolicy.SNAPSHOT : RemovalPolicy.DESTROY,
      cloudwatchLogsExports: ['postgresql'],
    });

    // --- Redis (rate limiting) -----------------------------------------------------------------
    const redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSg', {
      vpc,
      allowAllOutbound: false,
    });
    const redisSubnets = new elasticache.CfnSubnetGroup(this, 'RedisSubnets', {
      description: 'Claims Tracker Redis subnets',
      subnetIds: vpc.selectSubnets({ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }).subnetIds,
    });
    const redis = new elasticache.CfnReplicationGroup(this, 'Redis', {
      replicationGroupDescription: 'Claims Tracker rate limiting',
      engine: 'redis',
      engineVersion: '7.1',
      cacheNodeType: 'cache.t4g.micro',
      numCacheClusters: isProd ? 2 : 1,
      automaticFailoverEnabled: isProd,
      transitEncryptionEnabled: true,
      atRestEncryptionEnabled: true,
      cacheSubnetGroupName: redisSubnets.ref,
      securityGroupIds: [redisSecurityGroup.securityGroupId],
    });

    // --- Secrets -------------------------------------------------------------------------------
    const jwtSecret = new secretsmanager.Secret(this, 'JwtSecret', {
      generateSecretString: { passwordLength: 64, excludePunctuation: true },
    });
    const dbSecret = database.secret!;

    // --- API on ECS Fargate --------------------------------------------------------------------
    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    const certificate = props.certificateArn
      ? acm.Certificate.fromCertificateArn(this, 'Certificate', props.certificateArn)
      : undefined;

    const service = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'Api', {
      cluster,
      cpu: 512,
      memoryLimitMiB: 1024,
      desiredCount: isProd ? 2 : 1,
      publicLoadBalancer: true,
      certificate,
      protocol: certificate ? elbv2.ApplicationProtocol.HTTPS : elbv2.ApplicationProtocol.HTTP,
      redirectHTTP: Boolean(certificate),
      circuitBreaker: { rollback: true },
      minHealthyPercent: 100,
      taskSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
      taskImageOptions: {
        image: ecs.ContainerImage.fromAsset(repoRoot, { file: 'apps/api/Dockerfile' }),
        containerPort: 3000,
        logDriver: ecs.LogDrivers.awsLogs({
          streamPrefix: 'api',
          logRetention: isProd ? logs.RetentionDays.THREE_MONTHS : logs.RetentionDays.ONE_WEEK,
        }),
        environment: {
          NODE_ENV: 'production',
          PORT: '3000',
          LOG_LEVEL: 'info',
          AWS_REGION: this.region,
          S3_BUCKET: photos.bucketName,
          DATABASE_SSL: 'true',
          DB_HOST: database.dbInstanceEndpointAddress,
          DB_PORT: database.dbInstanceEndpointPort,
          DB_NAME: 'claims',
          REDIS_URL: `rediss://${redis.attrPrimaryEndPointAddress}:${redis.attrPrimaryEndPointPort}`,
        },
        secrets: {
          DB_USER: ecs.Secret.fromSecretsManager(dbSecret, 'username'),
          DB_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, 'password'),
          JWT_SECRET: ecs.Secret.fromSecretsManager(jwtSecret),
        },
      },
    });

    service.targetGroup.configureHealthCheck({
      path: '/health',
      healthyHttpCodes: '200',
      interval: Duration.seconds(15),
    });

    const scaling = service.service.autoScaleTaskCount({
      minCapacity: isProd ? 2 : 1,
      maxCapacity: 6,
    });
    scaling.scaleOnCpuUtilization('Cpu', { targetUtilizationPercent: 60 });

    photos.grantReadWrite(service.taskDefinition.taskRole);
    dbSecurityGroup.addIngressRule(
      service.service.connections.securityGroups[0]!,
      ec2.Port.tcp(5432),
      'API to Postgres',
    );
    redisSecurityGroup.addIngressRule(
      service.service.connections.securityGroups[0]!,
      ec2.Port.tcp(6379),
      'API to Redis',
    );

    new CfnOutput(this, 'ApiUrl', {
      value: `${certificate ? 'https' : 'http'}://${service.loadBalancer.loadBalancerDnsName}`,
    });
    new CfnOutput(this, 'PhotoBucketName', { value: photos.bucketName });
    new CfnOutput(this, 'DatabaseSecretArn', { value: dbSecret.secretArn });
  }
}
