import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { deriveInsights } from "@/lib/engines/insights";
import { detectConflicts } from "@/lib/engines/conflict";
import { InsightsView } from "@/components/insights-view";
import { ArrowLeft } from "lucide-react";
import { BrandBadge } from "@/components/brand-badge";

const DOMAIN_LABEL: Record<string, string> = {
  cancellation_fee: "Cancellation fees",
  service_credit: "Service credits",
  support_targets: "Support SLAs",
  credit_cap: "Credit caps",
};

export default async function InsightsPage() {
  const session = await getSession();
  if (!session) redirect("/");

  const insights = deriveInsights();
  const conflicts = detectConflicts();

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-5 py-2 flex items-center justify-between">
        <BrandBadge href="/console" />
        <div className="flex items-center gap-3 text-xs">
          <Link
            href="/console"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card hover:bg-secondary px-3 py-1 text-xs font-medium text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Console</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <div className="mx-auto max-w-5xl px-6 pb-16 pt-8">
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Proactive Detections &amp; Operational Signal Scan
          </h1>
          <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
            Derived deterministically from the snapshot dataset — SLA math, known-issue correlation, blast-radius signals &amp; guidance audits.
          </p>
        </div>

        <section className="mt-6">
          <InsightsView insights={insights} />
        </section>

        {/* Contract Precedence Matrix */}
        <section className="mt-12">
          <div className="flex items-baseline justify-between border-b border-border pb-2.5">
            <h2 className="text-sm font-bold text-foreground">
              Contract vs. Policy Precedence Matrix
            </h2>
            <span className="text-xs text-muted-foreground">
              {conflicts.length} Overrides Active
            </span>
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/50 text-muted-foreground font-medium">
                  <th className="px-3.5 py-2.5">Account</th>
                  <th className="px-3.5 py-2.5">Domain</th>
                  <th className="px-3.5 py-2.5">Contract Override Clause</th>
                  <th className="px-3.5 py-2.5">Default SOP Rule</th>
                  <th className="px-3.5 py-2.5">Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {conflicts.map((c) => (
                  <tr key={c.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="whitespace-nowrap px-3.5 py-3 font-mono font-medium text-foreground">
                      {c.accountId}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-3 text-muted-foreground">
                      {DOMAIN_LABEL[c.domain] ?? c.domain}
                    </td>
                    <td className="px-3.5 py-3 leading-relaxed text-foreground">{c.contractClause}</td>
                    <td className="px-3.5 py-3 leading-relaxed text-muted-foreground line-through decoration-muted-foreground/40">{c.defaultClause}</td>
                    <td className="px-3.5 py-3 leading-relaxed font-medium text-emerald-700">{c.resolution}</td>
                  </tr>
                ))}
                {conflicts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3.5 py-6 text-center text-xs text-muted-foreground">
                      No active contracts diverge from default policies.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
