import type { MatterBundle, SourceRef } from "../clio/types";
import type { CaseEvent } from "./events";
import type { TaskBuckets } from "./tasks";
import { daysBetween, findField, jaccard, tokens } from "./util";

/**
 * "Check this" flags: places where two records disagree. We never silently
 * pick a winner; we show both sources and let the attorney decide.
 */

export interface Conflict {
  id: string;
  /** What the flag attaches to in the UI, e.g. a task id or "coverage". */
  anchor: string;
  title: string;
  detail: string;
  sources: SourceRef[];
}

export function deriveConflicts(bundle: MatterBundle, events: CaseEvent[], tasks: TaskBuckets): Conflict[] {
  const out: Conflict[] = [];

  // 1. An overdue open task with a communication on the same subject nearby:
  //    either the task is done and wasn't closed, or the email didn't do it.
  for (const t of [...tasks.overdue, ...tasks.waiting.filter((w) => (w.daysUntilDue ?? 0) < 0)]) {
    const tt = tokens(t.title);
    const related = events
      .filter((e) => (e.kind === "email" || e.kind === "call") && t.due && Math.abs(daysBetween(e.date, t.due)) <= 14)
      .map((e) => ({ e, sim: jaccard(tt, tokens(e.title)) }))
      .filter((x) => x.sim >= 0.3)
      .sort((a, b) => b.sim - a.sim)[0];
    if (related) {
      out.push({
        id: `task-vs-comm-${t.id}`,
        anchor: t.id,
        title: "Task still open, related message on file",
        detail: `“${related.e.title}” (${related.e.date}) is about the same thing as this task, which is still open and past due. Confirm whether it was resolved.`,
        sources: [t.source, related.e.source],
      });
    }
  }

  // 2. Self-insured defendant, yet a per-person limit is recorded: whose policy is it?
  const insurer = findField(bundle, "Insurance Carrier");
  const limits = findField(bundle, "Policy Limits");
  if (insurer && limits && /self-insured/i.test(String(insurer.value)) && /\$[\d,]+/.test(String(limits.value))) {
    const noCeiling = events.find((e) => e.kind === "note" && /no stated ceiling|no limit to confirm|no declarations page/i.test(e.text));
    out.push({
      id: "coverage-self-insured-limits",
      anchor: "coverage",
      title: "Whose limit is this?",
      detail:
        "The defendant is recorded as self-insured, but a per-person liability limit is also recorded. Check which policy the confirmed limit belongs to before relying on it as the coverage ceiling.",
      sources: [insurer.source, limits.source, ...(noCeiling ? [noCeiling.source] : [])],
    });
  }

  // 3. The same filing appears with different dates in different record types.
  const docs = events.filter((e) => e.kind === "document");
  for (const d of docs) {
    const dt = tokens(d.title);
    if (dt.length < 2) continue;
    const match = events.find(
      (e) => e.kind === "expense" && e.id !== d.id && dt.every((w) => e.text.toLowerCase().includes(w)) && Math.abs(daysBetween(e.date, d.date)) > 30,
    );
    if (match) {
      out.push({
        id: `date-mismatch-${d.id}`,
        anchor: d.id,
        title: "Same filing, different dates",
        detail: `“${d.title}” is dated ${d.date} in documents but ${match.date} in the expense ledger.`,
        sources: [d.source, match.source],
      });
    }
  }

  // 4. Exact-duplicate communications under different subjects.
  for (const e of events) {
    if (e.duplicates.length) {
      out.push({
        id: `duplicate-${e.id}`,
        anchor: e.id,
        title: "Logged twice",
        detail: `The same message is recorded ${e.duplicates.length + 1} times. Shown once in the timeline.`,
        sources: [e.source, ...e.duplicates],
      });
    }
  }

  return out;
}
