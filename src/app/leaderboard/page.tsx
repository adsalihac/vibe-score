import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { type InvestigationReport, type LeaderboardEntry, type LeaderboardReport } from "@/types/report";

export const dynamic = "force-dynamic";

function emptyLeaderboard(): LeaderboardReport {
  return {
    bestHealth: [],
    mostImproved: [],
    lowestDependencyRisk: [],
    bestDocs: [],
  };
}

function toEntry(report: InvestigationReport, improvement?: number): LeaderboardEntry {
  return {
    repoFullName: report.repository.fullName,
    owner: report.repository.owner,
    health: report.verdict.overallHealth,
    documentation: report.documentation.score,
    dependencyRisk: report.dependencyRisk.score,
    riskLevel: report.risk.level,
    generatedAt: report.generatedAt,
    improvement,
  };
}

async function loadLeaderboard(): Promise<LeaderboardReport> {
  if (!process.env.DATABASE_URL) {
    return emptyLeaderboard();
  }

  const scans = await prisma.investigation.findMany({
    orderBy: { createdAt: "desc" },
    take: 250,
  });

  const byRepo = new Map<string, InvestigationReport[]>();
  for (const scan of scans) {
    const payload = scan.payload as unknown;
    if (!payload || typeof payload !== "object" || !("repository" in payload) || !("verdict" in payload)) {
      continue;
    }

    const report = payload as InvestigationReport;
    const existing = byRepo.get(report.repository.fullName) ?? [];
    existing.push(report);
    byRepo.set(report.repository.fullName, existing);
  }

  const latestEntries: LeaderboardEntry[] = [];
  const improvedEntries: LeaderboardEntry[] = [];

  for (const reports of byRepo.values()) {
    const [latest, previous] = reports;
    if (!latest) {
      continue;
    }

    latestEntries.push(toEntry(latest));
    if (previous) {
      const improvement = latest.verdict.overallHealth - previous.verdict.overallHealth;
      if (improvement > 0) {
        improvedEntries.push(toEntry(latest, improvement));
      }
    }
  }

  return {
    bestHealth: [...latestEntries].sort((a, b) => b.health - a.health).slice(0, 10),
    mostImproved: improvedEntries.sort((a, b) => (b.improvement ?? 0) - (a.improvement ?? 0)).slice(0, 10),
    lowestDependencyRisk: [...latestEntries].sort((a, b) => b.dependencyRisk - a.dependencyRisk).slice(0, 10),
    bestDocs: [...latestEntries].sort((a, b) => b.documentation - a.documentation).slice(0, 10),
  };
}

function LeaderboardTable({
  title,
  metric,
  entries,
}: {
  title: string;
  metric: "health" | "improvement" | "dependencyRisk" | "documentation";
  entries: LeaderboardEntry[];
}) {
  return (
    <section className="relative rounded-xl border border-[var(--border)] bg-[linear-gradient(180deg,var(--panel),var(--panel-2))] p-5 md:p-6">
      <h2 className="text-lg font-semibold uppercase">{title}</h2>
      <div className="mt-4 space-y-3">
        {entries.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No qualifying scans yet.</p>
        ) : (
          entries.map((entry, index) => (
            <Link
              key={`${title}-${entry.repoFullName}`}
              href={`/r/${entry.repoFullName}`}
              className="grid gap-3 rounded-md border border-[var(--border)] bg-black/20 p-3 text-sm transition hover:border-[var(--accent-primary)] sm:grid-cols-[2rem_1fr_auto] sm:items-center"
            >
              <span className="text-[var(--accent-secondary)]">#{index + 1}</span>
              <span>
                <span className="block font-semibold text-[var(--foreground)]">{entry.repoFullName}</span>
                <span className="text-xs text-[var(--muted)]">
                  {entry.riskLevel} risk / {new Date(entry.generatedAt).toLocaleDateString()}
                </span>
              </span>
              <span className="text-right font-semibold text-[var(--accent-primary)]">
                {metric === "improvement" ? `+${entry.improvement ?? 0}` : entry[metric]}
              </span>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}

export default async function LeaderboardPage() {
  const leaderboard = await loadLeaderboard();

  return (
    <main className="relative min-h-screen overflow-x-hidden px-4 py-10 md:px-10">
      <div className="pointer-events-none absolute inset-0 grid-overlay opacity-20" />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="signal-frame scan-lines relative overflow-hidden rounded-2xl p-6 md:p-10">
          <p className="mono text-xs uppercase tracking-[0.25em] text-[var(--accent-secondary)]">
            VibeScore Social Signals
          </p>
          <div className="mt-5 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-bold uppercase leading-tight text-white md:text-5xl">
                Repo Leaderboard
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
                Public rankings from stored VibeScore scans: strongest health, biggest improvement, cleanest dependency posture, and best documentation.
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-lg border border-[var(--accent-primary)] bg-[var(--accent-primary)] px-5 py-3 text-xs font-bold uppercase tracking-[0.11em] text-black transition hover:bg-[#78ffd7]"
            >
              Scan A Repo
            </Link>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <LeaderboardTable title="Best Health Score" metric="health" entries={leaderboard.bestHealth} />
          <LeaderboardTable title="Most Improved" metric="improvement" entries={leaderboard.mostImproved} />
          <LeaderboardTable title="Lowest Dependency Risk" metric="dependencyRisk" entries={leaderboard.lowestDependencyRisk} />
          <LeaderboardTable title="Best Docs" metric="documentation" entries={leaderboard.bestDocs} />
        </div>
      </div>
    </main>
  );
}
