import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { can, requireCapability, ForbiddenError } from "@/lib/auth/rbac";
import { createIntent, verifyIntent, INTENT_TTL_MS } from "@/lib/actions/intents";
import { executeIntent } from "@/lib/actions/executors";

describe("RBAC matrix", () => {
  it("analyst is read-only", () => {
    expect(can("analyst", "data:read")).toBe(true);
    expect(can("analyst", "engines:run")).toBe(true);
    expect(can("analyst", "action:create_escalation")).toBe(false);
    expect(can("analyst", "action:update_ticket")).toBe(false);
  });

  it("agent can prepare actions but the matrix stays explicit", () => {
    expect(can("agent", "action:create_escalation")).toBe(true);
    expect(can("agent", "action:update_ticket")).toBe(true);
  });

  it("requireCapability throws a typed error for denials", () => {
    expect(() => requireCapability("analyst", "action:update_ticket")).toThrow(ForbiddenError);
  });
});

describe("action intents (stateless two-phase confirm)", () => {
  const args = { ticket_id: "TKT-X", reason: "SLA breach requires immediate attention" };

  it("round-trips a signed intent", () => {
    const { intent, token } = createIntent("create_escalation", args, "Escalate TKT-X", "agent");
    const parsed = verifyIntent(token);
    expect(parsed?.id).toBe(intent.id);
    expect(parsed?.args).toEqual(args);
    expect(parsed?.role).toBe("agent");
  });

  it("rejects tampered tokens", () => {
    const { token } = createIntent("create_escalation", args, "s", "agent");
    const [body] = token.split(".");
    expect(verifyIntent(`${body}.deadbeefsignature`)).toBeNull();
    expect(verifyIntent(token.slice(0, -3) + "xxx")).toBeNull();
  });

  it("expires intents after the TTL", () => {
    vi.useFakeTimers();
    try {
      const { token } = createIntent("update_ticket", { ticket_id: "TKT-Y" }, "u", "manager");
      vi.setSystemTime(Date.now() + INTENT_TTL_MS + 1000);
      expect(verifyIntent(token)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("intent execution (mock store)", () => {
  it("records exactly once — idempotency guard", () => {
    const { intent } = createIntent(
      "create_task",
      { title: "Verify carrier SLA data with SwiftShip", related_ticket: "TKT-Z" },
      'Create follow-up task "Verify carrier SLA data"',
      "manager"
    );
    const rec1 = executeIntent(intent);
    expect(rec1.action).toBe("create_task");
    expect(rec1.args).toMatchObject({ related_ticket: "TKT-Z" });
    expect(() => executeIntent(intent)).toThrow(/already executed/i);
  });
});
