// One live Amazon Bedrock call, to prove the narrator really works on your AWS account.
// It builds a small report from the demo child's story (fictional data, nothing about a real child), asks Bedrock to
// summarise it, and prints which engine wrote the text ("bedrock" or "template") and how long it took.
//
// Usage (in your own terminal, after your AWS credentials are set up; never paste keys anywhere else):
//   BEDROCK_MODEL_ID=amazon.nova-lite-v1:0 AWS_REGION=us-east-1 node --import tsx scripts/bedrock-check.mjs
// On Windows PowerShell:
//   $env:BEDROCK_MODEL_ID="amazon.nova-lite-v1:0"; $env:AWS_REGION="us-east-1"; node --import tsx scripts/bedrock-check.mjs
// It makes two small requests (a summary and a question), which cost a fraction of a cent.

import { buildReport, buildScenario, demoProfile, GuardianEngine, DEFAULT_THRESHOLDS, demoPlaces } from "../packages/core/src/index.ts";
import { answerQuestion, narrateReport } from "../apps/server/src/narrator.ts";

if (!process.env.BEDROCK_MODEL_ID) {
  console.log("BEDROCK_MODEL_ID is not set, so this will use the built-in template (no AWS call). Set it to try Bedrock for real.\n");
}

// Play the demo "delay" story through the engine to get realistic pings and an alert.
const sc = buildScenario("delay");
const engine = new GuardianEngine(demoPlaces, DEFAULT_THRESHOLDS);
engine.register(demoProfile);
for (const ev of sc.events) {
  if (ev.ping) engine.ingestPing(ev.ping);
  if (ev.tick) engine.tick(demoProfile.id, ev.t);
}
const now = sc.endTs;
engine.tick(demoProfile.id, now);
const report = buildReport(demoProfile, engine.pingsOf(demoProfile.id), engine.alerts, sc.startTs, now);

let t = Date.now();
const summary = await narrateReport(report, demoProfile);
console.log(`Summary  [engine: ${summary.engine}, ${Date.now() - t} ms]\n${summary.text}\n`);

t = Date.now();
const answer = await answerQuestion("Is there anything I need to do right now?", report, demoProfile);
console.log(`Question [engine: ${answer.engine}, ${Date.now() - t} ms]\n${answer.text}\n`);

if (summary.engine === "bedrock" && answer.engine === "bedrock") console.log("PASS: Amazon Bedrock wrote both answers.");
else console.log("Not Bedrock: the template was used. If you set BEDROCK_MODEL_ID, read the '[bedrock] falling back' warning above for the reason.");
