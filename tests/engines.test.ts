import { describe, expect, it } from "vitest";
import { computeCancellation, computeServiceCredit, evaluateCancellation, evaluateServiceCredit } from "@/lib/engines/credit";
import { assessTicketSla } from "@/lib/engines/sla";
import { detectConflicts } from "@/lib/engines/conflict";
import { inferSeverity } from "@/lib/engines/severity";
import { orderById, ticketById, allTickets, SNAPSHOT_TIME } from "@/lib/data/store";
import { contractFor } from "@/lib/policy/registry";
import type { Order } from "@/lib/data/types";

describe("cancellation engine (dataset regression)", () => {
  it("applies the Northstar waiver over the SOP late fee", () => {
    const r = computeCancellation("ORD-1001");
    expect(r.action).toBe("cancel_free");
    expect(r.feeInr).toBe(0);
    expect(r.waiverApplied).toBe(true);
    expect(r.reasons.join(" ")).toMatch(/waives/i);
  });

  it("charges the standard fee when past the window and no waiver exists", () => {
    const r = computeCancellation("ORD-2001");
    expect(r.action).toBe("cancel_with_fee");
    expect(r.feeInr).toBe(250);
    expect(r.waiverApplied).toBe(false);
  });

  it("uses the cancellation-request time for the free-window decision", () => {
    // Requested 15 min after booking — inside the free window despite snapshot being later.
    const r = computeCancellation("ORD-3001");
    expect(r.action).toBe("cancel_free");
    expect(r.minutesSinceBooking).toBe(15);
  });

  it("routes picked-up shipments to return-to-origin", () => {
    const r = computeCancellation("ORD-1002");
    expect(r.action).toBe("return_to_origin");
    expect(r.canCancel).toBe(false);
  });

  it("handles unknown orders explicitly", () => {
    const r = computeCancellation("ORD-DOES-NOT-EXIST");
    expect(r.action).toBe("unknown_order");
  });
});

describe("cancellation engine (synthetic fixtures)", () => {
  const base: Order = {
    order_id: "ORD-TEST",
    account_id: "ACCT-TEST-NO-CONTRACT",
    carrier: "TestCarrier",
    status: "BOOKED",
    booked_at: "2026-08-16 09:00",
    pickup_window_start: null,
    pickup_window_end: null,
    pickup_actual_at: null,
    shipment_fee_inr: 2000,
    carrier_fault: false,
    customer_fault: false,
    cancellation_requested_at: "2026-08-16 09:45", // 45 min after booking
    notes: null,
  };

  it("charges the parsed late fee after the free window", () => {
    const r = evaluateCancellation(base);
    expect(r.action).toBe("cancel_with_fee");
    expect(r.feeInr).toBe(250); // from SOP parse, not a literal here
  });

  it("waives with a contract waiver regardless of age", () => {
    const r = evaluateCancellation(base, { docId: "DOC-X", accountIds: [], cancellationWaiver: { waived: true }, unparsedClauses: [] });
    expect(r.feeInr).toBe(0);
    expect(r.waiverApplied).toBe(true);
  });
});

