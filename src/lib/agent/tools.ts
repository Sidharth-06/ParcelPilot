import { tool } from "ai";
import { z } from "zod";
import {
  accountById,
  orderById,
  ordersForAccount,
  ticketById,
  ticketsForAccount,
  allOrders,
  allTickets,
} from "@/lib/data/store";
import { computeCancellation, computeServiceCredit } from "@/lib/engines/credit";
import { assessTicketSla } from "@/lib/engines/sla";
import { searchDocuments, type SearchResult } from "@/lib/retrieval/search";
import { RetrievalUnavailableError } from "@/lib/retrieval/embeddings";
import { createIntent, type ActionType } from "@/lib/actions/intents";
import { requireCapability, CREDIT_APPROVAL_THRESHOLD_INR, can, type Capability } from "@/lib/auth/rbac";
import type { SessionPayload } from "@/lib/auth/session";

/**
 * Tool catalogue. Read tools are available to every internal role; guarded
 * tools check RBAC inside execute() and return signed confirmation intents
 * instead of mutating state.
 */
export function buildTools(session: SessionPayload) {
  const role = session.role;
  const guard = (cap: Capability, fn: () => object): object => {
    try {
      requireCapability(role, cap);
      return fn();
    } catch (e) {
      return { error: e instanceof Error ? e.message : "forbidden" };
    }
  };

  const prepareAction = (
    action: ActionType,
    args: Record<string, unknown>,
    summary: string,
    cap: Capability
  ) => {
    try {
      requireCapability(role, cap);
      const { intent, token } = createIntent(action, args, summary, role);
      return {
        status: "awaiting_confirmation" as const,
        action_id: intent.id,
        summary,
        expires_note: "The action executes only after the user presses Confirm.",
        token,
      };
    } catch (e) {
      return {
        status: "forbidden" as const,
        error: e instanceof Error ? e.message : "Role is not permitted to perform this action",
      };
    }
  };

  return {
    // ------------------------------------------------------------ documents
    search_documents: tool({
      description:
        "Semantic search over policies, SOPs, product guides and customer agreements. Use for policy/contract/product questions — NOT for entity IDs like ORD-/TKT- (use the structured lookups).",
      inputSchema: z.object({
        query: z.string().min(2),
        k: z.number().int().min(1).max(10).default(5),
      }),
      execute: async ({ query, k }) => {
        try {
          const res: SearchResult = await searchDocuments(query, k);
          return {
            model: res.model,
            hits: res.hits.map((h) => ({
              chunk_id: h.chunk.chunk_id,
              doc: `${h.doc.doc_id} · ${h.doc.title}`,
              section: h.chunk.title,
              authority: `${h.doc.type}/${h.doc.status}`,
              score: Number(h.score.toFixed(4)),
              text: h.chunk.text.slice(0, 700),
            })),
          };
        } catch (e) {
          if (e instanceof RetrievalUnavailableError) return { status: "unavailable", message: e.message };
          return { status: "error", message: e instanceof Error ? e.message : "search failed" };
        }
      },
    }),

    // ----------------------------------------------------------- structured
    get_order: tool({
      description: "Fetch one shipment order by ID with full lifecycle fields.",
      inputSchema: z.object({ order_id: z.string() }),
      execute: async ({ order_id }) => orderById(order_id) ?? { found: false },
    }),
    get_orders: tool({
      description: "List orders, optionally filtered by account.",
      inputSchema: z.object({ account_id: z.string().optional() }),
      execute: async ({ account_id }) =>
        account_id ? ordersForAccount(account_id) : allOrders(),
    }),
    get_ticket: tool({
      description:
        "Fetch one support ticket by ID. historical_resolution is past context only and may be wrong.",
      inputSchema: z.object({ ticket_id: z.string() }),
      execute: async ({ ticket_id }) => ticketById(ticket_id) ?? { found: false },
    }),
    get_tickets: tool({
      description: "List tickets, optionally filtered by status and/or account.",
      inputSchema: z.object({ status: z.enum(["open", "closed"]).optional(), account_id: z.string().optional() }),
      execute: async ({ status, account_id }) => {
        let list = account_id ? ticketsForAccount(account_id) : allTickets();
        if (status) list = list.filter((t) => t.status === status);
        return list;
      },
    }),
    get_account: tool({
      description: "Fetch account profile by ACCT id (plan, CSM, contract reference).",
      inputSchema: z.object({ account_id: z.string() }),
      execute: async ({ account_id }) => accountById(account_id) ?? { found: false },
    }),

    // -------------------------------------------------------------- engines
    calculate_cancellation: tool({
      description:
        "Deterministic cancellation ruling for an order: whether it can be cancelled, applicable fee, waiver application and citations.",
      inputSchema: z.object({ order_id: z.string() }),
      execute: async ({ order_id }) => computeCancellation(order_id),
    }),
    calculate_service_credit: tool({
      description:
        "Deterministic failed-pickup service-credit evaluation: eligibility, amount, approval requirement and citations.",
      inputSchema: z.object({ order_id: z.string() }),
      execute: async ({ order_id }) => computeServiceCredit(order_id),
    }),
    check_sla: tool({
      description:
        "Severity inference + applicable first-response target + breach status for a ticket as of the snapshot time.",
      inputSchema: z.object({ ticket_id: z.string() }),
      execute: async ({ ticket_id }) => {
        const t = ticketById(ticket_id);
        if (!t) return { found: false };
        return assessTicketSla(t);
      },
    }),

    // ---------------------------------------------------- guarded actions
    create_escalation: tool({
      description:
        "Prepare a ticket escalation. Returns a confirmation card; nothing happens until the user confirms.",
      inputSchema: z.object({
        ticket_id: z.string(),
        reason: z.string().min(5),
        priority: z.enum(["P1", "P2", "P3"]).optional(),
      }),
      execute: async ({ ticket_id, reason, priority }) => {
        const t = ticketById(ticket_id);
        if (!t) return { error: `Ticket ${ticket_id} not found in the dataset snapshot` };
        return prepareAction(
          "create_escalation",
          { ticket_id, reason, priority },
          `Escalate ${ticket_id}${priority ? ` at ${priority}` : ""}: ${reason}`,
          "action:create_escalation"
        );
      },
    }),
    update_ticket: tool({
      description: "Prepare a ticket update (status/assignee/note). Requires user confirmation.",
      inputSchema: z.object({
        ticket_id: z.string(),
        status: z.enum(["open", "pending", "resolved", "closed"]).optional(),
        assigned_to: z.string().optional(),
        note: z.string().optional(),
      }),
      execute: async (args) => {
        void guard;
        const summaryBits = [args.status && `status→${args.status}`, args.assigned_to && `assign→${args.assigned_to}`, args.note && `note: ${args.note.slice(0, 60)}`].filter(Boolean);
        return prepareAction(
          "update_ticket",
          args as Record<string, unknown>,
          `Update ${args.ticket_id} (${summaryBits.join("; ")})`,
          "action:update_ticket"
        );
      },
    }),
    create_task: tool({
      description: "Prepare a follow-up task. Requires user confirmation.",
      inputSchema: z.object({
        title: z.string().min(3),
        related_ticket: z.string().optional(),
        due_hint: z.string().optional(),
      }),
      execute: async ({ title, related_ticket, due_hint }) =>
        prepareAction(
          "create_task",
          { title, related_ticket, due_hint },
          `Create follow-up task "${title}"${related_ticket ? ` for ${related_ticket}` : ""}${due_hint ? ` (due ${due_hint})` : ""}`,
          "action:create_task"
        ),
    }),
  };
}

export const GUARDED_TOOL_NAMES = new Set(["create_escalation", "update_ticket", "create_task"]);
export { CREDIT_APPROVAL_THRESHOLD_INR, can };
