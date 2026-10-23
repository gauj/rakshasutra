/**
 * Offline checks of the synthesised CloudFormation. Nothing is deployed and no AWS call is made.
 */
import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { RakshaSutraStack } from "../lib/rakshasutra-stack.js";

const build = (context: Record<string, string> = {}) =>
  Template.fromStack(new RakshaSutraStack(new App({ context }), "T", { env: { account: "111111111111", region: "us-east-1" } }));

const actionsOf = (s: any): string[] => ([] as string[]).concat(s.Action);

describe("RakshaSutraStack", () => {
  const t = build();

  it("has a retained, encrypted, on-demand alert table with point-in-time recovery", () => {
    t.hasResourceProperties("AWS::DynamoDB::Table", {
      KeySchema: [
        { AttributeName: "childId", KeyType: "HASH" },
        { AttributeName: "raisedAt", KeyType: "RANGE" },
      ],
      AttributeDefinitions: Match.arrayWith([
        { AttributeName: "childId", AttributeType: "S" },
        { AttributeName: "raisedAt", AttributeType: "N" },
      ]),
      BillingMode: "PAY_PER_REQUEST",
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    });
    t.hasResource("AWS::DynamoDB::Table", { DeletionPolicy: "Retain", UpdateReplacePolicy: "Retain" });
  });

  it("has an encrypted topic and no subscription by default", () => {
    t.hasResourceProperties("AWS::SNS::Topic", { KmsMasterKeyId: Match.anyValue() });
    t.resourceCountIs("AWS::SNS::Subscription", 0);
  });

  it("subscribes only the contact supplied through context", () => {
    const withPhone = build({ parentPhone: "+14155550123" });
    withPhone.hasResourceProperties("AWS::SNS::Subscription", { Protocol: "sms", Endpoint: "+14155550123" });
    withPhone.resourceCountIs("AWS::SNS::Subscription", 1);
    const withEmail = build({ parentEmail: "parent@example.com" });
    withEmail.hasResourceProperties("AWS::SNS::Subscription", { Protocol: "email", Endpoint: "parent@example.com" });
  });

  it("refuses an emergency number as the subscriber", () => {
    expect(() => build({ parentPhone: "911" })).toThrow(/emergency/i);
  });

  it("has a Node 20 narrator Lambda with the model id and table in its environment", () => {
    t.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs20.x",
      Handler: "index.handler",
      Environment: { Variables: { BEDROCK_MODEL_ID: "amazon.nova-lite-v1:0", TABLE_NAME: Match.anyValue() } },
    });
  });

  it("exposes POST /narrate on an HTTP API with IAM auth", () => {
    t.hasResourceProperties("AWS::ApiGatewayV2::Api", { ProtocolType: "HTTP" });
    t.hasResourceProperties("AWS::ApiGatewayV2::Route", { RouteKey: "POST /narrate", AuthorizationType: "AWS_IAM" });
    t.resourceCountIs("AWS::ApiGatewayV2::Route", 1);
  });

  it("grants least privilege: no wildcard actions, Bedrock limited to the one model, DynamoDB read-only", () => {
    const policies = Object.values(t.findResources("AWS::IAM::Policy")) as any[];
    const statements = policies.flatMap((p) => p.Properties.PolicyDocument.Statement);
    for (const s of statements) for (const a of actionsOf(s)) expect(a).not.toMatch(/\*/);

    const bedrock = statements.filter((s) => actionsOf(s).some((a) => a.startsWith("bedrock:")));
    expect(bedrock).toHaveLength(1);
    expect(bedrock[0].Action).toBe("bedrock:InvokeModel");
    const arn = JSON.stringify(bedrock[0].Resource);
    expect(arn).toContain("foundation-model/amazon.nova-lite-v1:0");
    expect(arn).not.toMatch(/"\*"/);

    const dynamo = statements.filter((s) => actionsOf(s).some((a) => a.startsWith("dynamodb:")));
    expect(dynamo.length).toBeGreaterThan(0);
    for (const s of dynamo) for (const a of actionsOf(s)) expect(a).toMatch(/Get|Query|Scan|Describe|List|ConditionCheckItem/);
  });

  it("scopes an inference profile model to its profile plus the underlying model", () => {
    const p = build({ bedrockModelId: "us.anthropic.claude-3-5-haiku-20241022-v1:0" });
    const doc = JSON.stringify(p.findResources("AWS::IAM::Policy"));
    expect(doc).toContain("inference-profile/us.anthropic.claude-3-5-haiku-20241022-v1:0");
    expect(doc).toContain("foundation-model/anthropic.claude-3-5-haiku-20241022-v1:0");
  });

  it("outputs the API URL, table name and topic ARN", () => {
    for (const k of ["ApiUrl", "TableName", "TopicArn"]) expect(t.toJSON().Outputs).toHaveProperty(k);
  });
});
