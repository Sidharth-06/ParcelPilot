import { describe, expect, it } from "vitest";
import { getPolicyModel, contractFor, resolveTarget } from "@/lib/policy/registry";

/**
 * Validates that every operational parameter the engines depend on is parsed
 * from the document corpus. If the data pack changes, these tests fail loudly
 * instead of letting engines run on stale assumptions.
 */
describe("policy registry (parsed from documents)", () => {
  const model = getPolicyModel();

  it("parses with zero warnings", () => {
    expect(model.policy.warnings).toEqual([]);
  });

  it("extracts severity definitions for P1..P3", () => {
    expect(model.policy.severityDefinitions.P1).toMatch(/production outage/i);
    expect(model.policy.severityDefinitions.P2).toMatch(/degraded|workaround/i);
    expect(model.policy.severityDefinitions.P3).toMatch(/how-to|configuration/i);
  });

  it("captures the source precedence sentence", () => {
    expect(model.policy.sourcePrecedenceRaw).toContain("signed customer agreement first");
  });

  it("builds the default response-target matrix per plan", () => {
    const t = model.policy.defaultTargetsByPlan;
    expect(t.Enterprise?.P1).toEqual({ minutes: 30, businessHours: false });
    expect(t.Growth?.P1).toEqual({ minutes: 120, businessHours: true });
    expect(t.Standard?.P2).toEqual({ minutes: 1440, businessHours: true });
  });

  it("derives cancellation parameters from the SOP", () => {
    expect(model.policy.cancellation.freeWindowMin).toBe(30);
    expect(model.policy.cancellation.lateFeeInr).toBe(250);
    expect(model.policy.cancellation.waiverByAgreementClause).toBe(true);
    expect(model.policy.cancellation.pickedUpAction).toBe("return-to-origin");
  });

  it("derives service-credit parameters from the SOP", () => {
    expect(model.policy.serviceCredit.delayThresholdHours).toBe(2);
    expect(model.policy.serviceCredit.defaultCapInr).toBe(500);
    expect(model.policy.serviceCredit.defaultPctOfFee).toBe(10);
    expect(model.policy.approvalThresholdInr).toBe(1000);
  });

  it("derives bulk-upload capability from the guide", () => {
    expect(model.policy.bulkUploadLimitRows).toBe(5000);
  });

  it("registers known issues incl. resolved ones", () => {
    const ids = model.policy.knownIssues.map((k) => k.ki_id);
    expect(ids).toContain("KI-208");
    expect(ids).toContain("KI-211");
    expect(ids).toContain("KI-176");
    const ki208 = model.policy.knownIssues.find((k) => k.ki_id === "KI-208")!;
    expect(ki208.status).toBe("Investigating");
    expect(ki208.workaround).toBeTruthy();
    const ki176 = model.policy.knownIssues.find((k) => k.ki_id === "KI-176")!;
    expect(ki176.status).toBe("RESOLVED");
  });

  it("parses Northstar contract overrides", () => {
    const ct = contractFor("ACCT-001")!;
    expect(ct.docId).toBeTruthy();
    expect(ct.slaOverrides?.P1).toEqual({ minutes: 15, businessHours: false });
    expect(ct.slaOverrides?.P3).toEqual({ minutes: 480, businessHours: true });
    expect(ct.cancellationWaiver).toEqual({ waived: true });
    expect(ct.monthlyCreditCapInr).toBe(5000);
  });

  it("parses LumenWorks contract overrides", () => {
    const ct = contractFor("ACCT-002")!;
    expect(ct.slaOverrides?.P1).toEqual({ minutes: 120, businessHours: true });
    expect(ct.weekendSupportExcluded).toBe(true);
    expect(ct.cancellationWaiver).toEqual({ waived: false });
    expect(ct.failedPickupCredit).toEqual({ thresholdHours: 4, amountInr: 300 });
  });

  it("resolves targets with contract precedence over policy matrix", () => {
    const t1 = resolveTarget("Enterprise", "P1", "ACCT-001");
    expect(t1?.minutes).toBe(15); // contract override wins
    const t2 = resolveTarget("Standard", "P1", "ACCT-003"); // no contract → plan defaults
    expect(t2?.minutes).toBe(240);
    const t3 = resolveTarget("Growth", "P1", "ACCT-002"); // Lumen P1 override equals Growth default
    expect(t3?.minutes).toBe(120);
  });
});
