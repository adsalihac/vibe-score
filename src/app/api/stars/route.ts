import { NextResponse } from "next/server";

interface StarsResponse {
  stars: number | null;
}

function parseCompactNumber(input: string): number | null {
  const value = input.trim().toLowerCase();
  const match = value.match(/^([\d.]+)\s*([kmb])?$/);

  if (!match) {
    const onlyDigits = value.replace(/[^\d]/g, "");
    if (!onlyDigits) return null;
    return Number.parseInt(onlyDigits, 10);
  }

  const base = Number.parseFloat(match[1]);
  if (!Number.isFinite(base)) {
    return null;
  }

  const unit = match[2];
  const multiplier = unit === "k" ? 1_000 : unit === "m" ? 1_000_000 : unit === "b" ? 1_000_000_000 : 1;
  return Math.round(base * multiplier);
}

async function fetchStarsFromShields(owner: string, repo: string): Promise<number | null> {
  const shieldsResponse = await fetch(
    `https://img.shields.io/github/stars/${owner}/${repo}.json`,
    { next: { revalidate: 3600 } },
  );

  if (!shieldsResponse.ok) {
    return null;
  }

  const shieldsData = (await shieldsResponse.json()) as { message?: string };
  if (!shieldsData.message) {
    return null;
  }

  return parseCompactNumber(shieldsData.message);
}

async function fetchStarsFromGitHub(owner: string, repo: string): Promise<number | null> {
  const token = process.env.GIT_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    next: { revalidate: 600 },
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { stargazers_count?: number };
  return typeof payload.stargazers_count === "number" ? payload.stargazers_count : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const repoParam = searchParams.get("repo");

  if (!repoParam) {
    return NextResponse.json({ error: "repo is required" }, { status: 400 });
  }

  const [owner, repo] = repoParam.split("/");
  if (!owner || !repo) {
    return NextResponse.json({ error: "repo must be in owner/repo format" }, { status: 400 });
  }

  try {
    const shieldsStars = await fetchStarsFromShields(owner, repo);
    if (typeof shieldsStars === "number") {
      return NextResponse.json<StarsResponse>(
        { stars: shieldsStars },
        { headers: { "Cache-Control": "public, max-age=3600" } },
      );
    }

    const githubStars = await fetchStarsFromGitHub(owner, repo);
    return NextResponse.json<StarsResponse>(
      { stars: githubStars },
      { headers: { "Cache-Control": "public, max-age=600" } },
    );
  } catch {
    return NextResponse.json<StarsResponse>(
      { stars: null },
      { headers: { "Cache-Control": "public, max-age=120" } },
    );
  }
}
