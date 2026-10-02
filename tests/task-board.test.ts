import { beforeAll, describe, expect, it } from "vitest";
import { PipelineMatterSource } from "../lib/clio/pipeline";
import type { MatterBundle } from "../lib/clio/types";
import { deriveCase, type CaseFile } from "../lib/derive";
import { WAITING_MIN } from "../lib/derive/task-board";
import { selectClientView, selectProviderView } from "../lib/access";

const TODAY = "2026-10-02";
let bundle: MatterBundle;
let c: CaseFile;

beforeAll(async () => {
  bundle = await new PipelineMatterSource().loadMatter();
  c = deriveCase(bundle, { today: TODAY });
});

const clone = (b: MatterBundle): MatterBundle => JSON.parse(JSON.stringify(b));
const all = (cf: CaseFile) => Object.values(cf.taskBoard.columns).flat();

describe("task board columns", () => {
  it("puts every Clio task in exactly one column", () => {
    const ids = all(c).map((t) => t.id).sort();
    expect(ids).toEqual(bundle.tasks.map((t) => t.id).sort());
  });

  it("files complete tasks under done, and only those", () => {
    for (const t of all(c)) expect(t.column === "done").toBe(t.status === "complete");
  });

  it("keeps an overdue task overdue even when it waits on someone", () => {
    for (const t of c.taskBoard.columns.overdue) expect(t.daysUntilDue).toBeLessThan(0);
    const b = clone(bundle);
    const task = b.tasks.find((t) => t.status !== "complete")!;
    task.dueAt = "2026-09-01";
    task.name = "By medical provider: Example Clinic - Records";
    delete b.taskLinks?.[task.id]; // no Jev judgement, so the title convention decides who it waits on
    const t = all(deriveCase(b, { today: TODAY })).find((x) => x.id === task.id)!;
    expect(t.column).toBe("overdue");
    expect(t.waitingOn?.party).toBe("Example Clinic");
  });

  it("files a not-yet-due task as waiting when Jev says someone outside the firm acts next", () => {
    const b = clone(bundle);
    const task = b.tasks.find((t) => t.status !== "complete" && !/^By /i.test(t.name))!;
    task.dueAt = "2026-12-01";
    b.taskLinks = { ...(b.taskLinks ?? {}), [task.id]: { taskId: task.id, waiting: { prob: WAITING_MIN + 0.1, party: "The client" }, links: [] } };
    const t = all(deriveCase(b, { today: TODAY })).find((x) => x.id === task.id)!;
    expect(t.column).toBe("waiting");
    expect(t.waitingOn).toMatchObject({ party: "The client", basis: "jev" });

    b.taskLinks[task.id].waiting.prob = WAITING_MIN - 0.1;
    expect(all(deriveCase(b, { today: TODAY })).find((x) => x.id === task.id)!.column).toBe("upcoming");
  });
});

describe("related records", () => {
  it("resolves every link to a record that exists in the bundle", () => {
    const linked = Object.values(bundle.taskLinks ?? {}).reduce((n, l) => n + l.links.length, 0);
    const resolved = all(c).reduce((n, t) => n + t.related.length, 0);
    expect(resolved).toBe(linked);
  });

  it("points document links at a page within the document", () => {
    for (const r of all(c).flatMap((t) => t.related).filter((x) => x.source.kind === "document")) {
      expect(r.source.page).toBeGreaterThanOrEqual(1);
      if (r.source.pageCount) expect(r.source.page).toBeLessThanOrEqual(r.source.pageCount);
    }
  });

  it("stays out of the provider and client views", () => {
    const leaks = (json: string) => ["taskBoard", '"related"', '"signals"', '"waitingOn":{"party"'].filter((k) => json.includes(k));
    for (const p of c.providers) {
      const v = selectProviderView(c, p.id, { showCoverageAmount: false, items: {} });
      expect(leaks(JSON.stringify(v ?? {}))).toEqual([]);
    }
    expect(leaks(JSON.stringify(selectClientView(c)))).toEqual([]);
  });
});
