import { prisma } from "@/lib/prisma";
import { type InvestigationReport } from "@/types/report";

export const dynamic = "force-dynamic";

function escapeXml(s: string) {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c
  );
}

function buildBadgeSvg(health: number | undefined): Response {
  const value = health !== undefined ? `Health ${health}` : "Scan required";
  const color =
    typeof health === "number"
      ? health >= 80
        ? "#00ffb3"
        : health >= 60
          ? "#4d9fff"
          : "#ff5a5a"
      : "#9ba7a2";

  const label = "VibeScore";
  const lw = 110;
  const vw = 200;
  const h = 40;
  const w = lw + vw;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" role="img" aria-label="${escapeXml(`${label}: ${value}`)}">
  <linearGradient id="smooth" x2="0" y2="100%">
    <stop offset="0" stop-color="#111" stop-opacity=".7"/>
    <stop offset="1" stop-color="#111" stop-opacity=".9"/>
  </linearGradient>
  <rect width="${w}" height="${h}" rx="6" fill="#0b0b0b"/>
  <rect width="${lw}" height="${h}" rx="6" fill="url(#smooth)"/>
  <rect x="${lw}" width="${vw}" height="${h}" rx="6" fill="${color}"/>
  <g fill="#eaf8f3" font-family="Arial, sans-serif" font-size="12" font-weight="700">
    <text x="${lw / 2}" y="25" text-anchor="middle">${escapeXml(label)}</text>
    <text x="${lw + vw / 2}" y="25" text-anchor="middle">${escapeXml(value)}</text>
  </g>
</svg>`;

  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const repo = searchParams.get("repo");

    if (!repo) {
      return new Response("Missing repo parameter.", { status: 400 });
    }

    if (!process.env.DATABASE_URL) {
      return buildBadgeSvg(undefined);
    }

    const latest = await prisma.investigation.findFirst({
      where: { repoFullName: repo },
      orderBy: { createdAt: "desc" },
    });

    const payload = latest?.payload as Partial<InvestigationReport> | null;
    return buildBadgeSvg(payload?.verdict?.overallHealth);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate badge.";
    return new Response(message, { status: 500 });
  }
}
