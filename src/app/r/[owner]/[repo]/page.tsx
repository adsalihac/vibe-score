import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { type HistoricalInvestigation, type InvestigationReport } from "@/types/report";

export const dynamic = "force-dynamic";

function scoreTint(value: number) {
  if (value >= 80) return "text-[var(--accent-primary)]";
  if (value >= 60) return "text-[var(--accent-secondary)]";
  return "text-[var(--danger)]";
}

function statLabel(label: string, value: string | number) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-black/20 p-3">
      <p className="text-[0.65rem] uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-sm font-medium text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function metricSnapshot(payload: Partial<InvestigationReport>) {
  return {
    aiAssistance: payload.aiAssistance?.score ?? 0,
    documentation: payload.documentation?.score ?? 0,
    maintainability: payload.maintainability?.score ?? 0,
    technicalDebt: payload.technicalDebt?.index ?? 0,
    testing: payload.testing?.coverageConfidence ?? 0,
    secretHygiene: payload.secretHygiene?.score ?? 0,
    dependencyRisk: payload.dependencyRisk?.score ?? 0,
  };
}

function toHistory(item: {
  caseId: string;
  createdAt: Date;
  payload: unknown;
}): HistoricalInvestigation | null {
  const payload = item.payload as Partial<InvestigationReport> | null;
  if (!payload?.verdict || !payload.risk) {
    return null;
  }

  return {
    caseId: payload.caseId ?? item.caseId,
    overallHealth: payload.verdict.overallHealth ?? 0,
    riskLevel: payload.risk.level ?? "MEDIUM",
    verdictStyle: payload.verdict.style ?? "Human-led",
    generatedAt: payload.generatedAt ?? item.createdAt.toISOString(),
    rulePack: payload.rulePack ?? "startup",
    metrics: metricSnapshot(payload),
  };
}

