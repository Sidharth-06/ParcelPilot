import { accountById, allDocMetas, SNAPSHOT_TIME } from "@/lib/data/store";
import { contractFor, getPolicyModel } from "@/lib/policy/registry";
import type { Severity } from "@/lib/policy/parse";
import { inferSeverityFromTicketId } from "./severity";
import { vectorsFile } from "@/lib/retrieval/vectors";
import type { Ticket } from "@/lib/data/types";

/**
 * SLA engine. Response targets come exclusively from the policy registry
 * (contract override → current-policy plan matrix). Business-hours math uses
 * one documented operational calendar (Mon–Fri 09:00–18:00 IST) — an
 * assumption the documents do not define; surfaced in ARCHITECTURE.md.
 */

export interface BusinessCalendar {
  workdays: number[]; // 0=Sun
  startMin: number;
  endMin: number;
  tzOffsetMin: number;
}

export const IST_CALENDAR: BusinessCalendar = {
  workdays: [1, 2, 3, 4, 5],
  startMin: 9 * 60,
  endMin: 18 * 60,
  tzOffsetMin: 330,
};

/** Parse "YYYY-MM-DD HH:mm" as calendar-local time in the dataset timezone. */
export function parseLocal(ts: string, tzOffsetMin = IST_CALENDAR.tzOffsetMin): Date {
  const [d, t = "00:00"] = ts.split(" ");
  const [Y, M, D] = d.split("-").map(Number);
  const [h, m] = t.split(":").map(Number);
  return new Date(Date.UTC(Y, M - 1, D, h, m) - tzOffsetMin * 60_000);
}

export function businessMinutesBetween(start: Date, end: Date, cal: BusinessCalendar): number {
  let total = 0;
  const startLocalMs = start.getTime() + cal.tzOffsetMin * 60_000;
  const endMs = end.getTime();
  // Walk day windows from the start date forward.
  let windowStart = Date.UTC(
    new Date(startLocalMs).getUTCFullYear(),
    new Date(startLocalMs).getUTCMonth(),
    new Date(startLocalMs).getUTCDate()
  );
  for (let i = 0; i < 800 && windowStart <= endMs + cal.tzOffsetMin * 60_000; i++) {
    const weekday = new Date(windowStart).getUTCDay();
    if (cal.workdays.includes(weekday)) {
      const ws = windowStart - cal.tzOffsetMin * 60_000 + cal.startMin * 60_000;
      const we = ws + (cal.endMin - cal.startMin) * 60_000;
      const s = Math.max(ws, start.getTime());
      const e = Math.min(we, endMs);
      if (e > s) total += (e - s) / 60_000;
    }
    windowStart += 86_400_000;
  }
  return Math.round(total);
}

function currentPolicyDocId(): string | null {
  return allDocMetas().find((d) => d.type === "POLICY" && d.status === "CURRENT")?.doc_id ?? null;
}

export interface SlaAssessment {
  ticket_id: string;
  severity: Severity | null;
  severityMethod: string;
  targetMinutes: number | null;
  businessHours: boolean;
  elapsedMinutes: number;
  breached: boolean;
  overshootMinutes: number;
  sourceDocId: string | null;
}

export function assessTicketSla(ticket: Ticket): SlaAssessment {
  const text = `${ticket.subject}. ${ticket.description}`;
  const sev = inferSeverityFromTicketId(ticket.ticket_id, text, (id) =>
    vectorsFile().collections.tickets?.find((t) => t.id === id)?.vec
  );
  const account = accountById(ticket.account_id);
  const ct = contractFor(ticket.account_id);

  let target: { minutes: number; businessHours: boolean; sourceDocId: string | null } | null = null;
  if (sev.severity && account && ct?.slaOverrides?.[sev.severity]) {
    target = { ...ct.slaOverrides[sev.severity], sourceDocId: ct.docId };
  } else if (sev.severity && account) {
    const def = getPlanTarget(account.plan, sev.severity);
    if (def) target = { ...def, sourceDocId: currentPolicyDocId() };
  }

  let elapsedMinutes = 0;
  if (target) {
    const start = parseLocal(ticket.created_at);
    if (target.businessHours) {
      elapsedMinutes = businessMinutesBetween(start, SNAPSHOT_TIME, IST_CALENDAR);
    } else {
      // 24x7-style targets count wall-clock time
      elapsedMinutes = Math.round((SNAPSHOT_TIME.getTime() - start.getTime()) / 60_000);
    }
  }

  const breached = target !== null && elapsedMinutes > target.minutes;
  return {
    ticket_id: ticket.ticket_id,
    severity: sev.severity,
    severityMethod: sev.method,
    targetMinutes: target?.minutes ?? null,
    businessHours: target?.businessHours ?? true,
    elapsedMinutes,
    breached,
    overshootMinutes: breached ? elapsedMinutes - target!.minutes : 0,
    sourceDocId: target?.sourceDocId ?? null,
  };
}

function getPlanTarget(plan: string, severity: Severity) {
  return getPolicyModel().policy.defaultTargetsByPlan[plan]?.[severity] ?? null;
}
