import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { verifyIntent, INTENT_TTL_MS } from "@/lib/actions/intents";
import { executeIntent, receiptFor } from "@/lib/actions/executors";
import { requireCapability, type Capability } from "@/lib/auth/rbac";

const ACTION_CAPABILITY: Record<string, Capability> = {
  create_escalation: "action:create_escalation",
  update_ticket: "action:update_ticket",
  create_task: "action:create_task",
};

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const intent = verifyIntent(token);
  if (!intent) {
    return NextResponse.json({ error: "Invalid or expired action token", ttlMs: INTENT_TTL_MS }, { status: 400 });
  }
  // Re-verify role at execution time — the confirm click never grants new rights.
  const cap = ACTION_CAPABILITY[intent.action];
  try {
    requireCapability(session.role as never, cap);
  } catch {
    return NextResponse.json({ error: "Your role cannot execute this action" }, { status: 403 });
  }
  // Defence in depth: the intent itself must have been created under a permitted role.
  try {
    requireCapability(intent.role as never, cap);
  } catch {
    return NextResponse.json({ error: "Action was not created by an authorised role" }, { status: 403 });
  }

  try {
    const record = executeIntent(intent);
    return NextResponse.json({ ok: true, record, receipt: receiptFor(record) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "execution failed" }, { status: 409 });
  }
}
