import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { type HistoricalInvestigation, type InvestigationReport } from "@/types/report";

function reportMetricSnapshot(payload: Partial<InvestigationReport>) {
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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const repo = searchParams.get("repo");

    if (!repo) {
      return NextResponse.json({ error: "Repository full name is required." }, { status: 400 });
    }

    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ items: [] });
    }

    const items = await prisma.investigation.findMany({
      where: { repoFullName: repo },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const history: HistoricalInvestigation[] = items
      .map((item) => {
        const payload = item.payload as Partial<InvestigationReport> | null;
        if (!payload || !payload.verdict || !payload.risk) {
          return null;
        }

        return {
          caseId: payload.caseId ?? item.caseId,
          overallHealth: payload.verdict.overallHealth ?? 0,
          riskLevel: payload.risk.level ?? "MEDIUM",
          verdictStyle: payload.verdict.style ?? "Human-led",
          generatedAt: payload.generatedAt ?? item.createdAt.toISOString(),
          rulePack: payload.rulePack ?? "startup",
          metrics: reportMetricSnapshot(payload),
        };
      })
      .filter((item): item is HistoricalInvestigation => !!item);

    return NextResponse.json({ items: history });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
