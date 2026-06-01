import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { type InvestigationReport, type OrganizationSummary } from "@/types/report";

function roundAverage(total: number, count: number) {
  if (count === 0) return 0;
  return Math.round(total / count);
}

export async function GET(request: Request) {
  let owner = "unknown";
  try {
    const { searchParams } = new URL(request.url);
    const ownerParam = searchParams.get("owner");

    if (!ownerParam) {
      return NextResponse.json({ error: "Owner is required." }, { status: 400 });
    }

    owner = ownerParam;

    if (!process.env.DATABASE_URL) {
      return NextResponse.json({
        owner,
        totalRepos: 0,
        totalScans: 0,
        averageHealth: 0,
        riskBreakdown: { LOW: 0, MEDIUM: 0, HIGH: 0 },
        latestScanAt: null,
        topRepos: [],
      } satisfies OrganizationSummary);
    }

    const items = await prisma.investigation.findMany({
      where: { repoFullName: { startsWith: `${owner}/` } },
      orderBy: { createdAt: "desc" },
    });

    const repoMap = new Map<
      string,
      { scans: number; totalHealth: number; lastScanAt: string }
    >();
    const riskBreakdown = { LOW: 0, MEDIUM: 0, HIGH: 0 };
    let totalHealth = 0;
    let latestScanAt: string | null = null;

    items.forEach((item) => {
      const payload = item.payload as Partial<InvestigationReport> | null;
      if (!payload || !payload.verdict || !payload.risk || !payload.repository) {
        return;
      }

      const fullName = payload.repository.fullName ?? item.repoFullName;
      const health = payload.verdict.overallHealth ?? 0;
      const riskLevel = payload.risk.level ?? "MEDIUM";
      const scanAt = payload.generatedAt ?? item.createdAt.toISOString();

      totalHealth += health;
      riskBreakdown[riskLevel] += 1;

      const existing = repoMap.get(fullName);
      if (existing) {
        existing.scans += 1;
        existing.totalHealth += health;
        existing.lastScanAt = scanAt;
      } else {
        repoMap.set(fullName, { scans: 1, totalHealth: health, lastScanAt: scanAt });
      }

      if (!latestScanAt || scanAt > latestScanAt) {
        latestScanAt = scanAt;
      }
    });

    const topRepos = [...repoMap.entries()]
      .map(([repoFullName, stats]) => ({
        repoFullName,
        scans: stats.scans,
        averageHealth: roundAverage(stats.totalHealth, stats.scans),
        lastScanAt: stats.lastScanAt,
      }))
      .sort((a, b) => b.scans - a.scans)
      .slice(0, 5);

    const summary: OrganizationSummary = {
      owner,
      totalRepos: repoMap.size,
      totalScans: items.length,
      averageHealth: roundAverage(totalHealth, items.length),
      riskBreakdown,
      latestScanAt,
      topRepos,
    };

    return NextResponse.json(summary);
  } catch {
    return NextResponse.json({
      owner,
      totalRepos: 0,
      totalScans: 0,
      averageHealth: 0,
      riskBreakdown: { LOW: 0, MEDIUM: 0, HIGH: 0 },
      latestScanAt: null,
      topRepos: [],
    } satisfies OrganizationSummary);
  }
}
