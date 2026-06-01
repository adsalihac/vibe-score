import { NextResponse } from "next/server";

import { investigateRepository } from "@/lib/investigation";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      repoUrl?: string;
      rulePack?: string;
    };

    if (!body.repoUrl) {
      return NextResponse.json({ error: "Repository URL is required." }, { status: 400 });
    }

    const result = await investigateRepository(body.repoUrl, {
      rulePack: body.rulePack,
    });

    const report = result.report;
    const summary = {
      repository: report.repository.fullName,
      overallHealth: report.verdict.overallHealth,
      risk: report.risk.level,
      verdict: report.verdict.style,
      rulePack: report.rulePack,
      generatedAt: report.generatedAt,
    };

    const markdown = `### VibeScore Summary

- **Repository**: ${summary.repository}
- **Overall Health**: ${summary.overallHealth} / 100
- **Risk**: ${summary.risk}
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
