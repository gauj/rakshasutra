import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kms from "aws-cdk-lib/aws-kms";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import { HttpIamAuthorizer } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import type { Construct } from "constructs";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Same list as packages/core (isEmergencyNumber). Emergency numbers are display-only and are never a destination. */
const EMERGENCY = new Set(["911", "112", "999", "100", "101", "102", "108", "1098", "988", "18008435678"]);
function isEmergency(raw: string): boolean {
  const digits = raw.replace(/[^\d]/g, "").replace(/^1(?=\d{10}$)/, "");
  return EMERGENCY.has(digits) || EMERGENCY.has("1" + digits);
}

/**
 * Cloud side of RakshaSutra: alert history, a parent-only alert topic, and a narration API.
 * Context values (cdk.json or `-c key=value`):
 *   parentPhone    optional, E.164 number of the PARENT, subscribed to the topic by SMS
 *   parentEmail    optional, the PARENT's email, subscribed to the topic
 *   bedrockModelId optional, defaults to Amazon Nova Lite
 */
export class RakshaSutraStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const modelId = String(this.node.tryGetContext("bedrockModelId") ?? "amazon.nova-lite-v1:0");
    const parentPhone = this.node.tryGetContext("parentPhone") as string | undefined;
    const parentEmail = this.node.tryGetContext("parentEmail") as string | undefined;

    // Alert history. One partition per child, sorted by when the alert was raised.
    // RETAIN so deleting the stack never destroys a family's history.
    const table = new dynamodb.Table(this, "AlertHistory", {
      partitionKey: { name: "childId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "raisedAt", type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Parent alerts. Encrypted with the AWS managed SNS key (no key to pay for or manage).
    const topic = new sns.Topic(this, "ParentAlerts", {
      displayName: "RakshaSutra parent alerts",
      masterKey: kms.Alias.fromAliasName(this, "SnsManagedKey", "alias/aws/sns"),
    });
    // Subscriptions exist only when the person supplies their own contact. Nothing is hard-coded.
    if (parentPhone) {
      if (isEmergency(parentPhone)) throw new Error("parentPhone is an emergency number. Alerts go to the parent only.");
      topic.addSubscription(new subs.SmsSubscription(parentPhone));
    }
    if (parentEmail) topic.addSubscription(new subs.EmailSubscription(parentEmail));

    // Narrator Lambda. Plain .mjs file, no bundling: the Node 20 runtime already includes the AWS SDK v3.
    const fn = new lambda.Function(this, "Narrator", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(path.join(here, "..", "lambda", "narrator")),
      timeout: Duration.seconds(20),
      memorySize: 256,
      environment: { BEDROCK_MODEL_ID: modelId, TABLE_NAME: table.tableName },
      logGroup: new logs.LogGroup(this, "NarratorLogs", { retention: logs.RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.DESTROY }),
    });
    // Least privilege: invoke this one model, and read (not write) the one table.
    // A cross-region inference profile id (like "us.anthropic...") needs the profile ARN plus the underlying model in any region.
    const profile = /^(us|eu|apac|us-gov)\.(.+)$/.exec(modelId);
    const modelArns = profile
      ? [
          this.formatArn({ service: "bedrock", resource: "inference-profile", resourceName: modelId }),
          `arn:${this.partition}:bedrock:*::foundation-model/${profile[2]}`,
        ]
      : [`arn:${this.partition}:bedrock:${this.region}::foundation-model/${modelId}`];
    fn.addToRolePolicy(new iam.PolicyStatement({ actions: ["bedrock:InvokeModel"], resources: modelArns }));
    table.grantReadData(fn);

    // HTTP API. AWS_IAM auth: callers must sign requests (SigV4) with credentials allowed to execute-api:Invoke.
    // Simplest secure option in aws-cdk-lib alone; no keys to leak, nothing public.
    const api = new apigw.HttpApi(this, "Api", {
      apiName: "rakshasutra-narrate",
      defaultAuthorizer: new HttpIamAuthorizer(),
      createDefaultStage: false,
    });
    api.addStage("DefaultStage", {
      stageName: "$default",
      autoDeploy: true,
      throttle: { rateLimit: 5, burstLimit: 10 }, // keeps cost and abuse bounded
    });
    api.addRoutes({
      path: "/narrate",
      methods: [apigw.HttpMethod.POST],
      integration: new HttpLambdaIntegration("NarrateIntegration", fn),
    });

    new CfnOutput(this, "ApiUrl", { value: api.apiEndpoint, description: "Sign requests with SigV4 (AWS_IAM)" });
    new CfnOutput(this, "TableName", { value: table.tableName });
    new CfnOutput(this, "TopicArn", { value: topic.topicArn });
  }
}
