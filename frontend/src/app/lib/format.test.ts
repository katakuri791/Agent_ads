import { describe, it, expect } from "vitest";
import { fmtMoney, fmtCents, fmtNum, fmtDateTimeFull } from "./format";

describe("fmtCents", () => {
  it("formate un montant en devise à 2 décimales", () => {
    expect(fmtCents(10)).toBe("$10.00");
    expect(fmtCents(25.99)).toBe("$25.99");
    expect(fmtCents(0)).toBe("$0.00");
  });
});

describe("fmtMoney", () => {
  it("abrège milliers (K) et millions (M)", () => {
    expect(fmtMoney(500)).toBe("$500");
    expect(fmtMoney(1500)).toBe("$1.5K");
    expect(fmtMoney(2_000_000)).toBe("$2.00M");
  });
});

describe("fmtNum", () => {
  it("abrège les grands nombres", () => {
    expect(fmtNum(1500)).toBe("1.5K");
    expect(fmtNum(2_000_000)).toBe("2.00M");
  });
});

describe("fmtDateTimeFull", () => {
  it("renvoie — pour une date absente ou invalide", () => {
    expect(fmtDateTimeFull(null)).toBe("—");
    expect(fmtDateTimeFull(undefined)).toBe("—");
    expect(fmtDateTimeFull("pas-une-date")).toBe("—");
  });
});
