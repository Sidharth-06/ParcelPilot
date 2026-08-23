import { allDocMetas, orderById, SNAPSHOT_TIME } from "@/lib/data/store";
import { contractFor, getPolicyModel } from "@/lib/policy/registry";
import type { ContractTerms } from "@/lib/policy/parse";
import type { Order } from "@/lib/data/types";

/**
 * Deterministic money engines. Every threshold/fee/cap comes from the parsed
 * policy registry; contract terms override SOP defaults exactly as the
 * documents' precedence rules dictate.
 */

export interface Citation {
  docId: string;
  section: string;
}

export interface CancellationResult {
  order_id: string;
  canCancel: boolean;
  feeInr: number | null;
  action: "cancel_free" | "cancel_with_fee" | "return_to_origin" | "cannot_cancel" | "unknown_order";
  reasons: string[];
  citations: Citation[];
  waiverApplied: boolean;
  minutesSinceBooking: number;
}

export interface ServiceCreditResult {
  order_id: string;
  eligibleState: "eligible" | "not_eligible" | "insufficient_information";
  amountInr: number | null;
  reasons: string[];
  approvalRequired: boolean;
  monthlyCapInr: number | null;
  citations: Citation[];
  delayMinutesPastWindow: number | null;
}

function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60_000);
}

let sopIdCache: string | null = null;
function sopDocId(): string {
  if (!sopIdCache) {
    sopIdCache = allDocMetas().find((d) => d.type === "SOP" && d.status === "CURRENT")?.doc_id ?? "UNKNOWN-SOP";
  }
  return sopIdCache;
}

export function computeCancellation(orderId: string): CancellationResult {
  const order = orderById(orderId);
  if (!order) {
    return {
      order_id: orderId,
      canCancel: false,
      feeInr: null,
      action: "unknown_order",
      reasons: [`Order ${orderId} not found in the dataset snapshot`],
      citations: [],
      waiverApplied: false,
      minutesSinceBooking: 0,
    };
  }
  return evaluateCancellation(order, contractFor(order.account_id));
}

/** Pure core — testable with arbitrary fixtures. */
export function evaluateCancellation(order: Order, ct?: ContractTerms, now: Date = SNAPSHOT_TIME): CancellationResult {
  const policy = getPolicyModel().policy;
  const citations: Citation[] = [{ docId: sopDocId(), section: "1. Order cancellation" }];
  // The decision moment is when cancellation was requested (falls back to now/snapshot).
  const decisionAt = order.cancellation_requested_at
    ? new Date(order.cancellation_requested_at.replace(" ", "T") + "+05:30")
    : now;
  const bookedAt = new Date(order.booked_at.replace(" ", "T") + "+05:30");
  const mins = minutesBetween(bookedAt, decisionAt);

  switch (order.status) {
    case "DRAFT":
      return { order_id: order.order_id, canCancel: true, feeInr: 0, action: "cancel_free", reasons: ["DRAFT orders may be cancelled with no fee"], citations, waiverApplied: false, minutesSinceBooking: mins };
    case "PICKED_UP":
      return { order_id: order.order_id, canCancel: false, feeInr: null, action: "return_to_origin", reasons: ["Shipment already picked up — direct cancellation is not possible; the return-to-origin workflow applies"], citations, waiverApplied: false, minutesSinceBooking: mins };
    case "DELIVERED":
      return { order_id: order.order_id, canCancel: false, feeInr: null, action: "cannot_cancel", reasons: ["Delivered shipments cannot be cancelled"], citations, waiverApplied: false, minutesSinceBooking: mins };
    case "BOOKED":
      break;
  }

  if (ct?.cancellationWaiver?.waived) {
    citations.push({ docId: ct.docId, section: "Shipment cancellation" });
    return {
      order_id: order.order_id,
      canCancel: true,
      feeInr: 0,
      action: "cancel_free",
      reasons: [
        `Signed customer agreement waives cancellation fees for any BOOKED shipment before pickup (booking age ${mins} min does not matter under the waiver)`,
      ],
      citations,
      waiverApplied: true,
      minutesSinceBooking: mins,
    };
  }
  if (ct && ct.cancellationWaiver && !ct.cancellationWaiver.waived) {
    citations.push({ docId: ct.docId, section: "Cancellation terms" });
  }

  if (mins <= policy.cancellation.freeWindowMin) {
    return {
      order_id: order.order_id,
      canCancel: true,
      feeInr: 0,
      action: "cancel_free",
      reasons: [`Within the ${policy.cancellation.freeWindowMin}-minute free window (${mins} min since booking)`],
      citations,
      waiverApplied: false,
      minutesSinceBooking: mins,
    };
  }
  return {
    order_id: order.order_id,
    canCancel: true,
    feeInr: policy.cancellation.lateFeeInr,
    action: "cancel_with_fee",
    reasons: [
      `Booking age ${mins} min exceeds the ${policy.cancellation.freeWindowMin}-minute free window`,
      `Standard late-cancellation fee INR ${policy.cancellation.lateFeeInr} applies${policy.cancellation.waiverByAgreementClause ? " unless a signed agreement waives it" : ""}`,
    ],
    citations,
    waiverApplied: false,
    minutesSinceBooking: mins,
  };
}

