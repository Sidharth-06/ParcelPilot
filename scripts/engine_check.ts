import { computeCancellation, computeServiceCredit } from "../src/lib/engines/credit";
import { assessTicketSla } from "../src/lib/engines/sla";
import { detectConflicts } from "../src/lib/engines/conflict";
import { deriveInsights } from "../src/lib/engines/insights";
import { inferSeverity } from "../src/lib/engines/severity";
import { allTickets, SNAPSHOT_TIME } from "../src/lib/data/store";

console.log("snapshot:", SNAPSHOT_TIME.toISOString());

for (const id of ["ORD-1001", "ORD-2001", "ORD-3001", "ORD-1002"]) {
  const r = computeCancellation(id);
  console.log(`cancel ${id}: ${r.action} fee=${r.feeInr} waiver=${r.waiverApplied} :: ${r.reasons[0]}`);
}
for (const id of ["ORD-2002", "ORD-2001"]) {
  const r = computeServiceCredit(id);
  console.log(`credit ${id}: ${r.eligibleState} amount=${r.amountInr} approval=${r.approvalRequired} delay=${r.delayMinutesPastWindow}`);
}
console.log("\nSLA (lexical severity — no vectors yet):");
for (const t of allTickets().filter((t) => t.status === "open")) {
  const a = assessTicketSla(t);
  console.log(`${a.ticket_id}: sev=${a.severity ?? "?"}(${a.severityMethod}) target=${a.targetMinutes} elapsed=${a.elapsedMinutes} breached=${a.breached}`);
}
console.log("\nlexical severity spot-checks:");
console.log("TKT-501:", inferSeverity("All shipment creation is failing", "Every user at Northstar gets HTTP 500 when creating any shipment."));
console.log("TKT-505:", inferSeverity("Possible API key exposure", "An employee accidentally posted a screenshot containing a production API key in a public channel."));
console.log("TKT-503:", inferSeverity("How do we change the billing contact?", "Customer wants to replace the billing-contact email on their account."));

const conflicts = detectConflicts();
console.log(`\nconflicts: ${conflicts.length}`, conflicts.map((c) => c.id).join(", "));

const insights = deriveInsights();
console.log(`\ninsights: ${insights.length}`);
for (const i of insights) console.log(` [${i.level}] ${i.type} :: ${i.title.slice(0, 90)}`);
