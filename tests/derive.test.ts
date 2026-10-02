import { beforeAll, describe, expect, it } from "vitest";
import { FixtureMatterSource } from "../lib/clio/fixture";
import { ClioClient, ClioReadOnlyError } from "../lib/clio/client";
import type { MatterBundle } from "../lib/clio/types";
import { deriveCase, type CaseFile } from "../lib/derive";
import { selectClientView, selectProviderView } from "../lib/access";

const TODAY = "2026-10-02";
let bundle: MatterBundle;
let c: CaseFile;

beforeAll(async () => {
  bundle = await new FixtureMatterSource().loadMatter();
  c = deriveCase(bundle, { today: TODAY });
});

const clone = (b: MatterBundle): MatterBundle => JSON.parse(JSON.stringify(b));

describe("statute of limitations", () => {
  it("is satisfied, not expired, when the past SOL task is complete", () => {
    expect(c.sol.date).toBe("2026-04-22");
    expect(c.sol.daysUntil).toBeLessThan(0);
    expect(c.sol.status).toBe("satisfied");
    expect(c.sol.sources.length).toBeGreaterThan(0);
  });

  it("is expired when the same past date's task is still pending", () => {
    const b = clone(bundle);
    b.tasks.find((t) => t.isStatuteOfLimitations)!.status = "pending";
    expect(deriveCase(b, { today: TODAY }).sol.status).toBe("expired");
  });

  it("is upcoming when the date is in the future", () => {
    const b = clone(bundle);
    b.tasks.find((t) => t.isStatuteOfLimitations)!.status = "pending";
    expect(deriveCase(b, { today: "2026-01-01" }).sol.status).toBe("upcoming");
  });
});

describe("task buckets", () => {
  it("puts 'By medical provider:' tasks in waiting-on-others", () => {
    expect(c.tasks.waiting.map((t) => t.waitingOn)).toEqual([
      "McCulloch Orthopaedic Surgical Services, PLLC",
      "Advanced Rockland Chiropractic Offices, P.C.",
      "SportsCare Physical Therapy of New York",
    ]);
  });
  it("separates overdue from coming up and excludes completed + SOL tasks", () => {
    expect(c.tasks.overdue.map((t) => t.title)).toEqual(["Obtain updated employment and commission records from client"]);
    expect(c.tasks.comingUp.every((t) => (t.daysUntilDue ?? 0) >= 0)).toBe(true);
    const all = [...c.tasks.overdue, ...c.tasks.comingUp, ...c.tasks.waiting];
    expect(all.some((t) => /limitations/i.test(t.title))).toBe(false);
  });
  it("flags the employment-records task as conflicting with the 2026-09-21 email", () => {
    const flag = c.conflicts.find((x) => x.anchor === c.tasks.overdue[0].id);
    expect(flag).toBeTruthy();
    expect(flag!.sources.some((s) => s.date === "2026-09-21")).toBe(true);
  });
});

describe("money", () => {
  it("sums firm expenses to $1,410 across 5 entries", () => {
    expect(c.kpis.firmSpend.value).toBe(1410);
    expect(c.kpis.firmSpend.count).toBe(5);
  });
  it("shows value exceeds the confirmed defendant limit", () => {
    expect(c.kpis.estimatedValue?.value).toBe(375000);
    expect(c.kpis.coverage.defendantLimit?.value).toBe(100000);
    expect(c.kpis.coverage.confirmed).toBe(true);
    expect(c.kpis.coverage.gap?.value).toBe(275000);
  });
  it("marks specials $118,400 as interim and breaks them down by provider", () => {
    expect(c.kpis.specials?.value).toBe(118400);
    expect(c.kpis.specials?.interim).toBe(true);
    expect(c.specials?.total).toBe(118400);
    expect(c.specials?.coverage).toEqual({ reported: 8, of: 10 });
  });
  it("reads the Medicaid lien and exhausted no-fault", () => {
    expect(c.kpis.liens[0].amount).toBe(22180);
    expect(c.kpis.noFault).toMatchObject({ amount: 50000, exhausted: true });
  });
});

describe("treatment", () => {
  it("finds the performed left and the undated right shoulder arthroscopy", () => {
    const performed = c.treatment.procedures.find((p) => p.status === "performed");
    const open = c.treatment.procedures.find((p) => p.status === "recommended");
    expect(performed?.label).toBe("left shoulder arthroscopy");
    expect(open?.label).toBe("right shoulder arthroscopy");
    expect(open?.date).toBe("2024-05-27");
    expect(open?.openForDays).toBeGreaterThan(800);
    expect(open?.followUps).toBe(5);
  });
  it("computes documentation gaps from dated records, not assumptions", () => {
    const pt = c.treatment.providers.find((p) => p.providerId === "contact-sportscare")!;
    expect(pt.gaps.length).toBeGreaterThan(0);
    expect(pt.gaps.every((g) => g.days > c.thresholds.treatmentGapDays)).toBe(true);
    expect(pt.nextScheduled).toBe("2026-10-10");
  });
  it("treats a produced records range as continuous coverage", () => {
    const chiro = c.treatment.providers.find((p) => p.providerId === "contact-rocklandchiro")!;
    // DOI+3 through DOI+212 is one production: no gap inside it.
    expect(chiro.gaps.some((g) => g.from < "2023-11-21" && g.to <= "2023-11-21")).toBe(false);
  });
  it("respects the configurable gap threshold", () => {
    const loose = deriveCase(bundle, { today: TODAY, treatmentGapDays: 400 });
    const pt = loose.treatment.providers.find((p) => p.providerId === "contact-sportscare")!;
    expect(pt.gaps.every((g) => g.days > 400)).toBe(true);
  });
});

