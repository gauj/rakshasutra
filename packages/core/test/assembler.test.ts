import { describe, expect, it } from "vitest";
import { DEMO_CHILD_ID, demoPlaces, demoProfile, GuardianEngine, isQuestionAboutChild, isRelevantNote, NoteAssembler, normalizeSpeech } from "../src/index.js";

// Fragments exactly as a real Bee delivered them (arrival order, not speaking order).
const arrivals = [
  { id: 3760405973, text: "Practice ends at 5.", spokenAt: Date.parse("2026-10-16T02:24:52.000Z") },
  { id: 3760405974, text: "I will pick him up at 5.", spokenAt: Date.parse("2026-10-16T02:24:54.000Z") },
  { id: 3760405993, text: "Hey, Atom has robotics practice today.", spokenAt: Date.parse("2026-10-16T02:24:49.000Z") },
  { id: 3760406001, text: "30.from his school.", spokenAt: Date.parse("2026-10-16T02:24:55.000Z") },
];

describe("NoteAssembler", () => {
  it("orders by spoken time, not arrival time", () => {
    const a = new NoteAssembler();
    arrivals.forEach((p) => a.add(p));
    expect(a.text().startsWith("Hey, Atom has robotics practice today.")).toBe(true);
    expect(a.text().endsWith("30.from his school.")).toBe(true);
  });

  it("ignores a repeated utterance", () => {
    const a = new NoteAssembler();
    a.add(arrivals[0]!);
    a.add(arrivals[0]!);
    expect(a.size()).toBe(1);
  });

  it("drops pieces older than the window", () => {
    const a = new NoteAssembler(10_000);
    a.add({ id: 1, text: "old", spokenAt: 1000 });
    a.add({ id: 2, text: "new", spokenAt: 60_000 });
    expect(a.text()).toBe("new");
  });
});

describe("speech repair", () => {
  it("rejoins a time that speech-to-text split in two", () => {
    expect(normalizeSpeech("pick him up at 5. 30.from his school.")).toContain("at 5:30");
    expect(normalizeSpeech("I will pick him up at 5. 30 minutes later")).not.toContain("5:30");
  });

  it("turns the real Bee fragments into a 5:30 PM plan, even though the name was heard as 'Arab'", () => {
    const a = new NoteAssembler();
    arrivals.forEach((p) => a.add(p));
    const e = new GuardianEngine(demoPlaces);
    e.register(demoProfile);
    const spoken = arrivals[0]!.spokenAt;
    const plan = e.proposeFromNote(DEMO_CHILD_ID, a.text(), spoken, "bee");
    expect(plan?.expectedAt).toBe(Date.UTC(2026, 9, 15, 17 + 5, 30)); // 5:30 PM local (UTC-5)
    expect(plan?.confidence).toBeGreaterThan(0.8); // the alias counts as mentioning the child
  });

  it("handles a spelled-out hour that speech-to-text also split ('five.' then '30')", () => {
    const e = new GuardianEngine(demoPlaces);
    e.register(demoProfile);
    const plan = e.proposeFromNote(DEMO_CHILD_ID, "Practice ends at five. I will pick him up at five. 30.from his school.", arrivals[0]!.spokenAt, "bee");
    expect(plan?.expectedAt).toBe(Date.UTC(2026, 9, 15, 17 + 5, 30));
  });

  it("would have been wrong on the first two fragments alone (why we wait for a pause)", () => {
    const e = new GuardianEngine(demoPlaces);
    e.register(demoProfile);
    const early = e.proposeFromNote(DEMO_CHILD_ID, "Practice ends at 5. I will pick him up at 5.", arrivals[0]!.spokenAt, "bee");
    expect(early?.expectedAt).toBe(Date.UTC(2026, 9, 15, 17 + 5, 0));
  });
});

describe("what the app may show from a Bee that hears everything", () => {
  it("treats talk about the child or a pick-up as relevant, and ordinary chatter as not", () => {
    expect(isRelevantNote("I'll pick him up at 5:30", demoProfile)).toBe(true);
    expect(isRelevantNote("Hey Atom has robotics practice today", demoProfile)).toBe(true);
    expect(isRelevantNote("Remember to buy milk and call the plumber", demoProfile)).toBe(false);
    expect(isRelevantNote("The meeting with the client moved to Thursday", demoProfile)).toBe(false);
  });

  it("recognises questions about the child", () => {
    expect(isQuestionAboutChild("Where is Adam?", demoProfile)).toBe(true);
    expect(isQuestionAboutChild("Is Adam okay", demoProfile)).toBe(true);
    expect(isQuestionAboutChild("Where's he now", demoProfile)).toBe(true);
    expect(isQuestionAboutChild("Adam has practice today", demoProfile)).toBe(false);
    expect(isQuestionAboutChild("What time is the meeting?", demoProfile)).toBe(false);
  });
});
