"use client";

import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toPng } from "html-to-image";
import {
  AlertTriangle,
  Binary,
  Copy,
  Download,
  ExternalLink,
  Link2,
  Radar,
  Share2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { type InvestigationApiResponse, type InvestigationReport } from "@/types/report";

const INVESTIGATION_LOGS = [
  "[✓] Accessing repository",
  "[✓] Reading file structure",
  "[✓] Building dependency graph",
  "[✓] Inspecting commit history",
  "[✓] Detecting generation patterns",
  "[✓] Evaluating architecture",
  "[✓] Measuring maintainability",
  "[✓] Analyzing documentation",
  "[✓] Building forensic report",
  "[✓] Investigation complete",
];

type Phase = "idle" | "investigating" | "report";

function statLabel(label: string, value: string | number) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-black/20 p-3">
      <p className="text-[0.65rem] uppercase tracking-[0.16em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-sm font-medium text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function scoreTint(value: number) {
  if (value >= 80) return "text-[var(--accent-primary)]";
  if (value >= 60) return "text-[var(--accent-secondary)]";
  return "text-[var(--danger)]";
}

export default function Home() {
  const [repoUrl, setRepoUrl] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }

    const params = new URLSearchParams(window.location.search);
    return params.get("repo") ?? "";
  });
  const [phase, setPhase] = useState<Phase>("idle");
  const [report, setReport] = useState<InvestigationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [typingLine, setTypingLine] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const reportCardRef = useRef<HTMLDivElement>(null);

  const topShareLine = useMemo(() => {
    if (!report) return "";
    return `${report.repository.fullName} | Health ${report.verdict.overallHealth} | ${report.verdict.style}`;
  }, [report]);

  const runLogAnimation = () => {
    setLogs([]);
    setTypingLine("");

    let lineIndex = 0;
    const interval = window.setInterval(() => {
      const line = INVESTIGATION_LOGS[lineIndex];
      if (!line) {
        window.clearInterval(interval);
        setTypingLine("");
        return;
      }

      let charIndex = 0;
      const typeInterval = window.setInterval(() => {
        charIndex += 1;
        setTypingLine(line.slice(0, charIndex));

        if (charIndex >= line.length) {
          window.clearInterval(typeInterval);
          setLogs((prev) => [...prev, line]);
          setTypingLine("");
        }
      }, 15);

      lineIndex += 1;
    }, 580);

    return () => {
      window.clearInterval(interval);
    };
  };

  const handleInvestigation = async () => {
    if (!repoUrl.trim()) {
      setError("Please enter a GitHub repository URL.");
      return;
    }

    setError(null);
    setReport(null);
    setPhase("investigating");
    setIsSubmitting(true);

    const stopLogAnimation = runLogAnimation();
    const start = Date.now();

    try {
      const response = await fetch("/api/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl }),
      });

      const data = (await response.json()) as InvestigationApiResponse | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "Investigation failed.");
      }

      const elapsed = Date.now() - start;
      if (elapsed < 5200) {
        await new Promise((resolve) => setTimeout(resolve, 5200 - elapsed));
      }

      setLogs(data.logs);
      setReport(data.report);
      setPhase("report");

      const shareUrl = `${window.location.origin}/?repo=${encodeURIComponent(repoUrl.trim())}`;
      window.history.replaceState({}, "", shareUrl);
    } catch (err) {
      setPhase("idle");
      setError(err instanceof Error ? err.message : "Investigation failed.");
    } finally {
      setIsSubmitting(false);
      if (stopLogAnimation) {
        stopLogAnimation();
      }
    }
  };

  const downloadReportCard = async () => {
    if (!reportCardRef.current || !report) return;

    const dataUrl = await toPng(reportCardRef.current, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: "#050505",
    });

    const link = document.createElement("a");
    link.download = `vibescore-${report.repository.owner}-${report.repository.name}.png`;
    link.href = dataUrl;
    link.click();
  };

  const copyPublicLink = async () => {
    const url = `${window.location.origin}/?repo=${encodeURIComponent(repoUrl.trim())}`;
    await navigator.clipboard.writeText(url);
  };

  const shareOnX = () => {
    if (!report) return;
    const text = encodeURIComponent(`VibeScore Investigation: ${topShareLine}`);
    const url = encodeURIComponent(
      `${window.location.origin}/?repo=${encodeURIComponent(repoUrl.trim())}`,
    );
    window.open(`https://x.com/intent/tweet?text=${text}&url=${url}`, "_blank");
  };

  const shareOnLinkedIn = () => {
    const url = encodeURIComponent(
      `${window.location.origin}/?repo=${encodeURIComponent(repoUrl.trim())}`,
    );
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, "_blank");
  };

  return (
    <main className="relative min-h-screen overflow-x-hidden px-4 py-8 md:px-10">
      <div className="pointer-events-none absolute inset-0 grid-overlay opacity-25" />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 md:gap-8">
        <motion.section
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="signal-frame scan-lines relative overflow-hidden rounded-2xl p-6 md:p-10"
        >
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent-primary)] to-transparent opacity-60" />
          <p className="mono text-xs uppercase tracking-[0.25em] text-[var(--accent-secondary)]">
            VibeScore // Repository Forensics
          </p>
          <h1 className="mt-5 max-w-2xl text-4xl font-bold uppercase leading-tight text-white md:text-6xl">
            WE INVESTIGATE CODE.
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[var(--muted)] md:text-base">
            Paste a GitHub repository URL and receive a complete forensic investigation report covering AI-assisted development patterns, maintainability, documentation quality, technical debt, architecture health, and production readiness.
          </p>

          <div className="mt-8 flex flex-col gap-3 md:flex-row">
            <Input
              value={repoUrl}
              onChange={(event) => setRepoUrl(event.target.value)}
              placeholder="github.com/user/repository"
              className="text-sm md:text-base"
            />
            <Button
              onClick={handleInvestigation}
              disabled={isSubmitting}
              className="h-14 min-w-56"
            >
              OPEN INVESTIGATION
            </Button>
          </div>

          {error ? (
            <div className="mt-4 inline-flex items-center gap-2 rounded-md border border-[var(--danger)]/60 bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)]">
              <AlertTriangle className="h-3.5 w-3.5" />
              {error}
            </div>
          ) : null}
        </motion.section>

        {phase === "investigating" ? (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="signal-frame scan-lines relative overflow-hidden rounded-2xl p-5 md:p-7"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
              <div>
                <p className="mono text-xs uppercase tracking-[0.18em] text-[var(--accent-primary)]">
                  Live Investigation Console
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Decoding repository signals and assembling forensic dossier.
                </p>
              </div>
              <Binary className="h-4 w-4 text-[var(--accent-secondary)]" />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-[1.6fr_1fr]">
              <div className="rounded-lg border border-[var(--border)] bg-black/35 p-4 mono text-xs leading-6 text-[#a8ffe0]">
                {logs.map((line) => (
                  <div key={line}>{line}</div>
                ))}
                {typingLine ? <div>{typingLine}<span className="animate-pulse">_</span></div> : null}
              </div>

              <div className="rounded-lg border border-[var(--border)] bg-black/25 p-4">
                <p className="mono text-[0.65rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                  Investigation Timeline
                </p>
                <div className="mt-3 space-y-2">
                  {INVESTIGATION_LOGS.map((line, index) => {
                    const done = index < logs.length;
                    return (
                      <div key={line} className="flex items-center gap-2 text-xs">
                        <span
                          className={`h-2 w-2 rounded-full ${done ? "bg-[var(--accent-primary)]" : "bg-zinc-700"}`}
                        />
                        <span className={done ? "text-zinc-100" : "text-zinc-500"}>{line.replace("[✓] ", "")}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.section>
        ) : null}

        {phase === "report" && report ? (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="space-y-6"
          >
            <Panel className="overflow-hidden">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="mono text-xs uppercase tracking-[0.18em] text-[var(--accent-secondary)]">CASE FILE</p>
                  <h2 className="mt-2 text-2xl font-bold uppercase md:text-3xl">{report.caseId}</h2>
                  <p className="mt-3 text-sm text-[var(--muted)]">Repository: {report.repository.fullName}</p>
                  <p className="text-sm text-[var(--muted)]">Investigation Status: COMPLETE</p>
                </div>
                <div className="stamp rounded-md px-5 py-2 text-center text-sm font-bold uppercase tracking-[0.2em]">
                  Complete
                </div>
              </div>
            </Panel>

            <Panel>
              <h3 className="text-lg font-semibold uppercase tracking-[0.08em]">Repository Identity</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {statLabel("Repository Name", report.repository.fullName)}
                {statLabel("Primary Languages", report.repository.primaryLanguages.join(", "))}
                {statLabel("Total Files", report.repository.totalFiles)}
                {statLabel("Contributors", report.repository.contributors)}
                {statLabel("Repository Age", report.repository.repositoryAge)}
                {statLabel("Last Activity", report.repository.lastActivity)}
                {statLabel("Dependency Count", report.repository.dependencyCount)}
              </div>
            </Panel>

            <div className="grid gap-6 xl:grid-cols-2">
              <Panel>
                <h3 className="text-lg font-semibold uppercase">AI Assistance Analysis</h3>
                <p className={`mt-3 text-4xl font-bold ${scoreTint(report.aiAssistance.score)}`}>
                  {report.aiAssistance.score}%
                </p>
                <p className="mono mt-1 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                  Confidence: {report.aiAssistance.confidence}
                </p>
                <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">{report.aiAssistance.narrative}</p>
              </Panel>

              <Panel>
                <h3 className="text-lg font-semibold uppercase">Documentation Evidence</h3>
                <p className="mt-3 text-4xl font-bold text-[var(--accent-primary)]">{report.documentation.score}</p>
                <p className="mono mt-1 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                  Status: {report.documentation.status}
                </p>
                <div className="mt-4 grid gap-2 text-sm">
                  {report.documentation.checklist.length > 0 ? (
                    report.documentation.checklist.map((item) => (
                      <div key={item} className="text-zinc-200">
                        ✓ {item}
                      </div>
                    ))
                  ) : (
                    <div className="text-[var(--muted)]">No strong documentation indicators detected.</div>
                  )}
                </div>
              </Panel>

              <Panel>
                <h3 className="text-lg font-semibold uppercase">Maintainability Analysis</h3>
                <p className={`mt-3 text-4xl font-bold ${scoreTint(report.maintainability.score)}`}>
                  {report.maintainability.score}
                </p>
                <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">
                  {report.maintainability.narrative}
                </p>
              </Panel>

              <Panel>
                <h3 className="text-lg font-semibold uppercase">Architecture Review</h3>
                <p className="mt-3 text-4xl font-bold text-[var(--accent-secondary)]">{report.architecture.grade}</p>
                <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">
                  {report.architecture.assessment}
                </p>
              </Panel>

              <Panel>
                <h3 className="text-lg font-semibold uppercase">Technical Debt Index</h3>
                <p className={`mt-3 text-4xl font-bold ${scoreTint(100 - report.technicalDebt.index)}`}>
                  {report.technicalDebt.index}%
                </p>
                <p className="mono mt-1 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                  Debt Level: {report.technicalDebt.debtLevel}
                </p>
                <div className="mt-4 space-y-2 text-sm text-[var(--muted)]">
                  {report.technicalDebt.findings.map((finding) => (
                    <p key={finding}>- {finding}</p>
                  ))}
                </div>
              </Panel>

              <Panel>
                <h3 className="text-lg font-semibold uppercase">Test Coverage Investigation</h3>
                <p className={`mt-3 text-4xl font-bold ${scoreTint(report.testing.coverageConfidence)}`}>
                  {report.testing.coverageConfidence}%
                </p>
                <p className="mono mt-1 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                  Coverage Confidence
                </p>
                <p className="mt-3 text-sm text-[var(--muted)]">Frameworks: {report.testing.frameworks.join(", ")}</p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{report.testing.health}</p>
              </Panel>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Panel>
                <h3 className="text-lg font-semibold uppercase">Risk Assessment</h3>
                <p
                  className={`mt-3 text-3xl font-bold uppercase ${
                    report.risk.level === "LOW"
                      ? "text-[var(--accent-primary)]"
                      : report.risk.level === "MEDIUM"
                        ? "text-[var(--accent-secondary)]"
                        : "text-[var(--danger)]"
                  }`}
                >
                  {report.risk.level} RISK
                </p>
                <p className="mt-3 text-sm text-[var(--muted)]">{report.risk.summary}</p>
              </Panel>

              <Panel>
                <h3 className="text-lg font-semibold uppercase">Repository Personality</h3>
                <p className="mt-3 text-3xl font-bold text-[var(--accent-secondary)]">{report.archetype}</p>
                <div className="mt-4 space-y-2 text-sm text-zinc-200">
                  {report.archetypeSummary.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </Panel>
            </div>

            <Panel className="relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--accent-primary)] to-transparent" />
              <p className="mono text-xs uppercase tracking-[0.18em] text-[var(--accent-primary)]">VERDICT</p>
              <p className="mt-3 max-w-3xl text-xl leading-relaxed text-zinc-100 md:text-2xl">{report.verdict.message}</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {statLabel("Production Readiness", report.verdict.productionReadiness)}
                {statLabel("Overall Health", `${report.verdict.overallHealth} / 100`)}
                {statLabel("Development Pattern", report.verdict.style)}
                {statLabel("Generated", new Date(report.generatedAt).toLocaleDateString())}
              </div>
            </Panel>

            <Panel>
              <h3 className="text-lg font-semibold uppercase">Shareable Report Card</h3>
              <div className="mt-4 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
                <div
                  ref={reportCardRef}
                  className="rounded-lg border border-[var(--border)] bg-black/35 p-5 mono text-sm text-[#bcffe8]"
                >
                  <pre className="whitespace-pre-wrap">
{`━━━━━━━━━━━━━━━━━━

VIBESCORE REPORT

Repository:
${report.repository.fullName}

Health Score:
${report.verdict.overallHealth}

AI Assistance:
${report.aiAssistance.score}%

Documentation:
${report.documentation.score}

Maintainability:
${report.maintainability.score}

Verdict:
${report.verdict.style}

━━━━━━━━━━━━━━━━━━`}
                  </pre>
                </div>

                <div className="space-y-3">
                  <Button variant="outline" className="w-full justify-start gap-2" onClick={downloadReportCard}>
                    <Download className="h-4 w-4" />
                    Download PNG
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2" onClick={copyPublicLink}>
                    <Copy className="h-4 w-4" />
                    Copy Public Link
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2" onClick={shareOnX}>
                    <Share2 className="h-4 w-4" />
                    Share on X
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2" onClick={shareOnLinkedIn}>
                    <Link2 className="h-4 w-4" />
                    Share on LinkedIn
                  </Button>
                  <a
                    href={`https://github.com/${report.repository.fullName}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full items-center justify-start gap-2 rounded-md border border-[var(--border)] px-4 py-3 text-xs uppercase tracking-[0.12em] text-[var(--muted)] transition hover:border-[var(--accent-secondary)] hover:text-[var(--accent-secondary)]"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Repository
                  </a>
                </div>
              </div>
            </Panel>
          </motion.section>
        ) : null}

        <div className="flex items-center justify-end gap-3 pb-6 text-[0.65rem] uppercase tracking-[0.15em] text-zinc-500">
          <Radar className="h-3.5 w-3.5" />
          Threat-model inspired repository intelligence
        </div>
      </div>
    </main>
  );
}
