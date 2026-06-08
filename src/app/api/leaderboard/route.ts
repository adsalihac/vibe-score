import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  type InvestigationReport,
  type LeaderboardEntry,
  type LeaderboardReport,
} from "@/types/report";

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

export async function GET() {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json(emptyLeaderboard());
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

    const leaderboard: LeaderboardReport = {
      bestHealth: [...latestEntries].sort((a, b) => b.health - a.health).slice(0, 10),
      mostImproved: improvedEntries.sort((a, b) => (b.improvement ?? 0) - (a.improvement ?? 0)).slice(0, 10),
      lowestDependencyRisk: [...latestEntries].sort((a, b) => b.dependencyRisk - a.dependencyRisk).slice(0, 10),
      bestDocs: [...latestEntries].sort((a, b) => b.documentation - a.documentation).slice(0, 10),
    };

    return NextResponse.json(leaderboard);
  } catch {
    return NextResponse.json(emptyLeaderboard());
  }
}
