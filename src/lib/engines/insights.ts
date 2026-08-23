import { accountById, allDocMetas, allOrders, allTickets, ticketById } from "@/lib/data/store";
import { contractFor, getPolicyModel } from "@/lib/policy/registry";
import { cosine, vectorsFile } from "@/lib/retrieval/vectors";
import { assessTicketSla } from "./sla";

/**
 * Proactive issue detection (assessment Problem 1).
 * Every insight is derived from the compiled dataset + policy registry at
 * reference time — no ticket/order IDs are hardcoded. Correlation signals use
 * build-time embeddings; when vectors are absent those specific insights are
 * skipped rather than faked.
 */

export type InsightType = "sla_breach" | "ki_correlation" | "outage_signal" | "misguidance" | "ticket_cluster";
export type InsightLevel = "critical" | "high" | "medium";

export interface Evidence {
  kind: "ticket" | "order" | "doc" | "account";
  id: string;
}

export interface Insight {
  id: string;
  type: InsightType;
  level: InsightLevel;
  title: string;
  detail: string;
  evidence: Evidence[];
  recommendation?: string;
  chatPrompt?: string;
}

// Calibrated on the embedding space (scripts/calibrate.ts): genuine KI links
// score ≥0.85, cross-ticket duplicate pairs ≥0.85 while unrelated domain
// chatter sits below 0.79.
const KI_LINK_THRESHOLD = 0.8;
const CLUSTER_THRESHOLD = 0.85;

function vec(collection: "tickets" | "known_issues", id: string): number[] | undefined {
  return vectorsFile().collections[collection]?.find((e) => e.id === id)?.vec;
}

