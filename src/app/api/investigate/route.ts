import { NextResponse } from "next/server";

import { investigateRepository } from "@/lib/investigation";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { repoUrl?: string; rulePack?: string };

    if (!body.repoUrl) {
      return NextResponse.json(
        { error: "Repository URL is required." },
        { status: 400 },
      );
    }

    const result = await investigateRepository(body.repoUrl, {
      rulePack: body.rulePack,
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
