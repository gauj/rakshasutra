/**
 * Offline proof of the AWS integrations. The AWS SDK clients are replaced with mocks, so no network,
 * credentials or AWS account are involved. These tests show the code calls the right API with the right
 * arguments; they do not prove a live call works.
 */
import type { ChildProfile, WellbeingReport } from "@rakshasutra/core";

const send = vi.fn();
const converseInputs: any[] = [];
const publishInputs: any[] = [];
const snsSend = vi.fn();

vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: class {
    constructor(public cfg: unknown) {}
    send = send;
  },
  ConverseCommand: class {
    constructor(public input: any) {
      converseInputs.push(input);
    }
  },
}));

vi.mock("@aws-sdk/client-sns", () => ({
  SNSClient: class {
    send = snsSend;
  },
  PublishCommand: class {
    constructor(public input: any) {
      publishInputs.push(input);
    }
  },
}));

import { narrateReport, answerQuestion } from "../src/narrator.js";
import { smsChannel } from "../src/channels.js";

const profile = { id: "c1", name: "Asha", age: 9 } as ChildProfile;
const report = { childId: "c1", childName: "Asha", narrative: "TEMPLATE TEXT", alerts: [], incidents: [] } as unknown as WellbeingReport;
const msg = { alertId: "a", incidentId: "i", childId: "c1", tier: "critical", kind: "new", subject: "s", short: "Open RakshaSutra now", long: "l", emergencyBrief: "e", at: 1 } as any;

beforeEach(() => {
  send.mockReset();
  snsSend.mockReset();
  converseInputs.length = 0;
  publishInputs.length = 0;
  delete process.env.BEDROCK_MODEL_ID;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("Bedrock narration", () => {
  it("calls Converse with the model id, system prompt and low temperature, and reports engine bedrock", async () => {
    process.env.BEDROCK_MODEL_ID = "test.model-v1";
    send.mockResolvedValue({ output: { message: { content: [{ text: " Calm summary. " }] } } });
    const r = await narrateReport(report, profile);
    expect(r).toEqual({ text: "Calm summary.", engine: "bedrock" });
    expect(converseInputs).toHaveLength(1);
    const input = converseInputs[0];
    expect(input.modelId).toBe("test.model-v1");
    expect(input.system[0].text).toContain("Use ONLY the JSON facts provided");
    expect(input.inferenceConfig.temperature).toBeLessThanOrEqual(0.3);
    expect(input.messages[0].content[0].text).toContain("Asha");
  });

  it("answers a question through Bedrock using the facts only", async () => {
    process.env.BEDROCK_MODEL_ID = "test.model-v1";
    send.mockResolvedValue({ output: { message: { content: [{ text: "She is at school." }] } } });
    const r = await answerQuestion("Where is she?", report, profile);
    expect(r.engine).toBe("bedrock");
    expect(converseInputs[0].messages[0].content[0].text).toContain("Answer from these facts only");
  });

  it("falls back to the template when BEDROCK_MODEL_ID is unset (no client call)", async () => {
    expect(await narrateReport(report, profile)).toEqual({ text: "TEMPLATE TEXT", engine: "template" });
    const q = await answerQuestion("Where?", report, profile);
    expect(q.engine).toBe("template");
    expect(q.text).toContain("TEMPLATE TEXT");
    expect(send).not.toHaveBeenCalled();
  });

  it("falls back to the template when the client throws", async () => {
    process.env.BEDROCK_MODEL_ID = "test.model-v1";
    send.mockRejectedValue(new Error("AccessDenied"));
    expect(await narrateReport(report, profile)).toEqual({ text: "TEMPLATE TEXT", engine: "template" });
    expect((await answerQuestion("Where?", report, profile)).engine).toBe("template");
  });

  it("falls back when Bedrock returns empty text", async () => {
    process.env.BEDROCK_MODEL_ID = "test.model-v1";
    send.mockResolvedValue({ output: { message: { content: [] } } });
    expect((await narrateReport(report, profile)).engine).toBe("template");
  });
});

describe("SNS text message channel", () => {
  it("publishes only to the configured parent number", async () => {
    snsSend.mockResolvedValue({});
    const r = await smsChannel("+14155550123").send(msg);
    expect(r.ok).toBe(true);
    expect(publishInputs).toEqual([{ PhoneNumber: "+14155550123", Message: "Open RakshaSutra now" }]);
  });

  it.each(["911", "(911)", "112", "100", "988", "1-800-843-5678"])("refuses emergency number %s and sends nothing", async (n) => {
    const r = await smsChannel(n).send(msg);
    expect(r.ok).toBe(false);
    expect(snsSend).not.toHaveBeenCalled();
    expect(publishInputs).toHaveLength(0);
  });

  it("reports failure instead of throwing when SNS errors", async () => {
    snsSend.mockRejectedValue(new Error("no credentials"));
    const r = await smsChannel("+14155550123").send(msg);
    expect(r.ok).toBe(false);
    expect(r.detail).toContain("no credentials");
  });
});
