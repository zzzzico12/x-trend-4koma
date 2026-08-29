import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as path from "path";

const MAX_ITERATIONS = 3;
const CLAUDE_MODEL = "claude-sonnet-5";
const OPENAI_MODEL = "gpt-5.1";
const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";
// stability.sd3-5-large-v1:0 is only available in us-west-2 as of writing —
// see lambda/common/bedrock-image-client.ts, which calls it cross-region.
const BEDROCK_IMAGE_REGION = "us-west-2";
const BEDROCK_IMAGE_MODEL = "stability.sd3-5-large-v1:0";

export interface XTrend4KomaStackProps extends cdk.StackProps {
  /**
   * SNS topic ARN to publish finished-comic notifications to (link + X-postable
   * caption). Must already exist with a confirmed email subscription — this
   * stack does not create the topic or subscription. Deployer-specific, so it
   * is passed in via the NOTIFY_TOPIC_ARN env var rather than hardcoded.
   */
  notifyTopicArn: string;
}

export class XTrend4KomaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: XTrend4KomaStackProps) {
    super(scope, id, props);
    const NOTIFY_TOPIC_ARN = props.notifyTopicArn;

    // ---- Storage & secrets ----------------------------------------------
    const imageBucket = new s3.Bucket(this, "ImageBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      lifecycleRules: [{ expiration: cdk.Duration.days(30) }],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const anthropicSecret = new secretsmanager.Secret(this, "AnthropicApiKeySecret", {
      secretName: "x-trend-4koma/anthropic-api-key",
      description: "Anthropic API key used for trend research, comic planning, and image review",
      secretStringValue: cdk.SecretValue.unsafePlainText("REPLACE_ME"),
    });

    const geminiSecret = new secretsmanager.Secret(this, "GeminiApiKeySecret", {
      secretName: "x-trend-4koma/gemini-api-key",
      description: "Google Gemini API key used for comic image generation",
      secretStringValue: cdk.SecretValue.unsafePlainText("REPLACE_ME"),
    });

    const openAiSecret = new secretsmanager.Secret(this, "OpenAiApiKeySecret", {
      secretName: "x-trend-4koma/openai-api-key",
      description:
        "OpenAI API key — alternative to Anthropic for trend research, comic planning, and image review (selected per-execution via the llmProvider input)",
      secretStringValue: cdk.SecretValue.unsafePlainText("REPLACE_ME"),
    });

    // ---- Lambda functions --------------------------------------------------
    const commonBundling: lambdaNode.BundlingOptions = {
      minify: true,
      sourceMap: false,
      target: "node22",
    };

    const makeFunction = (
      id: string,
      entryDir: string,
      opts: { timeoutSeconds: number; memoryMB: number }
    ) =>
      new lambdaNode.NodejsFunction(this, id, {
        entry: path.join(__dirname, "..", "lambda", entryDir, "index.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_22_X,
        timeout: cdk.Duration.seconds(opts.timeoutSeconds),
        memorySize: opts.memoryMB,
        bundling: commonBundling,
        environment: {
          ANTHROPIC_SECRET_ARN: anthropicSecret.secretArn,
          GEMINI_SECRET_ARN: geminiSecret.secretArn,
          OPENAI_SECRET_ARN: openAiSecret.secretArn,
          IMAGE_BUCKET_NAME: imageBucket.bucketName,
          CLAUDE_MODEL,
          GEMINI_IMAGE_MODEL,
          OPENAI_MODEL,
          NOTIFY_TOPIC_ARN,
        },
      });

    const researchTrendFn = makeFunction("ResearchTrendFn", "research-trend", {
      timeoutSeconds: 120,
      memoryMB: 512,
    });
    anthropicSecret.grantRead(researchTrendFn);
    openAiSecret.grantRead(researchTrendFn);

    const planComicFn = makeFunction("PlanComicFn", "plan-comic", {
      timeoutSeconds: 60,
      memoryMB: 512,
    });
    anthropicSecret.grantRead(planComicFn);
    openAiSecret.grantRead(planComicFn);

    const generateImageFn = makeFunction("GenerateImageFn", "generate-image", {
      timeoutSeconds: 120,
      memoryMB: 1024,
    });
    geminiSecret.grantRead(generateImageFn);
    openAiSecret.grantRead(generateImageFn);
    imageBucket.grantReadWrite(generateImageFn);
    generateImageFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          `arn:aws:bedrock:${BEDROCK_IMAGE_REGION}::foundation-model/${BEDROCK_IMAGE_MODEL}`,
        ],
      })
    );

    const reviewImageFn = makeFunction("ReviewImageFn", "review-image", {
      timeoutSeconds: 90,
      memoryMB: 1024,
    });
    anthropicSecret.grantRead(reviewImageFn);
    openAiSecret.grantRead(reviewImageFn);
    imageBucket.grantReadWrite(reviewImageFn);

    const finalizeRunFn = makeFunction("FinalizeRunFn", "finalize-run", {
      timeoutSeconds: 60,
      memoryMB: 512,
    });
    anthropicSecret.grantRead(finalizeRunFn);
    openAiSecret.grantRead(finalizeRunFn);
    imageBucket.grantReadWrite(finalizeRunFn);
    finalizeRunFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["sns:Publish"],
        resources: [NOTIFY_TOPIC_ARN],
      })
    );

    // ---- Step Functions state machine --------------------------------------
    const initRun = new sfn.Pass(this, "InitRun", {
      parameters: {
        "runId.$": "$$.Execution.Name",
        maxIterationIndex: MAX_ITERATIONS - 1,
        history: [],
        // Which provider to use for research/planning/review, and which for
        // image generation, this run. Required on every execution input —
        // e.g. {"llmProvider": "openai", "imageProvider": "gemini"}.
        "llmProvider.$": "$.llmProvider",
        "imageProvider.$": "$.imageProvider",
      },
    });

    // Trend research, comic planning, image generation, and review all call
    // external APIs (Anthropic / Gemini) and have been observed to fail
    // transiently (platform-level Lambda sandbox timeouts, truncated API
    // responses) — retry generously so a single daily run doesn't die on a
    // one-off network blip.
    const withApiRetry = (task: tasks.LambdaInvoke): sfn.TaskStateBase =>
      task.addRetry({
        errors: [sfn.Errors.ALL],
        interval: cdk.Duration.seconds(5),
        maxAttempts: 3,
        backoffRate: 2,
      });

    const researchTrendTask = withApiRetry(
      new tasks.LambdaInvoke(this, "ResearchTrend", {
        lambdaFunction: researchTrendFn,
        payloadResponseOnly: true,
      })
    );

    const planComicTask = withApiRetry(
      new tasks.LambdaInvoke(this, "PlanComic", {
        lambdaFunction: planComicFn,
        payloadResponseOnly: true,
      })
    );

    const generateImageTask = withApiRetry(
      new tasks.LambdaInvoke(this, "GenerateImage", {
        lambdaFunction: generateImageFn,
        payloadResponseOnly: true,
      })
    );

    const reviewImageTask = withApiRetry(
      new tasks.LambdaInvoke(this, "ReviewImage", {
        lambdaFunction: reviewImageFn,
        payloadResponseOnly: true,
      })
    );

    const finalizeRunTask = withApiRetry(
      new tasks.LambdaInvoke(this, "FinalizeRun", {
        lambdaFunction: finalizeRunFn,
        payloadResponseOnly: true,
      })
    );

    const prepareRetry = new sfn.Pass(this, "PrepareRetry", {
      parameters: {
        "runId.$": "$.runId",
        "maxIterationIndex.$": "$.maxIterationIndex",
        "llmProvider.$": "$.llmProvider",
        "imageProvider.$": "$.imageProvider",
        "trend.$": "$.trend",
        "comic.$": "$.comic",
        "history.$": "$.history",
        "iteration.$": "States.MathAdd($.iteration, 1)",
        "previousImageKey.$": "$.imageKey",
        "previousImageGenerationCallId.$": "$.imageGenerationCallId",
        "revisionInstructions.$": "$.review.revisionInstructions",
      },
    });
    prepareRetry.next(generateImageTask);

    const reviewChoice = new sfn.Choice(this, "ReviewPassedOrMaxedOut")
      .when(sfn.Condition.booleanEquals("$.review.pass", true), finalizeRunTask)
      .when(
        sfn.Condition.numberGreaterThanEqualsJsonPath("$.iteration", "$.maxIterationIndex"),
        finalizeRunTask
      )
      .otherwise(prepareRetry);

    const definition = initRun
      .next(researchTrendTask)
      .next(planComicTask)
      .next(generateImageTask)
      .next(reviewImageTask)
      .next(reviewChoice);

    const stateMachine = new sfn.StateMachine(this, "ComicPipeline", {
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      stateMachineType: sfn.StateMachineType.STANDARD,
      timeout: cdk.Duration.minutes(15),
    });

    // ---- Daily schedule -----------------------------------------------------
    const dailyRule = new events.Rule(this, "DailySchedule", {
      // 00:00 UTC = 09:00 JST
      schedule: events.Schedule.cron({ minute: "0", hour: "0" }),
      enabled: true,
    });
    dailyRule.addTarget(
      new targets.SfnStateMachine(stateMachine, {
        input: events.RuleTargetInput.fromObject({
          // Anthropic credit balance has been intermittently exhausted;
          // OpenAI is the working default until that's resolved.
          llmProvider: "openai",
          // OpenAI (gpt-image-2 via the image_generation tool) reliably
          // follows the single-vertical-column layout and renders Japanese
          // text correctly; Gemini repeatedly failed both even after prompt
          // tuning — see attempt-*-review.json in past runs for details.
          imageProvider: "openai",
        }),
      })
    );

    new cdk.CfnOutput(this, "StateMachineArn", { value: stateMachine.stateMachineArn });
    new cdk.CfnOutput(this, "ImageBucketName", { value: imageBucket.bucketName });
    new cdk.CfnOutput(this, "AnthropicSecretArn", { value: anthropicSecret.secretArn });
    new cdk.CfnOutput(this, "GeminiSecretArn", { value: geminiSecret.secretArn });
    new cdk.CfnOutput(this, "OpenAiSecretArn", { value: openAiSecret.secretArn });
  }
}
