import { describe, it, expect } from "vitest";
import { fmtMoney, fmtCents, fmtNum, fmtDateTimeFull, describeActivity } from "./format";

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

describe("describeActivity", () => {
  const today = new Date(2026, 8, 23); // 23 septembre 2026, heure locale

  it("signale un compte sans dépense depuis plus de 2 jours", () => {
    expect(describeActivity("2026-09-17", today)).toEqual({ label: "17 septembre", stale: true });
  });

  it("ne signale pas un décalage normal de publication Meta", () => {
    expect(describeActivity("2026-09-21", today)?.stale).toBe(false); // 2 jours
    expect(describeActivity("2026-09-22", today)?.stale).toBe(false); // hier
  });

  it("lit la date en heure locale (pas de glissement au jour précédent)", () => {
    expect(describeActivity("2026-09-17", today)?.label).toBe("17 septembre");
  });

  it("n'affiche rien sans date exploitable", () => {
    expect(describeActivity(null, today)).toBeNull();
    expect(describeActivity(undefined, today)).toBeNull();
    expect(describeActivity("pas-une-date", today)).toBeNull();
  });
});
