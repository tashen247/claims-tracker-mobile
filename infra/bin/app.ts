import { App } from 'aws-cdk-lib';
import { ClaimsStack } from '../lib/claims-stack';

const app = new App();
const stage = (app.node.tryGetContext('stage') as string | undefined) ?? 'dev';

new ClaimsStack(app, `ClaimsTracker-${stage}`, {
  stage,
  certificateArn: app.node.tryGetContext('certificateArn') as string | undefined,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    // Cape Town region keeps customer data in South Africa (POPIA).
    region: process.env.CDK_DEFAULT_REGION ?? 'af-south-1',
  },
  tags: { project: 'claims-tracker', stage },
});
