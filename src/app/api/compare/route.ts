import { NextResponse } from "next/server";

import { investigateRepository } from "@/lib/investigation";
import { type ComparisonReport, type InvestigationReport } from "@/types/report";

const riskRank: Record<InvestigationReport["risk"]["level"], number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

function buildDelta(metric: string, left: number, right: number) {
  const delta = right - left;
  return {
    metric,
    left,
    right,
    delta,
    direction: delta > 0 ? "higher" : delta < 0 ? "lower" : "equal",
  } as const;
}

function buildComparison(left: InvestigationReport, right: InvestigationReport): ComparisonReport {
  const deltas = [
    buildDelta("Overall Health", left.verdict.overallHealth, right.verdict.overallHealth),
    buildDelta("AI Assistance", left.aiAssistance.score, right.aiAssistance.score),
    buildDelta("Documentation", left.documentation.score, right.documentation.score),
    buildDelta("Maintainability", left.maintainability.score, right.maintainability.score),
    buildDelta("Technical Debt", left.technicalDebt.index, right.technicalDebt.index),
    buildDelta("Testing Confidence", left.testing.coverageConfidence, right.testing.coverageConfidence),
    buildDelta("Dependency Risk", left.dependencyRisk.score, right.dependencyRisk.score),
    buildDelta("Risk Tier", riskRank[left.risk.level], riskRank[right.risk.level]),
  ];

  const strongestRepo =
    left.verdict.overallHealth >= right.verdict.overallHealth
      ? left.repository.fullName
      : right.repository.fullName;
  const mostRiskyRepo =
    riskRank[left.risk.level] >= riskRank[right.risk.level]
      ? left.repository.fullName
      : right.repository.fullName;

  return {
    left,
    right,
    deltas,
    callouts: {
      strongestRepo,
      mostRiskyRepo,
      healthLead: Math.abs(left.verdict.overallHealth - right.verdict.overallHealth),
      riskGap: Math.abs(riskRank[left.risk.level] - riskRank[right.risk.level]),
    },
  };
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization") || request.headers.get("x-github-token");
    let headerToken: string | undefined;
    if (authHeader) {
      headerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    }

    const body = (await request.json()) as {
      leftRepoUrl?: string;
      rightRepoUrl?: string;
      rulePack?: string;
      githubToken?: string;
    };

    if (!body.leftRepoUrl || !body.rightRepoUrl) {
      return NextResponse.json(
        { error: "Both repository URLs are required for comparison." },
        { status: 400 },
      );
    }

    const customToken = body.githubToken || headerToken;

    const [leftResult, rightResult] = await Promise.all([
      investigateRepository(body.leftRepoUrl, { rulePack: body.rulePack, token: customToken }),
      investigateRepository(body.rightRepoUrl, { rulePack: body.rulePack, token: customToken }),
    ]);

    const comparison = buildComparison(leftResult.report, rightResult.report);
    return NextResponse.json(comparison);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to complete repository comparison.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
