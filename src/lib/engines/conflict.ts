import { allAccounts } from "@/lib/data/store";
import { contractFor, getPolicyModel } from "@/lib/policy/registry";

/**
 * Source-conflict detection. Compares each active contract's parsed terms
 * against the current SOP/policy defaults and emits precedence cards. Fully
 * generic: derived from whatever contracts exist in the pack.
 */

export interface ConflictCard {
  id: string;
  accountId: string;
  domain: "cancellation_fee" | "service_credit" | "support_targets" | "credit_cap";
  contractClause: string;
  defaultClause: string;
  resolution: string;
}

export function detectConflicts(): ConflictCard[] {
  const { policy } = getPolicyModel();
  const cards: ConflictCard[] = [];

  for (const account of allAccounts()) {
    const ct = contractFor(account.account_id);
    if (!ct) continue;
    const prefix = `${account.account_id}`;

    if (ct.cancellationWaiver?.waived) {
      cards.push({
        id: `${prefix}-cancel-fee`,
        accountId: account.account_id,
        domain: "cancellation_fee",
        contractClause: `${ct.docId}: BOOKED shipments may be cancelled before pickup with no cancellation fee`,
        defaultClause: `SOP: free within ${policy.cancellation.freeWindowMin} minutes of booking, then INR ${policy.cancellation.lateFeeInr}`,
        resolution: "Signed customer agreement prevails over the SOP default",
      });
    }
    if (ct.failedPickupCredit) {
      cards.push({
        id: `${prefix}-credit`,
        accountId: account.account_id,
        domain: "service_credit",
        contractClause: `${ct.docId}: fixed INR ${ct.failedPickupCredit.amountInr} credit when pickup is more than ${ct.failedPickupCredit.thresholdHours}h past window end (carrier at fault)`,
        defaultClause: `SOP: lower of INR ${policy.serviceCredit.defaultCapInr} or ${policy.serviceCredit.defaultPctOfFee}% of shipment fee when more than ${policy.serviceCredit.delayThresholdHours}h late`,
        resolution: "Contract clause replaces the SOP default amount and timing threshold",
      });
    }
    if (ct.slaOverrides) {
      cards.push({
        id: `${prefix}-sla`,
        accountId: account.account_id,
        domain: "support_targets",
        contractClause: `${ct.docId}: P1 ${fmt(ct.slaOverrides.P1)}, P2 ${fmt(ct.slaOverrides.P2)}, P3 ${fmt(ct.slaOverrides.P3)}`,
        defaultClause: policy.defaultTargetsByPlan[account.plan]
          ? `Policy matrix for ${account.plan}: P1 ${fmt(policy.defaultTargetsByPlan[account.plan].P1)}, P2 ${fmt(policy.defaultTargetsByPlan[account.plan].P2)}, P3 ${fmt(policy.defaultTargetsByPlan[account.plan].P3)}`
          : "Policy matrix unavailable",
        resolution: "Contract response targets replace the standard support-policy targets",
      });
    }
    if (ct.monthlyCreditCapInr != null) {
      cards.push({
        id: `${prefix}-cap`,
        accountId: account.account_id,
        domain: "credit_cap",
        contractClause: `${ct.docId}: monthly aggregate service credits capped at INR ${ct.monthlyCreditCapInr.toLocaleString("en-IN")}`,
        defaultClause: "SOP defines per-incident credits with no aggregate cap",
        resolution: "Aggregate cap applies on top of per-incident rules",
      });
    }
  }
  return cards;
}

function fmt(t: { minutes: number; businessHours: boolean } | undefined): string {
  if (!t) return "?";
  const m = t.minutes;
  const label = m >= 1440 ? `${m / 1440} business day(s)` : m >= 60 ? `${m / 60} hour(s)` : `${m} minutes`;
  return t.businessHours ? `${label} (business hours)` : label;
}
