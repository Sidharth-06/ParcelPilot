import { allTickets } from "../src/lib/data/store";
import { getPolicyModel } from "../src/lib/policy/registry";
import { cosine, vectorsFile } from "../src/lib/retrieval/vectors";

const vf = vectorsFile();
const tv = (id: string) => vf.collections.tickets?.find((t) => t.id === id)?.vec;
const open = allTickets().filter((t) => t.status === "open");

console.log("— ticket ↔ severity-definition —");
for (const t of open) {
  const v = tv(t.ticket_id);
  if (!v) continue;
  const scored = ["SEV-P1", "SEV-P2", "SEV-P3"].map((id) => ({
    id,
    s: cosine(v, vf.collections.known_issues!.find((e) => e.id === id)!.vec),
  }));
  scored.sort((a, b) => b.s - a.s);
  const gap = scored[0].s - scored[1].s;
  console.log(`${t.ticket_id}: top=${scored[0].id}@${scored[0].s.toFixed(3)} gap=${gap.toFixed(3)} | ${t.subject.slice(0, 44)}`);
}

console.log("\n— ticket ↔ known issue —");
const kis = getPolicyModel().policy.knownIssues.map((k) => k.ki_id);
for (const t of open) {
  const v = tv(t.ticket_id);
  if (!v) continue;
  const scored = kis.map((id) => ({ id, s: cosine(v, vf.collections.known_issues!.find((e) => e.id === id)!.vec) }));
  scored.sort((a, b) => b.s - a.s);
  console.log(`${t.ticket_id}: ${scored.map((x) => `${x.id}=${x.s.toFixed(3)}`).join(" ")}`);
}

console.log("\n— ticket ↔ ticket (open pairs) —");
for (let i = 0; i < open.length; i++)
  for (let j = i + 1; j < open.length; j++) {
    const a = tv(open[i].ticket_id)!;
    const b = tv(open[j].ticket_id)!;
    console.log(`${open[i].ticket_id} ↔ ${open[j].ticket_id} = ${cosine(a, b).toFixed(3)} | ${open[i].subject.slice(0, 26)} / ${open[j].subject.slice(0, 26)}`);
  }