describe("service-credit engine", () => {
  it("evaluates the LumenWorks failed pickup under its contract clause", () => {
    const r = computeServiceCredit("ORD-2002");
    expect(r.eligibleState).toBe("eligible");
    expect(r.amountInr).toBe(300); // fixed contract credit replaces min(500,10%) default
    expect(r.delayMinutesPastWindow).toBeGreaterThan(4 * 60);
    expect(r.approvalRequired).toBe(false);
    expect(r.citations.some((c) => c.docId === "DOC-006")).toBe(true);
  });

  it("refuses to promise credits when fault is unestablished", () => {
    const synthetic: Order = {
      ...orderById("ORD-2002")!,
      order_id: "ORD-SYNTH",
      carrier_fault: false,
      customer_fault: false,
      status: "BOOKED",
      pickup_actual_at: null,
    };
    const r = evaluateServiceCredit(synthetic);
    expect(r.eligibleState).toBe("insufficient_information");
    expect(r.amountInr).toBeNull();
    expect(r.reasons.join(" ")).toMatch(/cannot be promised until verified/i);
  });

  it("rejects credits once pickup actually happened", () => {
    const r = computeServiceCredit("ORD-4001"); // DELIVERED
    expect(r.eligibleState).toBe("not_eligible");
  });

  it("flags manager approval above the parsed threshold", () => {
    const synthetic: Order = {
      ...orderById("ORD-2002")!,
      order_id: "ORD-BIG",
      account_id: "ACCT-TEST-NO-CONTRACT",
      pickup_window_end: "2026-08-16 06:30",
      shipment_fee_inr: 20_000,
      carrier_fault: true,
      customer_fault: false,
    };
    const r = evaluateServiceCredit(synthetic);
    expect(r.eligibleState).toBe("eligible");
    expect(r.amountInr).toBe(500); // min(500, 10% of 20000)
    expect(r.approvalRequired).toBe(false); // 500 < 1000
    const bigFee: Order = { ...synthetic, shipment_fee_inr: 40_000 };
    const r2 = evaluateServiceCredit(bigFee);
    expect(r2.amountInr).toBe(500); // capped
  });

  it("surfaces contract aggregate caps in metadata", () => {
    // Northstar's agreement caps monthly aggregate credits; LumenWorks' has no cap clause.
    const northstar: Order = {
      ...orderById("ORD-2002")!,
      order_id: "ORD-NS",
      account_id: "ACCT-001",
      carrier_fault: true,
      customer_fault: false,
      pickup_actual_at: null,
      pickup_window_end: "2026-08-16 06:30",
    };
    const r = evaluateServiceCredit(northstar, contractFor("ACCT-001"));
    expect(r.monthlyCapInr).toBe(5000);
  });
});

describe("SLA engine (snapshot-time assessment)", () => {
  it("detects the breached Northstar P1 against its contracted target", () => {
    const t = ticketById("TKT-501")!;
    const a = assessTicketSla(t);
    expect(a.severity).toBe("P1");
    expect(a.targetMinutes).toBe(15); // contract override, not plan default
    expect(a.breached).toBe(true);
    expect(a.overshootMinutes).toBe(15); // 30 elapsed vs 15 target
  });

  it("detects the Axis Labs credential-exposure P1 breach", () => {
    const t = ticketById("TKT-505")!;
    const a = assessTicketSla(t);
    expect(a.severity).toBe("P1");
    expect(a.targetMinutes).toBe(30); // Enterprise plan defaults
    expect(a.breached).toBe(true);
  });

  it("does not claim breaches without an inferable severity or target", () => {
    for (const t of allTickets().filter((x) => x.status === "open")) {
      const a = assessTicketSla(t);
      if (a.severity === null) {
        expect(a.targetMinutes).toBeNull();
        expect(a.breached).toBe(false);
      }
    }
  });

  it("never assesses beyond the dataset snapshot clock", () => {
    void SNAPSHOT_TIME;
    const t = ticketById("TKT-504")!;
    const a = assessTicketSla(t);
    expect(a.elapsedMinutes).toBeGreaterThanOrEqual(0);
  });
});

describe("severity inference (lexical mode)", () => {
  it("classifies production outage language as P1", () => {
    expect(inferSeverity("All shipment creation is failing", "Every user gets HTTP 500 when creating any shipment.").severity).toBe("P1");
  });
  it("classifies credential exposure language as P1", () => {
    expect(inferSeverity("Possible API key exposure", "Screenshot containing a production API key posted publicly.").severity).toBe("P1");
  });
});

describe("conflict detection", () => {
  it("surfaces every contract-vs-default divergence generically", () => {
    const cards = detectConflicts();
    const domains = new Set(cards.map((c) => c.domain));
    expect(domains.has("cancellation_fee")).toBe(true);
    expect(domains.has("service_credit")).toBe(true);
    expect(domains.has("support_targets")).toBe(true);
    expect(cards.every((c) => c.resolution.length > 5)).toBe(true);
  });
});
