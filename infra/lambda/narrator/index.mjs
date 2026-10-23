// Narrator Lambda. POST /narrate with JSON { template, facts?, question?, childId? }.
// Same rules as apps/server/src/narrator.ts: use only the supplied facts, lead with whether the parent must act.
// On ANY failure it returns the supplied template text, so a parent always gets an answer.
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";

const SYSTEM = [
  "You are RakshaSutra, a calm assistant that briefs a parent about their child's safety.",
  "Use ONLY the JSON facts provided. Never invent places, times, people or causes.",
  "If data coverage is low or a fact is missing, say so plainly.",
  "Write plain sentences, no markdown, no more than 140 words.",
  "Lead with whether the parent needs to act. If an alert is critical, say so first and list the exact next steps (call the child, call emergency services, share location).",
].join(" ");

const bedrock = new BedrockRuntimeClient({});
const ddb = new DynamoDBClient({});

const reply = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

// Optional: when no facts are sent, use the child's last 10 stored alerts (read-only).
async function recentAlerts(childId) {
  const out = await ddb.send(
    new QueryCommand({
      TableName: process.env.TABLE_NAME,
      KeyConditionExpression: "childId = :c",
      ExpressionAttributeValues: { ":c": { S: String(childId) } },
      ScanIndexForward: false,
      Limit: 10,
    }),
  );
  return (out.Items ?? []).map((i) => Object.fromEntries(Object.entries(i).map(([k, v]) => [k, v.S ?? v.N ?? null])));
}

export const handler = async (event) => {
  let input;
  try {
    input = JSON.parse(event?.body ?? "{}");
  } catch {
    return reply(400, { error: "Body must be JSON" });
  }
  const template = typeof input.template === "string" ? input.template : "";
  if (!template) return reply(400, { error: "template is required (the text returned if Bedrock is unavailable)" });

  try {
    let facts = input.facts;
    if (!facts && input.childId) facts = { recentAlerts: await recentAlerts(input.childId) };
    const prompt = input.question
      ? `Parent asks: "${String(input.question).slice(0, 500)}"\nAnswer from these facts only.\nFACTS: ${JSON.stringify(facts ?? {})}`
      : `Summarise this period for the parent.\nFACTS: ${JSON.stringify(facts ?? {})}`;
    const out = await bedrock.send(
      new ConverseCommand({
        modelId: process.env.BEDROCK_MODEL_ID,
        system: [{ text: SYSTEM }],
        messages: [{ role: "user", content: [{ text: prompt }] }],
        inferenceConfig: { maxTokens: 400, temperature: 0.2 },
      }),
    );
    const text = out.output?.message?.content?.map((c) => c.text ?? "").join("").trim();
    if (text) return reply(200, { text, engine: "bedrock" });
  } catch (e) {
    console.warn("falling back to template:", e?.name, e?.message);
  }
  return reply(200, { text: template, engine: "template" });
};
