import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import type { Role } from "@/lib/auth/rbac";

/**
 * Stateless two-phase action intents.
 *
 * A guarded tool never mutates state on first call. It returns a signed intent;
 * the UI renders a Confirm card; POST /api/actions/confirm re-verifies signature,
 * TTL and role before executing. This works on ephemeral serverless runtimes
 * with zero infrastructure — the HMAC makes the payload tamper-proof and the
 * TTL bounds replay risk.
 */

export const INTENT_TTL_MS = 10 * 60 * 1000;

export type ActionType = "create_escalation" | "update_ticket" | "create_task";

export interface ActionIntent {
  id: string;
  action: ActionType;
  role: string;
  /** Fully-typed arguments captured at intent time; executed verbatim on confirm. */
  args: Record<string, unknown>;
  summary: string;
  createdAt: number;
}

function secret(): string {
  return `${env().APP_SECRET}:intent`;
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

export function createIntent(action: ActionType, args: Record<string, unknown>, summary: string, role: Role): { intent: ActionIntent; token: string } {
  const intent: ActionIntent = {
    id: `ACT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    action,
    role,
    args,
    summary,
    createdAt: Date.now(),
  };
  const body = Buffer.from(JSON.stringify(intent)).toString("base64url");
  return { intent, token: `${body}.${sign(body)}` };
}

export function verifyIntent(token: string): ActionIntent | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const a = Buffer.from(token.slice(dot + 1));
  const b = Buffer.from(sign(body));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const intent = JSON.parse(Buffer.from(body, "base64url").toString()) as ActionIntent;
    if (Date.now() - intent.createdAt > INTENT_TTL_MS) return null;
    if (!["create_escalation", "update_ticket", "create_task"].includes(intent.action)) return null;
    return intent;
  } catch {
    return null;
  }
}
