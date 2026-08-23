export type Role = "analyst" | "agent" | "manager";

export const ROLE_LABELS: Record<Role, string> = {
  analyst: "Read-only Analyst",
  agent: "Support Agent",
  manager: "Ops Manager",
};

export type Capability =
  | "data:read"
  | "docs:search"
  | "engines:run"
  | "insights:view"
  | "action:create_escalation"
  | "action:update_ticket"
  | "action:create_task";

const MATRIX: Record<Role, Capability[]> = {
  analyst: ["data:read", "docs:search", "engines:run", "insights:view"],
  agent: [
    "data:read",
    "docs:search",
    "engines:run",
    "insights:view",
    "action:create_escalation",
    "action:update_ticket",
    "action:create_task",
  ],
  manager: [
    "data:read",
    "docs:search",
    "engines:run",
    "insights:view",
    "action:create_escalation",
    "action:update_ticket",
    "action:create_task",
  ],
};

/** Credits above this INR amount require Ops Manager approval to execute (SOP v4 §3). */
export const CREDIT_APPROVAL_THRESHOLD_INR = 1000;

export function can(role: Role, capability: Capability): boolean {
  return MATRIX[role].includes(capability);
}

export class ForbiddenError extends Error {
  constructor(public capability: Capability, public role: Role) {
    super(`Role "${role}" is not permitted to perform "${capability}"`);
    this.name = "ForbiddenError";
  }
}

/** Enforce at tool-execution time — never via prompt instructions alone. */
export function requireCapability(role: Role, capability: Capability): void {
  if (!can(role, capability)) throw new ForbiddenError(capability, role);
}
