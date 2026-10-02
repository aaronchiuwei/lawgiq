import { beforeAll, describe, expect, it } from "vitest";
import { FixtureMatterSource } from "../lib/clio/fixture";
import type { MatterBundle } from "../lib/clio/types";
import { deriveCase, type CaseFile } from "../lib/derive";
import { deriveHeadlines, spotsFor } from "../lib/derive/headlines";

const TODAY = "2026-10-02";
let bundle: MatterBundle;
let c: CaseFile;

beforeAll(async () => {
  bundle = await new FixtureMatterSource().loadMatter();
  c = deriveCase(bundle, { today: TODAY });
});

describe("answer-first headlines", () => {
  it("states the money as worth, covered and exposed", () => {
    const h = deriveHeadlines(c).money;
    expect(h).toMatchObject({ value: 375000, limit: 100000, gap: 275000, specialsOverLimit: true });
  });

  it("says the specials already exceed the limit", () => {
    expect(deriveHeadlines(c).specials.text).toBe("$118,400 billed, already more than the $100,000 limit.");
    expect(deriveHeadlines(c).specials.sub).toMatch(/two ledgers unreconciled/);
  });

  it("counts injuries and separates done from undated surgery", () => {
    expect(deriveHeadlines(c).injuries.text).toBe("Five regions injured; one surgery done; one recommended and still undated.");
  });

  it("names the liability crux and the weakest scorecard factor", () => {
    const h = deriveHeadlines(c);
    expect(h.liability.text).toBe("Turns on scope of employment, still unresolved.");
    expect(h.strength.weakest?.id).toBe("liability");
  });

  it("leads the story with the last real movement", () => {
    expect(deriveHeadlines(c).story.text).toMatch(/^Last real movement Sep 20:/);
  });

  it("follows the data, not the fixture: no value means no exposure claim", () => {
    const b: MatterBundle = JSON.parse(JSON.stringify(bundle));
    b.customFields = b.customFields.filter((f) => !/value/i.test(f.name));
    const h = deriveHeadlines(deriveCase(b, { today: TODAY })).money;
    expect(h.value).toBeNull();
    expect(h.gap).toBeNull();
  });
});

describe("body map", () => {
  it("lights both sides unless a side is named", () => {
    expect(spotsFor("Shoulders shoulders")).toEqual(["shoulder-l", "shoulder-r"]);
    expect(spotsFor("right shoulder arthroscopy")).toEqual(["shoulder-r"]);
    expect(spotsFor("left knee repair")).toEqual(["knee-l"]);
    expect(spotsFor("Cervical spine neck")).toEqual(["neck"]);
    expect(spotsFor("Head / brain head")).toEqual(["head"]);
    expect(spotsFor("elbow")).toEqual([]);
  });
});
