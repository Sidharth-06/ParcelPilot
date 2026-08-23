import type { DocChunk, DocMeta } from "@/lib/data/types";

/**
 * Extracts every operational parameter from the compiled document chunks.
 * NOTHING in this file is dataset-specific: swap the PDFs, re-run
 * scripts/compile_data.py, and these parsers produce a new policy model.
 * Anything unparseable is surfaced as a loud warning — never silently defaulted.
 */

export type Severity = "P1" | "P2" | "P3";

export interface ResponseTarget {
  minutes: number;
  businessHours: boolean;
}

export type PlanTargets = Record<Severity, ResponseTarget>;

export interface CancellationPolicy {
  freeWindowMin: number;
  lateFeeInr: number;
  waiverByAgreementClause: boolean;
  pickedUpAction: string;
}

export interface ServiceCreditPolicy {
  delayThresholdHours: number;
  defaultCapInr: number;
  defaultPctOfFee: number;
}

export interface KnownIssue {
  ki_id: string;
  title: string;
  status: string; // Investigating | Monitoring | RESOLVED | ...
  opened: string | null;
  resolvedDate: string | null;
  description: string;
  workaround: string | null;
}

export interface ContractTerms {
  docId: string;
  accountIds: string[];
  slaOverrides?: PlanTargets;
  weekendSupportExcluded?: boolean;
  cancellationWaiver?: { waived: boolean };
  failedPickupCredit?: { thresholdHours: number; amountInr: number };
  monthlyCreditCapInr?: number;
  unparsedClauses: string[];
}

export interface PolicyParams {
  severityDefinitions: Partial<Record<Severity, string>>;
  sourcePrecedenceRaw: string | null;
  defaultTargetsByPlan: Record<string, PlanTargets>;
  cancellation: CancellationPolicy;
  serviceCredit: ServiceCreditPolicy;
  approvalThresholdInr: number | null;
  bulkUploadLimitRows: number | null;
  knownIssues: KnownIssue[];
  warnings: string[];
}

// ---------------------------------------------------------------- helpers

const DURATION_RE = /(\d+)\s*(business\s+)?(minutes?|hours?|days?)/gi;

export function parseMoney(s: string): number {
  return parseInt(s.replace(/,/g, ""), 10);
}

export function parseDuration(segment: string): ResponseTarget | null {
  DURATION_RE.lastIndex = 0;
  const m = DURATION_RE.exec(segment);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[3].toLowerCase();
  const businessHours = Boolean(m[2]);
  let minutes = n;
  if (unit.startsWith("hour")) minutes = n * 60;
  else if (unit.startsWith("day")) minutes = n * 1440;
  return { minutes, businessHours };
}

/** All durations in textual order, e.g. a plan row "30 minutes, 24x7 | 2 hours | 1 business day". */
export function parseDurationsInOrder(segment: string): ResponseTarget[] {
  const out: ResponseTarget[] = [];
  DURATION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DURATION_RE.exec(segment)) !== null) {
    const n = parseInt(m[1], 10);
    const unit = m[3].toLowerCase();
    let minutes = n;
    if (unit.startsWith("hour")) minutes = n * 60;
    else if (unit.startsWith("day")) minutes = n * 1440;
    out.push({ minutes, businessHours: Boolean(m[2]) });
  }
  return out;
}

export function docText(doc: DocMeta, chunks: DocChunk[]): string {
  return flatten(chunks.filter((c) => c.doc_id === doc.doc_id).map((c) => c.text).join("\n\n"));
}