describe("timeline", () => {
  it("ranks at most 10 past events in date order, each with a reason", () => {
    expect(c.topEvents.length).toBeLessThanOrEqual(10);
    expect(c.topEvents.every((e) => e.reason && e.date <= TODAY)).toBe(true);
    const dates = c.topEvents.map((e) => e.date);
    expect([...dates].sort()).toEqual(dates);
    const reasons = c.topEvents.map((e) => e.reason);
    expect(reasons).toContain("Surgery");
    expect(reasons).toContain("Coverage confirmed");
    expect(reasons).toContain("Shifted liability");
  });
  it("collapses the duplicated coverage email", () => {
    expect(c.events.some((e) => e.duplicates.length > 0)).toBe(true);
  });
});

describe("milestones", () => {
  it("only come from records whose subject is the event", () => {
    // A specials tally that lists a past surgery is not a surgery milestone.
    const surgery = c.milestones.filter((m) => m.ruleId === "surgery-performed");
    expect(surgery.map((m) => m.date)).toEqual(["2023-07-26"]);
  });
  it("dedupe one-time events recorded twice", () => {
    expect(c.milestones.filter((m) => m.ruleId === "no-fault")).toHaveLength(1);
  });
  it("give providers a last-movement date from the latest milestone", () => {
    expect(c.lastMovement?.date).toBe("2026-09-20");
  });
});

describe("conflicts", () => {
  it("flag a filing dated differently in documents and the expense ledger", () => {
    expect(c.conflicts.some((x) => x.title === "Same filing, different dates")).toBe(true);
  });
  it("flag a self-insured defendant with a recorded per-person limit", () => {
    expect(c.conflicts.some((x) => x.anchor === "coverage")).toBe(true);
  });
});

describe("client contact", () => {
  it("finds the 2026-09-27 phone call and applies the threshold", () => {
    expect(c.clientContact.last?.date).toBe("2026-09-27");
    expect(c.clientContact.last?.channel).toBe("phone");
    expect(c.clientContact.stale).toBe(false);
    const strict = deriveCase(bundle, { today: TODAY, clientContactStaleDays: 3 });
    expect(strict.clientContact.stale).toBe(true);
  });
});

describe("role scoping", () => {
  const forbiddenForProvider = [
    "375", // valuation
    "214", // wage loss
    "Wage",
    "wage",
    "valuation",
    "credib",
    "inconsistent",
    "prior injur",
    "Ferrara",
    "scope of employment",
    "jsapini", // client email
    "358-2214", // client phone
    "Cypress", // client address
    "Montefiore", // another provider
    "SportsCare",
    "Rockland",
    "22,180",
    "22180",
  ];

  it("omits restricted fields from the McCulloch provider view", () => {
    const v = selectProviderView(c, "contact-mcculloch", { showCoverageAmount: false, items: {} })!;
    const json = JSON.stringify(v);
    for (const word of forbiddenForProvider) expect(json, word).not.toContain(word);
    expect(v.coverage.amount).toBeNull();
    expect(v.coverage.exists).toBe(true);
    expect(v.requests.length).toBe(1);
    expect(v.questions[0].text).toMatch(/right shoulder arthroscopy/i);
    expect(v.bills.map((b) => b.label)).toEqual(["Orthopaedic"]);
  });

  it("shows the coverage amount only when the attorney allows it", () => {
    const v = selectProviderView(c, "contact-mcculloch", { showCoverageAmount: true, items: {} })!;
    expect(v.coverage.amount).toBe(100000);
  });

  it("physically drops items the attorney excluded", () => {
    const full = selectProviderView(c, "contact-sportscare", { showCoverageAmount: false, items: {} })!;
    const key = full.requests[0].key;
    const v = selectProviderView(c, "contact-sportscare", { showCoverageAmount: false, items: { [key]: false, attendance: false } })!;
    expect(v.requests.find((r) => r.key === key)).toBeUndefined();
    expect(v.attendance.released).toBe(false);
    expect(v.attendance.points).toEqual([]);
  });

  it("never lets another provider's medical milestones into a provider feed", () => {
    const v = selectProviderView(c, "contact-sportscare", { showCoverageAmount: false, items: {} })!;
    expect(v.feed.some((f) => /surgery/i.test(f.text))).toBe(false);
    expect(v.questions).toEqual([]);
  });

  it("keeps the client view free of valuation, strategy and other parties", () => {
    const v = selectClientView(c);
    const json = JSON.stringify(v);
    for (const word of ["375", "100,000", "100000", "214", "Ferrara", "Metro-North", "credib", "scope", "Expert", "expert", "22,180", "score"])
      expect(json, word).not.toContain(word);
    expect(v.stage.current).toBe("Litigation");
    expect(v.asks[0].title).toMatch(/commission records/);
    expect(v.nextAppointment?.date).toBe("2026-10-09");
  });
});

describe("clio client", () => {
  it("refuses any verb other than GET", async () => {
    const client = new ClioClient("token") as unknown as { request: (u: string, m: string) => Promise<unknown> };
    await expect(client.request("https://app.clio.com/api/v4/notes.json", "POST")).rejects.toBeInstanceOf(ClioReadOnlyError);
  });
});
