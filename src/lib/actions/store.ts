import type { ActionIntent } from "./intents";

/**
 * Mock persistence for executed actions + audit trail.
 *
 * Deliberately in-memory: the data pack is a static snapshot, and the
 * submission runs on ephemeral hosting. The interface below is the seam —
 * swapping in Postgres/Redis means implementing this contract; nothing
 * else in the app changes.
 */

export interface ExecutedAction {
  id: string;
  action: ActionIntent["action"];
  args: Record<string, unknown>;
  role: string;
  executedAt: string;
}

export interface AuditEntry {
  ts: string;
  actor: string;
  role: string;
  tool: string;
  input: Record<string, unknown>;
  durationMs: number;
  outcome: "ok" | "error";
  error?: string;
}

interface State {
  actions: Map<string, ExecutedAction>;
  /** Idempotency: an intent id can only execute once. */
  consumedIntents: Set<string>;
  escalations: Array<ExecutedAction & { action: "create_escalation" }>;
  ticketUpdates: Array<ExecutedAction & { action: "update_ticket" }>;
  tasks: Array<ExecutedAction & { action: "create_task" }>;
  audit: AuditEntry[];
  /** Rate limiting: sliding window of request timestamps per session. */
  hits: number[];
}

declare global {
  var __ppState: State | undefined; // globalThis singleton survives Next.js dev HMR
}

function fresh(): State {
  return {
    actions: new Map(),
    consumedIntents: new Set(),
    escalations: [],
    ticketUpdates: [],
    tasks: [],
    audit: [],
    hits: [],
  };
}

export function store(): State {
  if (!globalThis.__ppState) globalThis.__ppState = fresh();
  return globalThis.__ppState;
}

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;

export function rateLimit(sessionId: string): boolean {
  const s = store();
  const now = Date.now();
  s.hits = s.hits.filter((t) => now - t < RATE_WINDOW_MS);
  void sessionId;
  if (s.hits.length >= RATE_MAX) return false;
  s.hits.push(now);
  return true;
}
