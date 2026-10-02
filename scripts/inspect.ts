import { FixtureMatterSource } from "../lib/clio/fixture";
import { deriveCase } from "../lib/derive";
(async () => {
  const b = await new FixtureMatterSource().loadMatter();
  const c = deriveCase(b, { today: "2026-10-02" });
  const strip = (o: unknown) => JSON.parse(JSON.stringify(o, (k, v) => (k === "source" || k === "sources" || k === "also" || k==="body"|| k==="duplicates") ? undefined : v));
  const sec = process.argv[2];
  if (sec === "events") { for (const e of c.events) console.log(e.date, e.kind.padEnd(8), String(e.score).padEnd(4), (e.reason??"").padEnd(26), e.title.slice(0,70), e.providerIds.join(",")); return; }
  if (sec) { console.log(JSON.stringify(strip((c as unknown as Record<string, unknown>)[sec]), null, 1)); return; }
  console.log(JSON.stringify(strip({matter:c.matter, kpis:c.kpis, digest:c.digest, sol:c.sol, clientContact:c.clientContact, lastMovement:c.lastMovement}), null, 1));
})();
