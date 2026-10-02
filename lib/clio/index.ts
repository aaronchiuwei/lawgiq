import { LiveClioMatterSource } from "./client";
import { FixtureMatterSource } from "./fixture";
import type { MatterSource } from "./types";

export * from "./types";

/**
 * FIXTURE_MODE=1 (or no CLIO_ACCESS_TOKEN) reads the seed JSON through the
 * same MatterSource interface the live client implements.
 */
export function isFixtureMode(): boolean {
  return process.env.FIXTURE_MODE === "1" || process.env.FIXTURE_MODE === "true" || !process.env.CLIO_ACCESS_TOKEN;
}

export function getMatterSource(): MatterSource {
  if (isFixtureMode()) return new FixtureMatterSource();
  return new LiveClioMatterSource(process.env.CLIO_ACCESS_TOKEN!);
}