/** Collapse every whitespace run (incl. PDF line-breaks mid-sentence) to single spaces. */
export function flatten(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// ------------------------------------------------------- targets parsing

/**
 * Policy-table layout: "<Plan> <P1 duration> <P2 duration> <P3 duration> <Plan> ..."
 * Plan names come from the accounts data — never hardcoded.
 */
export function parseTargetsByPlan(text: string, planNames: string[]): Record<string, PlanTargets> {
  const out: Record<string, PlanTargets> = {};
  const anchors: Array<{ name: string; idx: number }> = [];
  for (const p of planNames) {
    let i = text.indexOf(p);
    while (i !== -1) {
      anchors.push({ name: p, idx: i });
      i = text.indexOf(p, i + p.length);
    }
  }
  anchors.sort((a, b) => a.idx - b.idx);
  for (let k = 0; k < anchors.length; k++) {
    const end = k + 1 < anchors.length ? anchors[k + 1].idx : text.length;
    const seg = text.slice(anchors[k].idx + anchors[k].name.length, end);
    const durations = parseDurationsInOrder(seg);
    // The first anchor occurrence is usually the table header ("Plan P1 P2 P3") with no numbers.
    if (durations.length >= 3) {
      out[anchors[k].name] = { P1: durations[0], P2: durations[1], P3: durations[2] };
    }
  }
  return out;
}

/** Contract layout: "P1: 15 minutes, 24x7 ● P2: 1 hour ● P3: 8 business hours". */
export function parseTargetsBySeverity(text: string): PlanTargets | null {
  const re = /P([123])\s*:\s*/g;
  const marks: Array<{ sev: Severity; start: number; contentStart: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    marks.push({ sev: `P${m[1]}` as Severity, start: m.index, contentStart: m.index + m[0].length });
  }
  if (marks.length < 3) return null;
  const out = {} as PlanTargets;
  for (let k = 0; k < marks.length; k++) {
    const end = k + 1 < marks.length ? marks[k + 1].start : Math.min(text.length, marks[k].contentStart + 120);
    const t = parseDuration(text.slice(marks[k].contentStart, end));
    if (!t) continue;
    out[marks[k].sev] = t;
  }
  return out.P1 && out.P2 && out.P3 ? out : null;
}

// ------------------------------------------------------ known issues

export function extractKnownIssues(text: string): KnownIssue[] {
  const issues: KnownIssue[] = [];
  const flat = flatten(text);
  const blocks = flat.split(/(?=KI-\d{3})/g).filter((b) => /^KI-\d{3}/.test(b.trim()));
  for (const block of blocks) {
    const idMatch = block.match(/^KI-(\d{3})/) ?? block.match(/^KI-?(\d{3})/);
    if (!idMatch) continue;
    const ki_id = `KI-${idMatch[1]}`;
    const openedM = block.match(/Opened:\s*(\d{1,2}\s+\w+\s+\d{4})/i);
    const resolvedM = block.match(/Resolved[:\s]*(\d{1,2}\s+\w+\s+\d{4})/i);
    const statusM = block.match(/Status:\s*([A-Za-z]+)/i);
    const titleEnd = block.search(/Opened:/i);
    let title = (titleEnd === -1 ? block : block.slice(0, titleEnd)).replace(/^KI-\d{3}\s*[-–—:]?\s*/, "").trim();
    title = title.split("\n")[0].split(/\.\s/)[0].trim();
    if (/resolved/i.test(title)) {
      // Resolved-section layout: "Address validation: Resolved 18 July 2026. Do not use..."
      title = title.split(/:\s*Resolved/i)[0].trim();
    }
    const waIdx = block.search(/Workaround:/i);
    const openedAnchor = block.indexOf("Opened:", titleEnd);
    const rawDesc =
      titleEnd === -1 ? "" : block.slice(openedAnchor === -1 ? titleEnd : openedAnchor, waIdx === -1 ? block.length : waIdx);
    let description = flatten(
      rawDesc
        .replace(/Opened:[\s\S]*?(?=Status:|$)/i, "")
        .replace(/Status:\s*[A-Za-z]+\s*/i, "")
        .replace(/Resolved[:\s]*\d{1,2}\s+\w+\s+\d{4}\.?/gi, "")
    );
    if (!description) {
      // Resolved-style blocks without Opened:/Workaround: fields — keep the guidance note.
      description = flatten(block.replace(/^KI-\d{3}\s*/, "").slice(title.length))
        .replace(/^[-–—:.]*/, "")
        .replace(/Resolved[:\s]*\d{1,2}\s+\w+\s+\d{4}\.?/gi, "")
        .trim();
    }
    const workaround = waIdx === -1 ? null : flatten(block.slice(waIdx + "Workaround:".length).split(/KI-\d{3}|$/)[0]) || null;
    const isResolved = /resolved/i.test(block.slice(0, 40)) || (resolvedM !== null && !statusM);
    issues.push({
      ki_id,
      title,
      status: statusM ? statusM[1] : resolvedM ? "RESOLVED" : "UNKNOWN",
      opened: openedM ? openedM[1] : null,
      resolvedDate: resolvedM ? resolvedM[1] : null,
      description,
      workaround,
    });
    void isResolved;
  }
  return issues;
}
