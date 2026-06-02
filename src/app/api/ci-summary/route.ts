import { NextResponse } from "next/server";

import { investigateRepository } from "@/lib/investigation";
import { type ScanTargetMode } from "@/types/report";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      repoUrl?: string;
      rulePack?: string;
      scanTarget?: {
        mode?: ScanTargetMode;
        ref?: string;
        pullRequestNumber?: number | string;
      };
    };

    if (!body.repoUrl) {
      return NextResponse.json({ error: "Repository URL is required." }, { status: 400 });
    }

    const result = await investigateRepository(body.repoUrl, {
      rulePack: body.rulePack,
      scanTarget: body.scanTarget,
    });

    const report = result.report;
    const summary = {
      repository: report.repository.fullName,
      overallHealth: report.verdict.overallHealth,
      risk: report.risk.level,
      secretHygiene: report.secretHygiene.status,
      verdict: report.verdict.style,
      rulePack: report.rulePack,
      scanTarget: report.scanTarget.label,
      topRemediation: report.remediationPlan[0]?.title ?? null,
      generatedAt: report.generatedAt,
    };

    const markdown = `### VibeScore Summary

- **Repository**: ${summary.repository}
- **Overall Health**: ${summary.overallHealth} / 100
- **Risk**: ${summary.risk}
- **Secret Hygiene**: ${summary.secretHygiene}
- **Scan Target**: ${summary.scanTarget}
- **Top Remediation**: ${summary.topRemediation ?? "No urgent remediation item"}
- **Verdict**: ${summary.verdict}
- **Rule Pack**: ${summary.rulePack}
- **Generated**: ${new Date(summary.generatedAt).toLocaleString()}`;

    return NextResponse.json({ summary, markdown });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate CI summary.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
