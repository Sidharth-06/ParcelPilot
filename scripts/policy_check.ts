import { getPolicyModel } from "../src/lib/policy/registry";
import { allDocMetas } from "../src/lib/data/store";

const m = getPolicyModel();
const p = m.policy;
console.log("warnings:", p.warnings);
console.log("severityDefs:", Object.keys(p.severityDefinitions));
console.log("precedence:", p.sourcePrecedenceRaw?.slice(0, 80));
console.log("targetsByPlan:", JSON.stringify(p.defaultTargetsByPlan));
console.log("approvalThreshold:", p.approvalThresholdInr);
console.log("bulkLimit:", p.bulkUploadLimitRows);
console.log("knownIssues:", p.knownIssues.map((k) => `${k.ki_id}[${k.status}] ${k.title.slice(0, 40)} | wa:${!!k.workaround} | desc:${k.description.length}ch`));
console.log("contracts:", JSON.stringify(m.contracts, null, 1).slice(0, 1200));
console.log("docs:", allDocMetas().map((d) => d.doc_id + ":" + d.type + ":" + d.status).join(", "));
