import { describe, expect, it } from "vitest";
import { demoProfile, isRelevantNote, parseScheduleNote } from "../src/index.js";

// Real Bee transcripts: the name is misheard and "p.m." arrives as "p. m.".
const profile = { ...demoProfile, name: "Ayaan", nameAliases: ["Ayan", "Ian"], tzOffsetMin: -300 };
const ts = Date.UTC(2026, 9, 22, 15, 0); // 10:00 AM in the child's time zone
const hourOf = (expectedAt: number) => new Date(expectedAt - 300 * 60000).getUTCHours() * 60 + new Date(expectedAt - 300 * 60000).getUTCMinutes();

describe("spoken notes as Bee really transcribes them", () => {
  it("reads a pick-up with words between 'pick him up' and the time", () => {
    const p = parseScheduleNote("Ayan has CTE class today, so I'll pick him up from the school at 5 p. m.", { profile, ts });
    expect(p).toBeDefined();
    expect(hourOf(p!.expectedAt)).toBe(17 * 60);
  });

  it("reads 'p. m.' and 'pm' the same way, with or without minutes", () => {
    const a = parseScheduleNote("Ayan has class, I will pick him up at 5:30 p. m.", { profile, ts });
    const b = parseScheduleNote("Ayan has class, I will pick him up at 5:30 pm", { profile, ts });
    expect(hourOf(a!.expectedAt)).toBe(17 * 60 + 30);
    expect(hourOf(b!.expectedAt)).toBe(17 * 60 + 30);
  });

  it("still works for the short forms", () => {
    expect(hourOf(parseScheduleNote("Ayaan has practice, pick him up at 6", { profile, ts })!.expectedAt)).toBe(18 * 60);
  });

  it("knows the misheard names are about the child, and ignores other talk", () => {
    expect(isRelevantNote("Ian is at home.", profile)).toBe(true);
    expect(isRelevantNote("Let's order pizza tonight.", profile)).toBe(false);
  });
});
