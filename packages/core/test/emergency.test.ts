import { describe, expect, it } from "vitest";
import { isEmergencyNumber } from "../src/index.js";

// Emergency numbers are display-only: they must never be accepted as a contact or a destination, however they are typed.
describe("emergency numbers are always refused", () => {
  it.each(["911", "9-1-1", "+1 911", "1-911", "0911", "112", "+91 112", "999", "1098", "988", "1-800-843-5678"])("%s", (n) => {
    expect(isEmergencyNumber(n)).toBe(true);
  });

  it.each(["+1 555 0100", "555-0101", "+1 (214) 555-0199", "9111234567"])("%s is an ordinary number", (n) => {
    expect(isEmergencyNumber(n)).toBe(false);
  });
});