export function deriveInsights(): Insight[] {
  const insights: Insight[] = [];
  const tickets = allTickets();
  const open = tickets.filter((t) => t.status === "open");

  // ---- 1. SLA breaches among open tickets
  for (const t of open) {
    const a = assessTicketSla(t);
    if (!a.breached || a.severity === null) continue;
    const level: InsightLevel = a.severity === "P1" ? "critical" : a.severity === "P2" ? "high" : "medium";
    const acct = accountById(t.account_id);
    insights.push({
      id: `sla-${t.ticket_id}`,
      type: "sla_breach",
      level,
      title: `${a.severity} SLA breached on ${t.ticket_id}${acct ? ` (${acct.account_name})` : ""}`,
      detail:
        `Inferred ${a.severity} (${a.severityMethod} signal). Applicable target ${a.targetMinutes} min` +
        `${a.businessHours ? " business-hours" : ""}; elapsed ${a.elapsedMinutes} min — over by ${a.overshootMinutes} min` +
        ` as of the snapshot time.`,
      evidence: [{ kind: "ticket", id: t.ticket_id }, ...(a.sourceDocId ? [{ kind: "doc" as const, id: a.sourceDocId }] : [])],
      recommendation: a.severity === "P1" ? "Escalate immediately and confirm response to customer." : "Review and update the customer with a status plan.",
      chatPrompt: `Summarise ticket ${t.ticket_id}: severity, applicable response target, breach status, and draft the escalation note.`,
    });
  }

  // ---- 2. Known-issue correlation via embeddings
  const resolvedKis = new Set(
    getPolicyModel().policy.knownIssues.filter((k) => /resolve/i.test(k.status)).map((k) => k.ki_id)
  );
  const kiVecs =
    vectorsFile().collections.known_issues?.filter((e) => e.id.startsWith("KI-") && !resolvedKis.has(e.id)) ?? [];
  if (kiVecs.length > 0 && vectorsFile().collections.tickets?.length) {
    const byKi = new Map<string, string[]>();
    for (const t of open) {
      const tv = vec("tickets", t.ticket_id);
      if (!tv) continue;
      let best = { id: "", score: 0 };
      for (const k of kiVecs) {
        if (/RESOLVED/.test(k.id)) continue;
        const s = cosine(tv, k.vec);
        if (s > best.score) best = { id: k.id, score: s };
      }
      if (best.score >= KI_LINK_THRESHOLD) {
        const arr = byKi.get(best.id) ?? [];
        arr.push(t.ticket_id);
        byKi.set(best.id, arr);
      }
    }
    for (const [kiId, tIds] of byKi) {
      const ki = getPolicyModel().policy.knownIssues.find((k) => k.ki_id === kiId);
      if (!ki) continue;
      const accounts = [...new Set(tIds.map((id) => ticketById(id)?.account_id).filter(Boolean))];
      insights.push({
        id: `ki-${kiId}`,
        type: "ki_correlation",
        level: tIds.length > 1 ? "high" : "medium",
        title: `${tIds.length} open ticket(s) correlate with known issue ${kiId} — ${ki.title}`,
        detail:
          `${ki.status}. ${ki.description}` +
          (accounts.length ? ` Affects account(s): ${accounts.join(", ")}.` : "") +
          (ki.workaround ? ` Published workaround: ${ki.workaround}` : ""),
        evidence: [
          ...tIds.map((id) => ({ kind: "ticket" as const, id })),
          { kind: "doc" as const, id: guideDocId() },
        ],
        recommendation: ki.workaround
          ? `Share the published workaround proactively instead of re-investigating.`
          : `Investigate whether these reports share root cause with ${kiId}.`,
        chatPrompt: `Which open tickets relate to ${kiId}, what is the workaround, and which accounts are affected?`,
      });
    }
  }

  // ---- 3. Outage blast-radius signals (P1 + explicit account-wide language)
  const BLAST_RADIUS_RE = /\b(all|every)\s+(user|shipment|users|shipments)|account[- ]wide|entire account\b/i;
  for (const t of open) {
    const a = assessTicketSla(t);
    if (a.severity !== "P1" || !BLAST_RADIUS_RE.test(`${t.subject} ${t.description}`)) continue;
    const acct = accountById(t.account_id);
    const orders = ordersCountFor(t.account_id);
    insights.push({
      id: `out-${t.ticket_id}`,
      type: "outage_signal",
      level: "critical",
      title: `Account-wide failure pattern suspected on ${t.ticket_id}`,
      detail: `Ticket text indicates a blocking failure affecting the account${acct ? ` (${acct.account_name})` : ""}. The account has ${orders} shipment record(s) in the current snapshot; a creation outage blocks all new bookings.`,
      evidence: [{ kind: "ticket", id: t.ticket_id }, { kind: "account", id: t.account_id }],
      recommendation: "Treat as P1: page the on-call engineer and notify the CSM.",
      chatPrompt: `Draft an internal escalation for ${t.ticket_id} including impact, severity rationale, and next actions.`,
    });
  }

  // ---- 4. Misguided historical guidance scan (closed tickets)
  for (const t of tickets.filter((x) => x.status === "closed" && x.historical_resolution)) {
    const res = t.historical_resolution!;
    const ct = contractForTicket(t.ticket_id);
    // Claim: a cancellation fee applies to this account's BOOKED-before-pickup scenario.
    if (ct?.cancellationWaiver?.waived && /INR\s?[\d,]+/i.test(res) && /fee/i.test(res)) {
      const amountM = res.match(/INR\s?([\d,]+)/i);
      insights.push({
        id: `mis-${t.ticket_id}`,
        type: "misguidance",
        level: "high",
        title: `Historical answer on ${t.ticket_id} contradicts the signed agreement`,
        detail: `Resolution told the customer a cancellation fee of INR ${amountM?.[1] ?? "?"} applied, but the active contract waives cancellation fees for BOOKED shipments before pickup. Customers may have been overcharged or misinformed since then.`,
        evidence: [
          { kind: "ticket", id: t.ticket_id },
          { kind: "doc", id: ct.docId },
        ],
        recommendation: "Audit cancellations for this account since that date; consider a goodwill correction.",
        chatPrompt: `Explain what guidance ${t.ticket_id} gave, why it conflicts with the current contract, and what we should do about it.`,
      });
    }
    // Claim: a row limit that differs from the parsed product capability.
    const rowClaim = res.match(/([\d,]+)\s*[-\s]?\s*rows?/i);
    const limitRows = getPolicyModel().policy.bulkUploadLimitRows;
    if (rowClaim && limitRows !== null) {
      const claimed = parseInt(rowClaim[1].replace(/,/g, ""), 10);
      if (claimed !== limitRows) {
        const relatedKi = getPolicyModel().policy.knownIssues.find((k) => /bulk/i.test(k.title));
        insights.push({
          id: `mis-row-${t.ticket_id}`,
          type: "misguidance",
          level: "medium",
          title: `Historical answer on ${t.ticket_id} states an incorrect upload limit`,
          detail: `The resolution claims uploads fail because only ${claimed.toLocaleString("en-IN")} rows are supported, but the current product guide documents a supported limit of ${limitRows.toLocaleString("en-IN")} rows per CSV.` +
            (relatedKi ? ` Intermittent failures above ~3,000 rows match known issue ${relatedKi.ki_id} (${relatedKi.status}).` : ""),
        evidence: [
            { kind: "ticket", id: t.ticket_id },
            { kind: "doc", id: guideDocId() },
          ],
          recommendation: relatedKi
            ? `Correct the record and attach the ${relatedKi.ki_id} workaround.`
            : "Correct the record with the documented limit.",
          chatPrompt: `What did we previously tell customers about bulk-upload limits, and what is correct now?`,
        });
      }
    }
  }

  // ---- 5. Cross-ticket clustering (same problem surfacing repeatedly)
  const tv = vectorsFile().collections.tickets ?? [];
  if (tv.length > 1) {
    for (let i = 0; i < open.length; i++) {
      for (let j = i + 1; j < open.length; j++) {
        const a = vec("tickets", open[i].ticket_id);
        const b = vec("tickets", open[j].ticket_id);
        if (!a || !b) continue;
        const s = cosine(a, b);
        if (s >= CLUSTER_THRESHOLD) {
          insights.push({
            id: `cluster-${open[i].ticket_id}-${open[j].ticket_id}`,
            type: "ticket_cluster",
            level: "medium",
            title: `Possible duplicate effort: ${open[i].ticket_id} ↔ ${open[j].ticket_id}`,
            detail: `These two open tickets are semantically similar (${(s * 100).toFixed(0)}% embedding similarity). They may share a root cause across accounts.`,
            evidence: [
              { kind: "ticket", id: open[i].ticket_id },
              { kind: "ticket", id: open[j].ticket_id },
            ],
            recommendation: "Consider linking them under one investigation thread.",
          });
        }
      }
    }
  }

  const rank: Record<InsightLevel, number> = { critical: 0, high: 1, medium: 2 };
  return insights.sort((x, y) => rank[x.level] - rank[y.level]);
}

// ------------------------------------------------------------------ helpers

let cachedGuideDocId: string | null = null;
function guideDocId(): string {
  if (!cachedGuideDocId) {
    cachedGuideDocId =
      allDocMetas().find((d) => d.type === "GUIDE" && d.status === "CURRENT")?.doc_id ?? "UNKNOWN-GUIDE";
  }
  return cachedGuideDocId;
}

function contractForTicket(ticketId: string) {
  const t = ticketById(ticketId);
  return t ? contractFor(t.account_id) : undefined;
}

function ordersCountFor(accountId: string): number {
  return allOrders().filter((o) => o.account_id === accountId).length;
}