export default async function RepoProfilePage({
  params,
}: {
  params: Promise<{ owner: string; repo: string }>;
}) {
  const { owner, repo } = await params;
  const repoFullName = `${decodeURIComponent(owner)}/${decodeURIComponent(repo)}`;

  const scans = process.env.DATABASE_URL
    ? await prisma.investigation.findMany({
        where: { repoFullName },
        orderBy: { createdAt: "desc" },
        take: 12,
      })
    : [];

  const latestPayload = scans[0]?.payload as unknown;
  const latest =
    latestPayload && typeof latestPayload === "object" && "verdict" in latestPayload
      ? (latestPayload as InvestigationReport)
      : undefined;
  const history = scans.map(toHistory).filter((item): item is HistoricalInvestigation => !!item);
  const previous = history.find((item) => item.caseId !== latest?.caseId);
  const healthDelta = latest && previous ? latest.verdict.overallHealth - previous.overallHealth : null;
  const badgeUrl = `/api/badge?repo=${encodeURIComponent(repoFullName)}`;

  return (
    <main className="relative min-h-screen overflow-x-hidden px-4 py-10 md:px-10">
      <div className="pointer-events-none absolute inset-0 grid-overlay opacity-20" />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="signal-frame scan-lines relative overflow-hidden rounded-2xl p-6 md:p-10">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent-primary)] to-transparent opacity-60" />
          <p className="mono text-xs uppercase tracking-[0.25em] text-[var(--accent-secondary)]">
            Public VibeScore Profile
          </p>
          <div className="mt-5 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-bold uppercase leading-tight text-white md:text-5xl">
                {repoFullName}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
                A public repository health profile built from the latest VibeScore investigation.
              </p>
            </div>
            <Link
              href={`/?repo=https://github.com/${repoFullName}`}
              className="inline-flex items-center justify-center rounded-lg border border-[var(--accent-primary)] bg-[var(--accent-primary)] px-5 py-3 text-xs font-bold uppercase tracking-[0.11em] text-black transition hover:bg-[#78ffd7]"
            >
              Run New Scan
            </Link>
          </div>
        </section>

        {!latest ? (
          <section className="relative rounded-xl border border-[var(--border)] bg-[linear-gradient(180deg,var(--panel),var(--panel-2))] p-6">
            <h2 className="text-xl font-semibold uppercase">No Public Scan Yet</h2>
            <p className="mt-3 text-sm text-[var(--muted)]">
              Run a scan for this repository first, then this profile will show health, missions, trend history, and the public badge.
            </p>
          </section>
        ) : (
          <>
            <section className="relative rounded-xl border border-[var(--border)] bg-[linear-gradient(180deg,var(--panel),var(--panel-2))] p-5 md:p-6">
              <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
                <div>
                  <p className="mono text-xs uppercase tracking-[0.18em] text-[var(--accent-primary)]">
                    Current Health
                  </p>
                  <p className={`mt-3 text-6xl font-bold ${scoreTint(latest.verdict.overallHealth)}`}>
                    {latest.verdict.overallHealth}
                  </p>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{latest.verdict.message}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {statLabel("Production Readiness", latest.verdict.productionReadiness)}
                  {statLabel("Risk", latest.risk.level)}
                  {statLabel("Rule Pack", latest.rulePack)}
                  {statLabel("Generated", new Date(latest.generatedAt).toLocaleDateString())}
                  {statLabel("Scan Target", latest.scanTarget.label)}
                  {statLabel("Development Pattern", latest.verdict.style)}
                </div>
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="relative rounded-xl border border-[var(--border)] bg-[linear-gradient(180deg,var(--panel),var(--panel-2))] p-5 md:p-6">
                <h2 className="text-lg font-semibold uppercase">Fix Missions</h2>
                <div className="mt-4 space-y-3">
                  {latest.remediationPlan.slice(0, 4).map((mission, index) => (
                    <div key={mission.id} className="rounded-md border border-[var(--border)] bg-black/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[0.65rem] uppercase tracking-[0.16em] text-[var(--accent-primary)]">
                          Mission {index + 1}
                        </span>
                        <span className="text-[0.65rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                          {mission.priority}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-[var(--foreground)]">{mission.title}</p>
                      <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{mission.impact}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="relative rounded-xl border border-[var(--border)] bg-[linear-gradient(180deg,var(--panel),var(--panel-2))] p-5 md:p-6">
                <h2 className="text-lg font-semibold uppercase">Before / After</h2>
                {healthDelta !== null && previous ? (
                  <div className="mt-4 rounded-md border border-[var(--border)] bg-black/20 p-4">
                    <p className="mono text-[0.65rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                      Since {new Date(previous.generatedAt).toLocaleDateString()}
                    </p>
                    <p className="mt-3 text-3xl font-bold text-[var(--foreground)]">
                      {previous.overallHealth} → {latest.verdict.overallHealth}
                    </p>
                    <p className={healthDelta >= 0 ? "mt-2 text-sm text-[var(--accent-primary)]" : "mt-2 text-sm text-[var(--danger)]"}>
                      {healthDelta > 0 ? "+" : ""}
                      {healthDelta} health points
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-[var(--muted)]">
                    This repo needs one more scan to show before/after movement.
                  </p>
                )}
                <div className="mt-4 space-y-3">
                  {history.map((item) => (
                    <div key={item.caseId} className="flex items-center gap-3 text-xs">
                      <span className="w-20 text-[var(--muted)]">{new Date(item.generatedAt).toLocaleDateString()}</span>
                      <div className="h-2 flex-1 rounded-full bg-black/40">
                        <div
                          className="h-2 rounded-full bg-[var(--accent-primary)]"
                          style={{ width: `${item.overallHealth}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-[var(--foreground)]">{item.overallHealth}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className="relative rounded-xl border border-[var(--border)] bg-[linear-gradient(180deg,var(--panel),var(--panel-2))] p-5 md:p-6">
              <h2 className="text-lg font-semibold uppercase">Public Badge</h2>
              <div className="mt-4 grid gap-4 lg:grid-cols-[auto_1fr] lg:items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={badgeUrl} alt="VibeScore badge" className="h-8 w-auto" />
                <pre className="whitespace-pre-wrap rounded-md border border-[var(--border)] bg-black/40 p-3 text-[0.65rem] text-[#bcffe8]">
                  {`![VibeScore](${badgeUrl})`}
                </pre>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
