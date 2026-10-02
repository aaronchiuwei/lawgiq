import { PipelineMatterSource } from "./pipeline";
import type { MatterSource } from "./types";

export * from "./types";
export { runExport, triageKey } from "./pipeline";

/** All case data comes from the Python pipeline's output under data/. */
export function getMatterSource(): MatterSource {
  return new PipelineMatterSource();
}