export function computeServiceCredit(orderId: string): ServiceCreditResult {
  const order = orderById(orderId);
  if (!order) {
    return {
      order_id: orderId,
      eligibleState: "insufficient_information",
      amountInr: null,
      reasons: [`Order ${orderId} not found in the dataset snapshot`],
      approvalRequired: false,
      monthlyCapInr: null,
      citations: [],
      delayMinutesPastWindow: null,
    };
  }
  const ct = contractFor(order.account_id);
  return evaluateServiceCredit(order, ct);
}

/** Pure core — testable with arbitrary fixtures. */
export function evaluateServiceCredit(
  order: Order,
  ct?: ContractTerms,
  now: Date = SNAPSHOT_TIME
): ServiceCreditResult {
  const policy = getPolicyModel().policy;
  const cap = ct?.monthlyCreditCapInr ?? null;

  const citations: Citation[] = [{ docId: sopDocId(), section: "2. Failed-pickup service credits" }];
  const thresholdHours = ct?.failedPickupCredit?.thresholdHours ?? policy.serviceCredit.delayThresholdHours;
  if (ct?.failedPickupCredit) citations.push({ docId: ct.docId, section: "Failed-pickup credits" });

  let delayMin: number | null = null;
  if (order.pickup_window_end) {
    const windowEnd = new Date(order.pickup_window_end.replace(" ", "T") + "+05:30");
    delayMin = Math.max(0, Math.round((now.getTime() - windowEnd.getTime()) / 60_000));
  }
  const delayText =
    delayMin === null
      ? "no scheduled pickup window on record"
      : `${Math.floor(delayMin / 60)}h ${delayMin % 60}m past the window end`;

  if (order.pickup_actual_at) {
    return result(
      "not_eligible",
      null,
      [`Pickup was confirmed at ${order.pickup_actual_at} — this is not a failed pickup (${delayText})`],
      [],
      delayMin,
      cap
    );
  }

  const reasons: string[] = [];
  let insufficient = false;

  if (!order.pickup_window_end) {
    insufficient = true;
    reasons.push("No scheduled pickup window recorded for this order");
  } else {
    reasons.push(`Pickup is ${Math.floor(delayMin! / 60)}h ${delayMin! % 60}m past the window end (credit threshold: more than ${thresholdHours}h)`);
  }

  if (order.customer_fault === true) {
    reasons.push("Customer-caused issue recorded — credit conditions are not met");
    return result(insufficient ? "insufficient_information" : "not_eligible", null, reasons, [], delayMin, cap);
  }
  if (order.carrier_fault !== true) {
    // SOP: do not promise a credit when carrier fault is unknown — hard stop even past the delay threshold.
    reasons.push("Carrier fault is not established in the data — a credit cannot be promised until verified");
    return result("insufficient_information", null, reasons, [], delayMin, cap);
  }
  reasons.push("Carrier fault confirmed in operational data");

  if (delayMin === null) {
    reasons.push("Pickup timing cannot be assessed without a scheduled window");
    return result("insufficient_information", null, reasons, [], null, cap);
  }
  if (delayMin <= thresholdHours * 60) {
    reasons.push(`Delay does not exceed the ${thresholdHours}-hour threshold`);
    return result("not_eligible", null, reasons, [], delayMin, cap);
  }

  const amountInr = ct?.failedPickupCredit
    ? ct.failedPickupCredit.amountInr
    : Math.min(
        policy.serviceCredit.defaultCapInr,
        Math.round((policy.serviceCredit.defaultPctOfFee / 100) * order.shipment_fee_inr)
      );
  reasons.push(`Computed credit INR ${amountInr}${ct?.failedPickupCredit ? " (contract fixed-amount clause)" : ` (lower of INR ${policy.serviceCredit.defaultCapInr} or ${policy.serviceCredit.defaultPctOfFee}% of the INR ${order.shipment_fee_inr} shipment fee)`}`);

  return result("eligible", amountInr, reasons, [], delayMin, cap);

  // -------------------------------------------------------------- helpers
  function result(
    state: "eligible" | "not_eligible" | "insufficient_information",
    amount: number | null,
    rs: string[],
    extraCitations: Citation[],
    delay: number | null,
    monthlyCap: number | null
  ): ServiceCreditResult {
    return {
      order_id: order.order_id,
      eligibleState: state,
      amountInr: amount,
      reasons: rs,
      approvalRequired:
        amount !== null && policy.approvalThresholdInr !== null && amount > policy.approvalThresholdInr,
      monthlyCapInr: monthlyCap,
      citations: [...citations, ...extraCitations],
      delayMinutesPastWindow: delay,
    };
  }
}
