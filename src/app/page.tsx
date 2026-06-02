"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import Image from "next/image";
import {
  AlertTriangle,
  Binary,
  Coffee,
  Copy,
  Download,
  ExternalLink,
  GitFork,
  Link2,
  Share2,
  Star,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { RULE_PACKS } from "@/lib/rule-packs";
import {
  type ComparisonReport,
  type HistoricalInvestigation,
  type InvestigationApiResponse,
  type InvestigationReport,
  type OrganizationSummary,
  type RulePackId,
} from "@/types/report";

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

const PROJECT_REPO = "adsalihac/vibe-score";
const BUY_ME_COFFEE_URL = "https://www.buymeacoffee.com/adsalihac";

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
  const [repoUrl, setRepoUrl] = useState("");
  const [compareRepoUrl, setCompareRepoUrl] = useState("");
  const [mode, setMode] = useState<"single" | "compare">("single");
  const [phase, setPhase] = useState<Phase>("idle");
  const [report, setReport] = useState<InvestigationReport | null>(null);
  const [comparison, setComparison] = useState<ComparisonReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [typingLine, setTypingLine] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [starCount, setStarCount] = useState<number | null>(null);
  const [rulePack, setRulePack] = useState<RulePackId>("startup");
  const [history, setHistory] = useState<HistoricalInvestigation[]>([]);
  const [orgSummary, setOrgSummary] = useState<OrganizationSummary | null>(null);
  const [persistenceNote, setPersistenceNote] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<"daily" | "weekly" | "monthly">("weekly");
  const reportCardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;

    const loadStars = async () => {
      try {
        const response = await fetch(`/api/stars?repo=${encodeURIComponent(PROJECT_REPO)}`);
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { stars?: number | null };
        if (mounted && typeof data.stars === "number") {
          setStarCount(data.stars);
        }
      } catch {
        // Ignore star count failures and keep UI functional.
      }
    };

    void loadStars();
    return () => {
      mounted = false;
    };
  }, []);

  const topShareLine = useMemo(() => {
    if (report) {
      return `${report.repository.fullName} | Health ${report.verdict.overallHealth} | ${report.verdict.style}`;
    }
    if (comparison) {
      const lead = Math.abs(comparison.left.verdict.overallHealth - comparison.right.verdict.overallHealth);
      return `Compare ${comparison.left.repository.fullName} vs ${comparison.right.repository.fullName} | Health Δ ${lead}`;
    }
    return "";
  }, [comparison, report]);

  const activeRulePack = useMemo(() => {
    return RULE_PACKS.find((pack) => pack.id === rulePack) ?? RULE_PACKS[0];
  }, [rulePack]);

  const negativeComparisonMetrics = useMemo(
    () => new Set(["Technical Debt", "Risk Tier"]),
    [],
  );

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

  const fetchHistory = useCallback(async (fullName: string) => {
    try {
      const response = await fetch(`/api/history?repo=${encodeURIComponent(fullName)}`);
      const data = (await response.json()) as { items: HistoricalInvestigation[] };
      if (!response.ok) {
        return;
      }
      setHistory(data.items ?? []);
    } catch {
      setHistory([]);
    }
  }, []);

  const fetchOrgSummary = useCallback(async (owner: string) => {
    try {
      const response = await fetch(`/api/org-summary?owner=${encodeURIComponent(owner)}`);
      const data = (await response.json()) as OrganizationSummary;
      if (!response.ok) {
        return;
      }
      setOrgSummary(data);
    } catch {
      setOrgSummary(null);
    }
  }, []);

  const handleInvestigation = async () => {
    if (!repoUrl.trim()) {
      setError("Please enter a GitHub repository URL.");
      return;
    }

    setError(null);
    setReport(null);
    setComparison(null);
    setHistory([]);
    setOrgSummary(null);
    setPersistenceNote(null);
    setPhase("investigating");
    setIsSubmitting(true);

    const stopLogAnimation = runLogAnimation();
    const start = Date.now();

    try {
      const response = await fetch("/api/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl, rulePack }),
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
      void fetchHistory(data.report.repository.fullName);
      void fetchOrgSummary(data.report.repository.owner);
      setComparison(null);
      setPersistenceNote(
        data.persistence?.enabled === false
          ? data.persistence.message ?? "History persistence is currently unavailable."
          : null,
      );
      setPhase("report");
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

  const handleComparison = async () => {
    if (!repoUrl.trim() || !compareRepoUrl.trim()) {
      setError("Please enter two GitHub repository URLs.");
      return;
    }

    setError(null);
    setReport(null);
    setComparison(null);
    setHistory([]);
    setOrgSummary(null);
    setPersistenceNote(null);
    setPhase("investigating");
    setIsSubmitting(true);

    const stopLogAnimation = runLogAnimation();
    const start = Date.now();

    try {
      const response = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leftRepoUrl: repoUrl,
          rightRepoUrl: compareRepoUrl,
          rulePack,
        }),
      });

      const data = (await response.json()) as ComparisonReport | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "Comparison failed.");
      }

      const elapsed = Date.now() - start;
      if (elapsed < 5200) {
        await new Promise((resolve) => setTimeout(resolve, 5200 - elapsed));
      }

      setLogs(INVESTIGATION_LOGS);
      setComparison(data);
      setPhase("report");
    } catch (err) {
      setPhase("idle");
      setError(err instanceof Error ? err.message : "Comparison failed.");
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

  const downloadReportJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vibescore-${report.repository.owner}-${report.repository.name}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadComparisonJson = () => {
    if (!comparison) return;
    const blob = new Blob([JSON.stringify(comparison, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `vibescore-compare-${comparison.left.repository.owner}-${comparison.right.repository.owner}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadReportPdf = async () => {
    if (!reportCardRef.current || !report) return;
    setIsExportingPdf(true);

    try {
      const dataUrl = await toPng(reportCardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: "#050505",
      });

      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const img = pdf.getImageProperties(dataUrl);
      const pageWidth = pdf.internal.pageSize.getWidth() - 48;
      const pageHeight = pdf.internal.pageSize.getHeight() - 48;
      const ratio = Math.min(pageWidth / img.width, pageHeight / img.height);
      const renderWidth = img.width * ratio;
      const renderHeight = img.height * ratio;
      const offsetX = (pdf.internal.pageSize.getWidth() - renderWidth) / 2;
      const offsetY = (pdf.internal.pageSize.getHeight() - renderHeight) / 2;

      pdf.addImage(dataUrl, "PNG", offsetX, offsetY, renderWidth, renderHeight);
      pdf.save(`vibescore-${report.repository.owner}-${report.repository.name}.pdf`);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const copyPublicLink = async () => {
    const url = window.location.origin;
    await navigator.clipboard.writeText(url);
  };

  const shareOnX = () => {
    if (!report && !comparison) return;
    const text = encodeURIComponent(`VibeScore Investigation: ${topShareLine}`);
    const url = encodeURIComponent(window.location.origin);
    window.open(`https://x.com/intent/tweet?text=${text}&url=${url}`, "_blank");
  };

  const shareOnLinkedIn = () => {
    const url = encodeURIComponent(window.location.origin);
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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Image
              src="/logo-mark.svg"
              alt="VibeScore"
              width={56}
              height={56}
              unoptimized
              priority
              className="h-14 w-14 shrink-0"
            />
            <p className="mono text-xs uppercase tracking-[0.25em] text-[var(--accent-secondary)]">
              VibeScore // Repository Forensics
            </p>
          </div>
          <h1 className="mt-5 max-w-2xl text-4xl font-bold uppercase leading-tight text-white md:text-6xl">
            WE INVESTIGATE CODE.
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[var(--muted)] md:text-base">
            Paste a GitHub repository URL and receive a complete forensic investigation report covering AI-assisted development patterns, maintainability, documentation quality, technical debt, architecture health, and production readiness.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={mode === "single" ? "primary" : "outline"}
              onClick={() => setMode("single")}
              disabled={isSubmitting}
            >
              Single Repo
            </Button>
            <Button
              size="sm"
              variant={mode === "compare" ? "primary" : "outline"}
              onClick={() => setMode("compare")}
              disabled={isSubmitting}
            >
              Compare Repos
            </Button>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-[1.2fr_1fr]">
            <div className="rounded-md border border-[var(--border)] bg-black/20 p-4">
              <p className="mono text-[0.65rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                Rule Pack
              </p>
              <select
                className="mt-2 w-full rounded-md border border-[var(--border)] bg-black/30 px-3 py-2 text-sm text-[var(--foreground)]"
                value={rulePack}
                onChange={(event) => setRulePack(event.target.value as RulePackId)}
              >
                {RULE_PACKS.map((pack) => (
                  <option key={pack.id} value={pack.id}>
                    {pack.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-[var(--muted)]">{activeRulePack.description}</p>
            </div>
            <div className="rounded-md border border-[var(--border)] bg-black/20 p-4">
              <p className="mono text-[0.65rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                Focus
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--foreground)]">
                {activeRulePack.emphasis.map((item) => (
                  <span key={item} className="rounded-md border border-[var(--border)] px-2 py-1">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <div className={`grid gap-3 ${mode === "compare" ? "md:grid-cols-2" : ""}`}>
              <Input
                value={repoUrl}
                onChange={(event) => setRepoUrl(event.target.value)}
                placeholder="github.com/user/repository"
                className="text-sm md:text-base"
              />
              {mode === "compare" ? (
                <Input
                  value={compareRepoUrl}
                  onChange={(event) => setCompareRepoUrl(event.target.value)}
                  placeholder="github.com/user/another-repo"
                  className="text-sm md:text-base"
                />
              ) : null}
            </div>
            <div className="flex flex-col gap-3 md:flex-row">
              <Button
                onClick={mode === "compare" ? handleComparison : handleInvestigation}
                disabled={isSubmitting}
                className="h-14 min-w-56"
              >
                {mode === "compare" ? "COMPARE REPOS" : "OPEN INVESTIGATION"}
              </Button>
            </div>
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

        {phase === "report" && (report || comparison) ? (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="space-y-6"
          >
            {comparison ? (
              <>
                <Panel className="overflow-hidden">
                  <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="mono text-xs uppercase tracking-[0.18em] text-[var(--accent-secondary)]">
                        Comparison Dossier
                      </p>
                      <h2 className="mt-2 text-2xl font-bold uppercase md:text-3xl">
                        Dual Repo Analysis
                      </h2>
                      <p className="mt-3 text-sm text-[var(--muted)]">
                        Rule Pack: {comparison.left.rulePack}
                      </p>
                    </div>
                    <div className="stamp rounded-md px-5 py-2 text-center text-sm font-bold uppercase tracking-[0.2em]">
                      Complete
                    </div>
                  </div>
                </Panel>

                <Panel>
                  <h3 className="text-lg font-semibold uppercase">Comparison Callouts</h3>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {statLabel("Strongest Signal", comparison.callouts.strongestRepo)}
                    {statLabel("Most Risky", comparison.callouts.mostRiskyRepo)}
                    {statLabel("Health Lead", `${comparison.callouts.healthLead} pts`)}
                    {statLabel("Risk Gap", `${comparison.callouts.riskGap} tier(s)`)}
                  </div>
                </Panel>

                <div className="grid gap-6 lg:grid-cols-2">
                  <Panel>
                    <h3 className="text-lg font-semibold uppercase">
                      {comparison.left.repository.fullName}
                    </h3>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {statLabel("Overall Health", `${comparison.left.verdict.overallHealth} / 100`)}
                      {statLabel("AI Assistance", `${comparison.left.aiAssistance.score}%`)}
                      {statLabel("Documentation", `${comparison.left.documentation.score}`)}
                      {statLabel("Maintainability", `${comparison.left.maintainability.score}`)}
                      {statLabel("Technical Debt", `${comparison.left.technicalDebt.index}%`)}
                      {statLabel("Testing", `${comparison.left.testing.coverageConfidence}%`)}
                      {statLabel("Risk Level", comparison.left.risk.level)}
                    </div>
                  </Panel>

                  <Panel>
                    <h3 className="text-lg font-semibold uppercase">
                      {comparison.right.repository.fullName}
                    </h3>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {statLabel("Overall Health", `${comparison.right.verdict.overallHealth} / 100`)}
                      {statLabel("AI Assistance", `${comparison.right.aiAssistance.score}%`)}
                      {statLabel("Documentation", `${comparison.right.documentation.score}`)}
                      {statLabel("Maintainability", `${comparison.right.maintainability.score}`)}
                      {statLabel("Technical Debt", `${comparison.right.technicalDebt.index}%`)}
                      {statLabel("Testing", `${comparison.right.testing.coverageConfidence}%`)}
                      {statLabel("Risk Level", comparison.right.risk.level)}
                    </div>
                  </Panel>
                </div>

                <Panel>
                  <h3 className="text-lg font-semibold uppercase">Metric Deltas</h3>
                  <div className="mt-4 space-y-3 text-sm">
                    {comparison.deltas.map((delta) => (
                      <div key={delta.metric} className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-[var(--muted)]">{delta.metric}</span>
                        <span className="text-xs text-[var(--foreground)]">
                          {delta.left} → {delta.right}
                        </span>
                        <span
                          className={`text-xs font-semibold ${
                            delta.delta === 0
                              ? "text-[var(--muted)]"
                              : negativeComparisonMetrics.has(delta.metric)
                                ? delta.delta > 0
                                  ? "text-[var(--danger)]"
                                  : "text-[var(--accent-primary)]"
                                : delta.delta > 0
                                  ? "text-[var(--accent-primary)]"
                                  : "text-[var(--danger)]"
                          }`}
                        >
                          {delta.delta > 0 ? "+" : ""}
                          {delta.delta}
                        </span>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel>
                  <h3 className="text-lg font-semibold uppercase">Export Comparison</h3>
                  <div className="mt-4">
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                      onClick={downloadComparisonJson}
                    >
                      <Download className="h-4 w-4" />
                      Download Comparison JSON
                    </Button>
                  </div>
                </Panel>
              </>
            ) : null}
            {report ? (
              <>
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
                {statLabel("Rule Pack", report.rulePack)}
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
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={downloadReportPdf}
                    disabled={isExportingPdf}
                  >
                    <Download className="h-4 w-4" />
                    {isExportingPdf ? "Building PDF..." : "Download PDF"}
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2" onClick={downloadReportJson}>
                    <Download className="h-4 w-4" />
                    Download JSON
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

            <Panel>
              <h3 className="text-lg font-semibold uppercase">Explainable Findings</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {report.explainableFindings.map((finding) => (
                  <div key={finding.id} className="rounded-lg border border-[var(--border)] bg-black/25 p-4">
                    <p className="mono text-[0.65rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                      {finding.category}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-[var(--foreground)]">{finding.title}</p>
                    <p className="mt-2 text-xs text-[var(--muted)]">{finding.summary}</p>
                    <div className="mt-3 space-y-2 text-xs text-zinc-200">
                      {finding.evidence.map((evidence) => (
                        <div key={`${finding.id}-${evidence.label}`} className="flex flex-col gap-1">
                          <span className="text-[var(--muted)]">{evidence.label}</span>
                          <span>{evidence.value}</span>
                          {evidence.path ? (
                            <span className="text-[0.7rem] text-[var(--accent-secondary)]">
                              {evidence.path}
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <div className="grid gap-6 lg:grid-cols-2">
              <Panel>
                <h3 className="text-lg font-semibold uppercase">Historical Trend Scans</h3>
                {persistenceNote ? (
                  <div className="mt-3 rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)]">
                    {persistenceNote}
                  </div>
                ) : null}
                <div className="mt-4 space-y-3 text-xs text-[var(--muted)]">
                  {history.length === 0 ? (
                    <p>No prior scans stored yet.</p>
                  ) : (
                    history.map((item) => (
                      <div key={item.caseId} className="flex items-center gap-3">
                        <span className="w-20 text-[0.65rem] uppercase tracking-[0.12em] text-[var(--muted)]">
                          {new Date(item.generatedAt).toLocaleDateString()}
                        </span>
                        <div className="h-2 flex-1 rounded-full bg-black/40">
                          <div
                            className="h-2 rounded-full bg-[var(--accent-primary)]"
                            style={{ width: `${item.overallHealth}%` }}
                          />
                        </div>
                        <span className="text-[var(--foreground)]">{item.overallHealth}</span>
                      </div>
                    ))
                  )}
                </div>
              </Panel>

              <Panel>
                <h3 className="text-lg font-semibold uppercase">Organization Snapshot</h3>
                {orgSummary ? (
                  <div className="mt-4 space-y-3 text-sm text-[var(--muted)]">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {statLabel("Owner", orgSummary.owner)}
                      {statLabel("Repos Tracked", orgSummary.totalRepos)}
                      {statLabel("Total Scans", orgSummary.totalScans)}
                      {statLabel("Average Health", `${orgSummary.averageHealth} / 100`)}
                      {statLabel("High Risk", orgSummary.riskBreakdown.HIGH)}
                      {statLabel("Medium Risk", orgSummary.riskBreakdown.MEDIUM)}
                      {statLabel("Low Risk", orgSummary.riskBreakdown.LOW)}
                    </div>
                    <div className="mt-3 space-y-2">
                      {orgSummary.topRepos.map((repoEntry) => (
                        <div key={repoEntry.repoFullName} className="flex items-center justify-between text-xs">
                          <span className="text-[var(--foreground)]">{repoEntry.repoFullName}</span>
                          <span className="text-[var(--muted)]">
                            {repoEntry.averageHealth} avg / {repoEntry.scans} scans
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-[var(--muted)]">No organization history yet.</p>
                )}
              </Panel>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Panel>
                <h3 className="text-lg font-semibold uppercase">CI / GitHub App Integration</h3>
                <p className="mt-3 text-xs text-[var(--muted)]">
                  Use the CI summary endpoint or a scheduled GitHub Actions workflow to keep scans fresh.
                </p>
                <div className="mt-4 space-y-3">
                  <label className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                    Schedule cadence
                  </label>
                  <select
                    className="w-full rounded-md border border-[var(--border)] bg-black/30 px-3 py-2 text-xs text-[var(--foreground)]"
                    value={schedule}
                    onChange={(event) =>
                      setSchedule(event.target.value as "daily" | "weekly" | "monthly")
                    }
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                  <pre className="whitespace-pre-wrap rounded-md border border-[var(--border)] bg-black/40 p-3 text-[0.65rem] text-[#bcffe8]">
{`name: VibeScore Scan
on:
  schedule:
    - cron: "${schedule === "daily" ? "0 2 * * *" : schedule === "weekly" ? "0 2 * * 1" : "0 3 1 * *"}"
  workflow_dispatch:
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger VibeScore
        run: |
          curl -X POST "$VIBESCORE_URL/api/ci-summary" \\
            -H "Content-Type: application/json" \\
            -d '{\"repoUrl\":\"https://github.com/${report.repository.fullName}\",\"rulePack\":\"${report.rulePack}\"}'`}
                  </pre>
                </div>
              </Panel>

              <Panel>
                <h3 className="text-lg font-semibold uppercase">Public Badge</h3>
                <p className="mt-3 text-xs text-[var(--muted)]">
                  Embed the latest health score badge in README or dashboards.
                </p>
                <div className="mt-4 space-y-3">
                  <Image
                    src={`/api/badge?repo=${encodeURIComponent(report.repository.fullName)}`}
                    alt="VibeScore badge"
                    width={310}
                    height={40}
                    unoptimized
                    className="h-8 w-auto"
                  />
                  <pre className="whitespace-pre-wrap rounded-md border border-[var(--border)] bg-black/40 p-3 text-[0.65rem] text-[#bcffe8]">
{`![VibeScore](/api/badge?repo=${report.repository.fullName})`}
                  </pre>
                </div>
              </Panel>
            </div>
              </>
            ) : null}
          </motion.section>
        ) : null}

        <div className="flex flex-col items-start justify-between gap-3 pb-6 md:flex-row md:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`https://github.com/${PROJECT_REPO}/fork`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-black/20 px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-zinc-200 transition hover:border-[var(--accent-secondary)] hover:text-[var(--accent-secondary)]"
            >
              <GitFork className="h-3.5 w-3.5" />
              Contribute
            </a>
            <a
              href={`https://github.com/${PROJECT_REPO}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-black/20 px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-zinc-300 transition hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]"
            >
              <Star className="h-3.5 w-3.5" />
              {starCount === null ? "Stars --" : `Stars ${starCount}`}
            </a>
          </div>

          <a
            href={BUY_ME_COFFEE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-black/20 px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#ffd36d] transition hover:border-[#ffd36d]/70 hover:bg-[#ffd36d]/10"
          >
            <Coffee className="h-3.5 w-3.5" />
            Buy Me a Coffee
          </a>
        </div>
      </div>
    </main>
  );
}
