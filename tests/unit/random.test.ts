import { describe, expect, it } from "vitest";
import { randomBelow, selectWeighted } from "../../src/domain/random";

describe("bounded authoritative selection", () => {
  it("rejects modulo-biased values before choosing a ticket", () => {
    const values = [0xffff_ffff, 7];
    expect(randomBelow(10, () => values.shift() as number)).toBe(7);
    expect(values).toEqual([]);
  });
  it("maps integer ticket boundaries to correct weighted segments", () => {
    const entries = [
      { value: "a", weight: 1 },
      { value: "b", weight: 2 },
    ];
    expect(selectWeighted(entries, () => 0)).toBe("a");
    expect(selectWeighted(entries, () => 1)).toBe("b");
    expect(selectWeighted(entries, () => 2)).toBe("b");
  });
  it("returns no result for an empty pool", () => {
    expect(selectWeighted([])).toBeNull();
  });
  it("rejects invalid weights and bounds instead of biasing selection", () => {
    for (const bound of [0, -1, 0.5, 0x1_0000_0001, Number.NaN]) {
      expect(() => randomBelow(bound)).toThrow();
    }
    expect(() => selectWeighted([{ value: "a", weight: 0 }])).toThrow();
    expect(() => randomBelow(3, () => 0xffff_ffff)).toThrow("Random source failed");
  });
});
