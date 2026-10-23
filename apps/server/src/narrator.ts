/**
 * Turns a report into prose. Uses Amazon Bedrock only when BEDROCK_MODEL_ID is set; otherwise (or on any error)
 * the built-in template text is used and nothing leaves this computer.
 */
import type { ChildProfile, WellbeingReport } from "@rakshasutra/core";

/** The wording plus which engine wrote it, so the app can say so. */
export interface Narration {
  text: string;
  engine: "bedrock" | "template";
}

// Instructions for the language model: stick to the supplied facts and lead with whether the parent must act.
const SYSTEM = [
  "You are RakshaSutra, a calm assistant that briefs a parent about their child's safety.",
  "Use ONLY the JSON facts provided. Never invent places, times, people or causes.",
  "If data coverage is low or a fact is missing, say so plainly.",
  "Write plain sentences, no markdown, no more than 140 words.",
  "Lead with whether the parent needs to act. If an alert is critical, say so first and list the exact next steps (call the child, call emergency services, share location).",
].join(" ");

// One low-temperature Bedrock call. Returns undefined when unconfigured or on error, so callers fall back to the template.
async function converse(prompt: string): Promise<string | undefined> {
  const modelId = process.env.BEDROCK_MODEL_ID;
  if (!modelId) return undefined;
  try {
    const { BedrockRuntimeClient, ConverseCommand } = await import("@aws-sdk/client-bedrock-runtime");
    const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "us-east-1" });
    const out = await client.send(
      new ConverseCommand({
        modelId,
        system: [{ text: SYSTEM }],
        messages: [{ role: "user", content: [{ text: prompt }] }],
        inferenceConfig: { maxTokens: 400, temperature: 0.2 },
      }),
    );
    return out.output?.message?.content?.map((c) => ("text" in c ? c.text : "")).join("").trim() || undefined;
  } catch (e) {
    console.warn("[bedrock] falling back to template:", (e as Error).message);
    return undefined;
  }
}

/** Summarise a report for the parent. */
export async function narrateReport(report: WellbeingReport, profile: ChildProfile): Promise<Narration> {
  const facts = JSON.stringify({ child: profile.name, age: profile.age, ...report, narrative: undefined });
  const text = await converse(`Summarise this period for the parent.\nFACTS: ${facts}`);
  return text ? { text, engine: "bedrock" } : { text: report.narrative, engine: "template" };
}

/** Answer a parent's free-form question from the report's facts only. Without Bedrock it returns the template summary and says so. */
export async function answerQuestion(question: string, report: WellbeingReport, profile: ChildProfile): Promise<Narration> {
  const facts = JSON.stringify({ child: profile.name, ...report, narrative: undefined });
  const text = await converse(`Parent asks: "${question}"\nAnswer from these facts only.\nFACTS: ${facts}`);
  return text
    ? { text, engine: "bedrock" }
    : {
        text: `Free-form questions need Amazon Bedrock (set BEDROCK_MODEL_ID). Here is the latest summary instead: ${report.narrative}`,
        engine: "template",
      };
}
