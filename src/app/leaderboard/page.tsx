import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { type InvestigationReport, type LeaderboardEntry, type LeaderboardReport } from "@/types/report";

export const dynamic = "force-dynamic";

function statLabel(label: string, value: string | number) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[rgba(31,82,31,0.1)] p-3 backdrop-blur-sm">
      <p className="mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-sm font-medium text-[var(--foreground)]">{value}</p>
    </div>
  );
}

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
      <div className="pointer-events-none absolute inset-0 grid-overlay" />
      <div className="pointer-events-none absolute left-[-8%] top-[-8%] h-72 w-72 rounded-full bg-[#33ff00]/15 blur-[120px]" />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="signal-frame relative overflow-hidden rounded-2xl p-6 md:p-10">
          <p className="mono text-xs uppercase tracking-[0.22em] text-[#ffb000]">
            Repository rankings
          </p>
          <div className="mt-5 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-4xl font-bold leading-tight text-[var(--foreground)] sm:text-5xl md:text-7xl">
                Repo Leaderboard
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--muted)] md:text-lg">
                Public rankings from stored VibeScore scans: strongest health, biggest improvement, cleanest dependency posture, and best documentation.
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full border border-[#33ff00]/70 bg-gradient-to-r from-[#1f521f] via-[#33ff00] to-[#ffb000] px-5 py-3 text-xs font-bold uppercase tracking-[0.14em] text-black transition hover:brightness-110"
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
