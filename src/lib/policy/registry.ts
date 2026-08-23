import { allAccounts, allChunks, allDocMetas } from "@/lib/data/store";
import {
  docText,
  extractKnownIssues,
  flatten,
  parseDuration,
  parseMoney,
  parseTargetsByPlan,
  parseTargetsBySeverity,
  type ContractTerms,
  type KnownIssue,
  type PlanTargets,
  type PolicyParams,
} from "./parse";

/**
 * Boot-time policy model. Every rule parameter the engines use is parsed from
 * the document corpus; missing parameters produce loud errors at startup
 * rather than silent wrong answers.
 */

export interface PolicyModel {
  policy: PolicyParams;
  contracts: Record<string, ContractTerms>; // accountId -> terms
}

declare global {
  var __ppPolicy: PolicyModel | null; // module-cached across dev HMR
}

function build(): PolicyModel {
  const chunks = allChunks();
  const docs = allDocMetas();
  const warnings: string[] = [];

  const currentPolicy = docs.find((d) => d.type === "POLICY" && d.status === "CURRENT");
  const sop = docs.find((d) => d.type === "SOP" && d.status === "CURRENT");
  const guide = docs.find((d) => d.type === "GUIDE" && d.status === "CURRENT");
  const contractDocs = docs.filter((d) => d.type === "CONTRACT" && d.status === "ACTIVE");

  if (!currentPolicy) warnings.push("No CURRENT POLICY document found");
  if (!sop) warnings.push("No CURRENT SOP document found");
  if (!guide) warnings.push("No CURRENT GUIDE document found");

  const planNames = [...new Set(allAccounts().map((a) => a.plan))];

  // ---- severity definitions (verbatim, for citations + inference fallback)
  const severityDefinitions: Partial<Record<"P1" | "P2" | "P3", string>> = {};
  let sourcePrecedenceRaw: string | null = null;
  if (currentPolicy) {
    for (const c of chunks.filter((c) => c.doc_id === currentPolicy.doc_id)) {
      const re = /P([123])\s*-\s*(Critical|High|Normal)\s*:\s*([\s\S]*?)(?=●|$)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(c.text)) !== null) {
        severityDefinitions[`P${m[1]}` as "P1" | "P2" | "P3"] = flatten(m[3]);
      }
      const precMatch = flatten(c.text).match(/use the signed[\s\S]*?documentation/i);
      if (!sourcePrecedenceRaw && precMatch) sourcePrecedenceRaw = precMatch[0].trim();
    }
  }

  // ---- default response targets by plan
  let defaultTargetsByPlan: Record<string, PlanTargets> = {};
  if (currentPolicy) {
    const targetsChunk =
      chunks.find((c) => c.doc_id === currentPolicy.doc_id && /first-response targets/i.test(c.title)) ??
      chunks.find((c) => c.doc_id === currentPolicy.doc_id);
    if (targetsChunk) {
      defaultTargetsByPlan = parseTargetsByPlan(targetsChunk.text, planNames);
      if (Object.keys(defaultTargetsByPlan).length === 0)
        warnings.push(`Could not parse response-target matrix from ${targetsChunk.chunk_id}`);
    }
  }

  // ---- cancellation + service credit + approval threshold (from SOP)
  let cancellation: PolicyParams["cancellation"] | null = null;
  let serviceCredit: PolicyParams["serviceCredit"] | null = null;
  let approvalThresholdInr: number | null = null;
  if (sop) {
    const cancelText = docText(sop, chunks);
    const freeWin = cancelText.match(/No fee within (\d+) minutes of booking/i);
    const lateFee = cancelText.match(/charge INR ([\d,]+)/i);
    const rto = cancelText.match(/return-to-origin/i);
    if (freeWin && lateFee && rto) {
      cancellation = {
        freeWindowMin: parseInt(freeWin[1], 10),
        lateFeeInr: parseMoney(lateFee[1]),
        waiverByAgreementClause: /unless a customer agreement explicitly waives/i.test(cancelText),
        pickedUpAction: "return-to-origin",
      };
    } else {
      warnings.push("Cancellation parameters incomplete in SOP");
    }

    const delayH = cancelText.match(/more than (\d+) hours past the end of the scheduled pickup window/i);
    const creditAmt = cancelText.match(/lower of INR ([\d,]+) or (\d+)% of the shipment fee/i);
    if (delayH && creditAmt) {
      serviceCredit = {
        delayThresholdHours: parseInt(delayH[1], 10),
        defaultCapInr: parseMoney(creditAmt[1]),
        defaultPctOfFee: parseInt(creditAmt[2], 10),
      };
    } else {
      warnings.push("Service-credit parameters incomplete in SOP");
    }

    const approval = cancelText.match(/credit above INR ([\d,]+) requires manager approval/i);
    if (approval) approvalThresholdInr = parseMoney(approval[1]);
    else warnings.push("Manager-approval threshold not found in SOP");
  }

  // ---- bulk upload limit (guide capabilities section)
  let bulkUploadLimitRows: number | null = null;
  if (guide) {
    const capsChunk = chunks.find((c) => c.doc_id === guide.doc_id && /capabilities/i.test(c.title));
    const text = capsChunk ? capsChunk.text : docText(guide, chunks);
    const lim = text.match(/up to ([\d,]+) rows per CSV/i);
    if (lim) bulkUploadLimitRows = parseMoney(lim[1]);
    else warnings.push("Bulk-upload row limit not found in guide");
  }

  // ---- known issues registry (current + resolved sections of the guide)
  const knownIssues: KnownIssue[] = [];
  if (guide) {
    const kiTexts = chunks.filter((c) => c.doc_id === guide.doc_id).map((c) => c.text);
    for (const t of kiTexts) knownIssues.push(...extractKnownIssues(t));
  }

  // ---- contracts
  const contracts: Record<string, ContractTerms> = {};
  for (const cd of contractDocs) {
    const text = docText(cd, chunks);
    const unparsedClauses: string[] = [];
    const slaOverrides = parseTargetsBySeverity(text) ?? undefined;
    if (!slaOverrides && /first-response targets/i.test(text))
      unparsedClauses.push("Support-target overrides present but unparseable");
    const weekendSupportExcluded = /no weekend or after-hours support coverage/i.test(text) || undefined;
    let cancellationWaiver: ContractTerms["cancellationWaiver"];
    if (/with no cancellation fee/i.test(text)) cancellationWaiver = { waived: true };
    else if (/no special cancellation-fee waiver/i.test(text)) cancellationWaiver = { waived: false };
    let failedPickupCredit: ContractTerms["failedPickupCredit"];
    const thr = text.match(/more than (\d+) hours past/i);
    const fixed = text.match(/fixed INR ([\d,]+)/i);
    if (thr && fixed) failedPickupCredit = { thresholdHours: parseInt(thr[1], 10), amountInr: parseMoney(fixed[1]) };
    const capM = text.match(/capped at INR ([\d,]+)/i);
    const monthlyCreditCapInr = capM ? parseMoney(capM[1]) : undefined;
    contracts[cd.applies_to.join(",")] = {
      docId: cd.doc_id,
      accountIds: cd.applies_to,
      slaOverrides,
      weekendSupportExcluded,
      cancellationWaiver,
      failedPickupCredit,
      monthlyCreditCapInr,
      unparsedClauses,
    };
  }

  return {
    policy: {
      severityDefinitions,
      sourcePrecedenceRaw,
      defaultTargetsByPlan,
      get cancellation() {
        if (!cancellation) throw new Error("Cancellation policy unavailable — dataset failed to parse");
        return cancellation;
      },
      serviceCredit: serviceCredit as PolicyParams["serviceCredit"],
      approvalThresholdInr,
      bulkUploadLimitRows,
      knownIssues,
      warnings,
    },
    contracts,
  };
}

export function getPolicyModel(): PolicyModel {
  if (!globalThis.__ppPolicy) globalThis.__ppPolicy = build();
  return globalThis.__ppPolicy;
}

export function contractFor(accountId: string): ContractTerms | undefined {
  const { contracts } = getPolicyModel();
  return contracts[accountId] ?? Object.values(contracts).find((c) => c.accountIds.includes(accountId));
}

/** Severity → applicable first-response target for an account. */
export function resolveTarget(plan: string, severity: "P1" | "P2" | "P3", accountId?: string): ReturnType<typeof parseDuration> & { source: string } | null {
  const model = getPolicyModel();
  if (accountId) {
    const ct = contractFor(accountId);
    if (ct?.slaOverrides?.[severity])
      return { ...ct.slaOverrides[severity], source: `${ct.docId}` };
  }
  const def = model.policy.defaultTargetsByPlan[plan]?.[severity];
  if (def) return { ...def, source: "current support policy" };
  return null;
}
