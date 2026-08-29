#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { XTrend4KomaStack } from "../lib/x-trend-4koma-stack";

const notifyTopicArn = process.env.NOTIFY_TOPIC_ARN;
if (!notifyTopicArn) {
  throw new Error(
    "NOTIFY_TOPIC_ARN environment variable is required (SNS topic ARN to publish " +
      "finished-comic notifications to). Example: " +
      "NOTIFY_TOPIC_ARN=arn:aws:sns:REGION:ACCOUNT_ID:TOPIC_NAME npx cdk deploy"
  );
}

const app = new cdk.App();
new XTrend4KomaStack(app, "XTrend4KomaStack", {
  notifyTopicArn,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || "ap-northeast-1",
  },
});
