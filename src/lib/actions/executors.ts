import { store } from "./store";
import type { ActionIntent } from "./intents";
import type { ExecutedAction } from "./store";

/**
 * Applies a verified intent to the mock operational state.
 * This is the single mutation point for guarded actions.
 */
export function executeIntent(intent: ActionIntent): ExecutedAction {
  const s = store();
  if (s.consumedIntents.has(intent.id)) {
    throw new Error("Action already executed (idempotency guard)");
  }
  s.consumedIntents.add(intent.id);

  const record: ExecutedAction = {
    id: intent.id,
    action: intent.action,
    args: intent.args,
    role: intent.role,
    executedAt: new Date().toISOString(),
  };
  switch (intent.action) {
    case "create_escalation":
      s.escalations.push({ ...record, action: "create_escalation" });
      break;
    case "update_ticket":
      s.ticketUpdates.push({ ...record, action: "update_ticket" });
      break;
    case "create_task":
      s.tasks.push({ ...record, action: "create_task" });
      break;
  }
  return record;
}

export function receiptFor(record: ExecutedAction): string {
  const args = record.args as Record<string, string | undefined>;
  switch (record.action) {
    case "create_escalation":
      return `Escalation ${record.id} recorded for ticket ${args.ticket_id ?? "?"} at ${record.executedAt}`;
    case "update_ticket":
      return `Ticket ${args.ticket_id ?? "?"} update ${record.id} recorded at ${record.executedAt}`;
    case "create_task":
      return `Follow-up task ${record.id} "${args.title ?? ""}" created at ${record.executedAt}`;
  }
}
