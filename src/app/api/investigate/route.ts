import { NextResponse } from "next/server";

import { investigateRepository } from "@/lib/investigation";
import { type ScanTargetMode } from "@/types/report";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization") || request.headers.get("x-github-token");
    let headerToken: string | undefined;
    if (authHeader) {
      headerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    }

    const body = (await request.json()) as {
      repoUrl?: string;
      rulePack?: string;
      githubToken?: string;
      scanTarget?: {
        mode?: ScanTargetMode;
        ref?: string;
        pullRequestNumber?: number | string;
      };
    };

    if (!body.repoUrl) {
      return NextResponse.json(
        { error: "Repository URL is required." },
        { status: 400 },
      );
    }

    const customToken = body.githubToken || headerToken;

    const result = await investigateRepository(body.repoUrl, {
      rulePack: body.rulePack,
      scanTarget: body.scanTarget,
      token: customToken,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to complete repository investigation.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
