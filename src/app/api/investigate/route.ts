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
      return NextResponse.json(
        { error: "Repository URL is required." },
        { status: 400 },
      );
    }

    const result = await investigateRepository(body.repoUrl, {
      rulePack: body.rulePack,
      scanTarget: body.scanTarget,
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
