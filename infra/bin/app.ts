import { App, Tags } from "aws-cdk-lib";
import { RakshaSutraStack } from "../lib/rakshasutra-stack.js";

const app = new App();
// No account is hard-coded: CDK uses whatever credentials the person deploys with.
new RakshaSutraStack(app, "RakshaSutraStack", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? "us-east-1" },
});
Tags.of(app).add("project", "rakshasutra");
