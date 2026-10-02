import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { SourceRef } from "../clio/types";
import type { CaseFile, Digest } from "../derive";

/**
 * Optional AI digest. Runs only when ANTHROPIC_API_KEY is set (sending case
 * data to a model provider is an explicit opt-in for the firm). It is called
 * once per data change: the caller caches the result by input hash, so
 * opening the page never re-digests.
 *
 * The model works from the derived facts and candidate events, and must cite
 * record ids for every sentence; uncited sentences are dropped.
 */

export const AI_MODEL = "claude-opus-5-5";

const DigestSchema = z.object({
  sentences: z
    .array(
      z.object({
        text: z.string().describe("One plain sentence. No legal advice, no speculation beyond the records."),
        source_ids: z.array(z.string()).describe("Ids of the records this sentence relies on."),
      }),
    )
    .describe("3 or 4 sentences: what happened, the injuries, where the case stands, the most important risk or insight."),
  reasons: z
    .array(z.object({ event_id: z.string(), reason: z.string().describe("2-5 words: why this event matters") }))
    .describe("One short reason per highlighted event id."),
});

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function generateAiDigest(c: CaseFile): Promise<Digest | null> {
  if (!aiEnabled()) return null;
  const client = new Anthropic();

  const sourcesById = new Map<string, SourceRef>();
  const remember = (s: SourceRef) => (sourcesById.set(s.id, s), s.id);

  const facts = {
    client: c.client.name,
    matter: c.matter.description,
    stage: c.matter.stage,
    dateOfIncident: c.matter.dateOfIncident?.value,
    estimatedValue: c.kpis.estimatedValue && { amount: c.kpis.estimatedValue.value, source: remember(c.kpis.estimatedValue.source) },
    defendantLimit: c.kpis.coverage.defendantLimit && { amount: c.kpis.coverage.defendantLimit.value, source: remember(c.kpis.coverage.defendantLimit.source) },
    coverageConfirmed: c.kpis.coverage.confirmed,
    specials: c.kpis.specials && { amount: c.kpis.specials.value, interim: c.kpis.specials.interim, source: remember(c.kpis.specials.source) },
    procedures: c.treatment.procedures.map((p) => ({ label: p.label, status: p.status, date: p.date, openForDays: p.openForDays, source: remember(p.source) })),
    injuries: c.treatment.injuries.map((i) => i.region),
    crux: c.liability.crux && { question: c.liability.crux.question, text: c.liability.crux.text, source: remember(c.liability.crux.source) },
    risks: c.liability.risks.map((r) => ({ label: r.label, source: remember(r.sources[0]) })),
  };
  const highlighted = c.topEvents.map((e) => ({ id: remember(e.source), date: e.date, title: e.title, excerpt: e.source.snippet ?? "" }));

  const response = await client.beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: zodOutputFormat(DigestSchema) },
    system:
      "You brief a personal-injury attorney on one case file. Write plainly and precisely, like the lede of a news story. Use only the facts provided; cite record ids for every sentence.",
    messages: [
      {
        role: "user",
        content: `Case facts (derived from Clio):\n${JSON.stringify(facts, null, 1)}\n\nHighlighted events:\n${JSON.stringify(highlighted, null, 1)}\n\nWrite the 3-4 sentence summary and one short reason per highlighted event.`,
      },
    ],
  } as Parameters<typeof client.beta.messages.parse>[0]);

  if (response.stop_reason === "refusal" || !response.parsed_output) return null;
  const parsed = response.parsed_output as z.infer<typeof DigestSchema>;

  const sentences = parsed.sentences
    .map((s) => ({ text: s.text, sources: s.source_ids.map((id) => sourcesById.get(id)).filter((x): x is SourceRef => Boolean(x)) }))
    .filter((s) => s.sources.length > 0);
  if (sentences.length < 2) return null;

  const eventIdBySource = new Map(c.topEvents.map((e) => [e.source.id, e.id]));
  const reasons: Record<string, string> = {};
  for (const r of parsed.reasons) {
    const id = eventIdBySource.get(r.event_id);
    if (id) reasons[id] = r.reason;
  }

  return {
    sentences,
    reasons,
    generator: { kind: "ai", model: response.model ?? AI_MODEL },
    generatedAt: new Date().toISOString(),
    itemCount: c.itemCount,
    inputHash: c.inputHash,
  };
}
