"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import Image from "next/image";
import {
  AlertTriangle,
  Binary,
  Bot,
  Calculator,
  CheckCircle2,
  ClipboardList,
  Coffee,
  Copy,
  Download,
  ExternalLink,
  Gauge,
  GitFork,
  GitPullRequest,
  KeyRound,
  Link2,
  ListChecks,
  Mail,
  PackageSearch,
  Search,
  Share2,
  ShieldCheck,
  Star,
  TrendingUp,
  Trophy,
  Users,
  Wrench,
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
  type ScanTargetMode,
} from "@/types/report";

const INVESTIGATION_LOGS = [
  "[✓] Accessing repository",
  "[✓] Reading file structure",
  "[✓] Building dependency graph",
  "[✓] Assessing dependency risk",
  "[✓] Inspecting commit history",
  "[✓] Detecting generation patterns",
  "[✓] Evaluating architecture",
  "[✓] Measuring maintainability",
  "[✓] Analyzing documentation",
  "[✓] Building repository report",
  "[✓] Analysis complete",
];

type Phase = "idle" | "investigating" | "report";
type RemediationPriorityFilter = "All" | "Critical" | "High" | "Medium";
type FindingCategoryFilter = "All" | InvestigationReport["explainableFindings"][number]["category"];
type VoiceMode = "roast" | "praise" | "investor" | "cto" | "junior";

const PROJECT_REPO = "adsalihac/vibe-score";
const BUY_ME_COFFEE_URL = "https://www.buymeacoffee.com/adsalihac";

function readInitialScanState() {
  return {
    repoUrl: "",
    compareRepoUrl: "",
    mode: "single" as const,
    rulePack: "startup" as RulePackId,
    scanScope: "default" as ScanTargetMode,
    branchRef: "",
    pullRequestNumber: "",
  };
}

function statLabel(label: string, value: string | number) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[rgba(31,82,31,0.1)] p-3 backdrop-blur-sm transition-colors duration-200 hover:border-[#33ff00]/40">
      <p className="mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-sm font-medium text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function scoreTint(value: number) {
  if (value >= 80) return "text-[var(--accent-primary)]";
  if (value >= 60) return "text-[var(--accent-secondary)]";
  return "text-[var(--danger)]";
}

function missionImpact(priority: "Critical" | "High" | "Medium", effort: "Low" | "Medium" | "High") {
  const priorityBoost = priority === "Critical" ? 12 : priority === "High" ? 8 : 5;
  const effortDrag = effort === "High" ? 1 : effort === "Medium" ? 0 : -1;
  return Math.max(3, priorityBoost - effortDrag);
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function voiceModeSummary(report: InvestigationReport, mode: VoiceMode) {
  const topMission = report.remediationPlan[0]?.title ?? "tighten the basics";
  const risk = `${report.risk.level.toLowerCase()} risk`;

  if (mode === "roast") {
    return `This repo is trying, but the scoreboard says ${report.verdict.overallHealth}/100. ${topMission} is the first thing to fix before the code asks for a long vacation.`;
  }
  if (mode === "praise") {
    return `${report.repository.fullName} has a clear foundation: ${report.verdict.style}, ${risk}, and a practical path upward. Nail ${topMission} and the next scan should feel meaningfully better.`;
  }
  if (mode === "investor") {
    return `Current readiness is ${report.verdict.productionReadiness}. The main diligence signal is ${risk}; the highest-leverage remediation is ${topMission}. This is a concise view of execution risk before deeper technical diligence.`;
  }
  if (mode === "cto") {
    return `Engineering readout: health ${report.verdict.overallHealth}/100, dependency risk ${report.dependencyRisk.score}/100, testing confidence ${report.testing.coverageConfidence}%. Prioritize ${topMission}, then rescan to validate movement.`;
  }

  return `Think of the score as a repo report card. The biggest homework item is: ${topMission}. Fix that, run VibeScore again, and watch which bars move up or down.`;
}

export default function Home() {
  const initialScanState = readInitialScanState();
  const [repoUrl, setRepoUrl] = useState(initialScanState.repoUrl);
  const [compareRepoUrl, setCompareRepoUrl] = useState(initialScanState.compareRepoUrl);
  const [mode, setMode] = useState<"single" | "compare">(initialScanState.mode);
  const [phase, setPhase] = useState<Phase>("idle");
  const [report, setReport] = useState<InvestigationReport | null>(null);
  const [comparison, setComparison] = useState<ComparisonReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [typingLine, setTypingLine] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [starCount, setStarCount] = useState<number | null>(null);
  const [rulePack, setRulePack] = useState<RulePackId>(initialScanState.rulePack);
  const [history, setHistory] = useState<HistoricalInvestigation[]>([]);
  const [orgSummary, setOrgSummary] = useState<OrganizationSummary | null>(null);
  const [persistenceNote, setPersistenceNote] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [scanScope, setScanScope] = useState<ScanTargetMode>(initialScanState.scanScope);
  const [branchRef, setBranchRef] = useState(initialScanState.branchRef);
  const [pullRequestNumber, setPullRequestNumber] = useState(initialScanState.pullRequestNumber);
  const [githubToken, setGithubToken] = useState("");
  const [remediationPriority, setRemediationPriority] = useState<RemediationPriorityFilter>("All");
  const [findingCategory, setFindingCategory] = useState<FindingCategoryFilter>("All");
  const [reportSearch, setReportSearch] = useState("");
  const [clipboardMessage, setClipboardMessage] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("cto");
  const [selectedSimulationMissions, setSelectedSimulationMissions] = useState<string[]>([]);
  const [outputScrollRequest, setOutputScrollRequest] = useState(0);
  const reportCardRef = useRef<HTMLDivElement>(null);
  const investigationOutputRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const savedToken = localStorage.getItem("vibescore_github_token") ?? "";
    if (savedToken) {
      setTimeout(() => {
        setGithubToken(savedToken);
      }, 0);
    }
  }, []);

  useEffect(() => {
    const applyUrlState = () => {
      const params = new URLSearchParams(window.location.search);
      const repo = params.get("repo");
      const compare = params.get("compare");
      const pack = params.get("rulePack");
      const scope = params.get("scope");
      const ref = params.get("ref");
      const pr = params.get("pr");

      if (repo) {
        setRepoUrl(repo);
      }
      if (compare) {
        setCompareRepoUrl(compare);
        setMode("compare");
      }
      if (pack && RULE_PACKS.some((item) => item.id === pack)) {
        setRulePack(pack as RulePackId);
      }
      if (scope === "branch" || scope === "pull_request" || scope === "default") {
        setScanScope(scope);
      }
      if (ref) {
        setBranchRef(ref);
      }
      if (pr) {
        setPullRequestNumber(pr);
      }
    };

    const timeout = window.setTimeout(applyUrlState, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const handleTokenChange = (val: string) => {
    setGithubToken(val);
    localStorage.setItem("vibescore_github_token", val);
  };

  const copyToClipboard = async (value: string, message: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    setClipboardMessage(message);
    window.setTimeout(() => setClipboardMessage(null), 2200);
  };

  const toggleSimulationMission = (id: string) => {
    setSelectedSimulationMissions((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

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

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (!report) {
        setSelectedSimulationMissions([]);
        return;
      }

      setSelectedSimulationMissions(report.remediationPlan.slice(0, 2).map((item) => item.id));
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [report]);

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

  const riskRank = useMemo(
    () => ({
      LOW: 1,
      MEDIUM: 2,
      HIGH: 3,
    }),
    [],
  );

  const previousScan = useMemo(() => {
    if (!report) {
      return null;
    }

    return history.find((item) => item.caseId !== report.caseId) ?? null;
  }, [history, report]);

  const trendDeltas = useMemo(() => {
    if (!report || !previousScan) {
      return [];
    }

    return [
      {
        metric: "Overall Health",
        previous: previousScan.overallHealth,
        current: report.verdict.overallHealth,
      },
      {
        metric: "Documentation",
        previous: previousScan.metrics.documentation,
        current: report.documentation.score,
      },
      {
        metric: "Maintainability",
        previous: previousScan.metrics.maintainability,
        current: report.maintainability.score,
      },
      {
        metric: "Technical Debt",
        previous: previousScan.metrics.technicalDebt,
        current: report.technicalDebt.index,
      },
      {
        metric: "Testing Confidence",
        previous: previousScan.metrics.testing,
        current: report.testing.coverageConfidence,
      },
      {
        metric: "Secret Hygiene",
        previous: previousScan.metrics.secretHygiene,
        current: report.secretHygiene.score,
      },
      {
        metric: "Dependency Risk",
        previous: previousScan.metrics.dependencyRisk ?? 0,
        current: report.dependencyRisk.score,
      },
      {
        metric: "Risk Tier",
        previous: riskRank[previousScan.riskLevel],
        current: riskRank[report.risk.level],
      },
    ].map((item) => ({
      ...item,
      delta: item.current - item.previous,
    }));
  }, [previousScan, report, riskRank]);

  const ciPayload = useMemo(() => {
    if (!report) {
      return "{}";
    }

    const payload: {
      repoUrl: string;
      rulePack: RulePackId;
      scanTarget?: {
        mode: ScanTargetMode;
        ref?: string;
        pullRequestNumber?: number;
      };
    } = {
      repoUrl: `https://github.com/${report.repository.fullName}`,
      rulePack: report.rulePack,
    };

    if (report.scanTarget.mode === "branch") {
      payload.scanTarget = {
        mode: "branch",
        ref: report.scanTarget.requestedRef ?? report.scanTarget.headRef,
      };
    }

    if (report.scanTarget.mode === "pull_request") {
      payload.scanTarget = {
        mode: "pull_request",
        pullRequestNumber: report.scanTarget.pullRequestNumber,
      };
    }

    return JSON.stringify(payload);
  }, [report]);

  const shareableScanUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (repoUrl.trim()) {
      params.set("repo", repoUrl.trim());
    }
    if (mode === "compare" && compareRepoUrl.trim()) {
      params.set("compare", compareRepoUrl.trim());
    }
    params.set("rulePack", rulePack);
    if (mode === "single" && scanScope !== "default") {
      params.set("scope", scanScope);
      if (scanScope === "branch" && branchRef.trim()) {
        params.set("ref", branchRef.trim());
      }
      if (scanScope === "pull_request" && pullRequestNumber.trim()) {
        params.set("pr", pullRequestNumber.trim());
      }
    }

    const query = params.toString();
    return `${typeof window !== "undefined" ? window.location.origin : ""}${query ? `?${query}` : ""}`;
  }, [branchRef, compareRepoUrl, mode, pullRequestNumber, repoUrl, rulePack, scanScope]);

  const ciWorkflow = useMemo(() => {
    return `name: VibeScore Scan
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
          curl -X POST "${typeof window !== "undefined" ? window.location.origin : ""}/api/ci-summary" \\
            -H "Content-Type: application/json" \\
            -d '${ciPayload}'`;
  }, [ciPayload, schedule]);

  const scoreBreakdown = useMemo(() => {
    if (!report) {
      return [];
    }

    return [
      { label: "Overall Health", value: report.verdict.overallHealth, positive: true },
      { label: "Documentation", value: report.documentation.score, positive: true },
      { label: "Maintainability", value: report.maintainability.score, positive: true },
      { label: "Testing Confidence", value: report.testing.coverageConfidence, positive: true },
      { label: "Secret Hygiene", value: report.secretHygiene.score, positive: true },
      { label: "Dependency Risk", value: report.dependencyRisk.score, positive: true },
      { label: "Technical Debt", value: report.technicalDebt.index, positive: false },
      { label: "AI Assistance", value: report.aiAssistance.score, positive: true },
    ];
  }, [report]);

  const filteredRemediationPlan = useMemo(() => {
    if (!report) {
      return [];
    }

    const query = reportSearch.trim().toLowerCase();
    return report.remediationPlan.filter((item) => {
      const priorityMatches = remediationPriority === "All" || item.priority === remediationPriority;
      const queryMatches =
        !query ||
        [item.category, item.title, item.summary, item.impact, ...item.actions]
          .join(" ")
          .toLowerCase()
          .includes(query);

      return priorityMatches && queryMatches;
    });
  }, [remediationPriority, report, reportSearch]);

  const filteredFindings = useMemo(() => {
    if (!report) {
      return [];
    }

    const query = reportSearch.trim().toLowerCase();
    return report.explainableFindings.filter((finding) => {
      const categoryMatches = findingCategory === "All" || finding.category === findingCategory;
      const queryMatches =
        !query ||
        [
          finding.category,
          finding.title,
          finding.summary,
          ...finding.evidence.flatMap((evidence) => [evidence.label, evidence.value, evidence.path ?? ""]),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);

      return categoryMatches && queryMatches;
    });
  }, [findingCategory, report, reportSearch]);

  const findingCategories = useMemo(() => {
    if (!report) {
      return [];
    }

    return Array.from(new Set(report.explainableFindings.map((finding) => finding.category)));
  }, [report]);

  const fixMissions = useMemo(() => {
    if (!report) {
      return [];
    }

    return report.remediationPlan.slice(0, 5).map((item, index) => ({
      ...item,
      missionNumber: index + 1,
      estimatedGain: missionImpact(item.priority, item.effort),
    }));
  }, [report]);

  const simulation = useMemo(() => {
    if (!report) {
      return null;
    }

    const selected = fixMissions.filter((mission) => selectedSimulationMissions.includes(mission.id));
    const projectedGain = selected.reduce((total, mission) => total + mission.estimatedGain, 0);

    return {
      selected,
      projectedGain,
      projectedScore: clampScore(report.verdict.overallHealth + projectedGain),
    };
  }, [fixMissions, report, selectedSimulationMissions]);

  const publicProfileUrl = useMemo(() => {
    if (!report) {
      return "";
    }

    return `${typeof window !== "undefined" ? window.location.origin : ""}/r/${report.repository.owner}/${report.repository.name}`;
  }, [report]);

  const progressSummary = useMemo(() => {
    if (!report || !previousScan) {
      return null;
    }

    const healthDelta = report.verdict.overallHealth - previousScan.overallHealth;
    const improvedMetrics = trendDeltas.filter((delta) => {
      const lowerIsBetter = negativeComparisonMetrics.has(delta.metric);
      return lowerIsBetter ? delta.delta < 0 : delta.delta > 0;
    });
    const regressedMetrics = trendDeltas.filter((delta) => {
      const lowerIsBetter = negativeComparisonMetrics.has(delta.metric);
      return lowerIsBetter ? delta.delta > 0 : delta.delta < 0;
    });

    return {
      healthDelta,
      improvedMetrics,
      regressedMetrics,
    };
  }, [negativeComparisonMetrics, previousScan, report, trendDeltas]);

  const voiceSummary = useMemo(() => {
    if (!report) {
      return "";
    }

    return voiceModeSummary(report, voiceMode);
  }, [report, voiceMode]);

  const weeklyDigest = useMemo(() => {
    if (!report) {
      return "";
    }

    const delta = progressSummary
      ? `${progressSummary.healthDelta > 0 ? "+" : ""}${progressSummary.healthDelta} health points since the previous scan`
      : "No previous baseline yet";
    const dependencyLine =
      report.dependencyRisk.highRiskCount > 0
        ? `${report.dependencyRisk.highRiskCount} high-risk dependencies need review`
        : "No high-risk dependency concentration detected";
    const docsLine =
      report.documentation.score >= 75
        ? "Documentation is in useful shape"
        : "Documentation needs handoff-ready improvements";

    return `Weekly VibeScore Digest

Repository: ${report.repository.fullName}
Health: ${report.verdict.overallHealth}/100 (${delta})
Risk: ${report.risk.level}
Dependency watch: ${dependencyLine}
Docs: ${docsLine}
Next mission: ${fixMissions[0]?.title ?? "Keep monitoring health after meaningful changes."}
Public profile: ${publicProfileUrl}`;
  }, [fixMissions, progressSummary, publicProfileUrl, report]);

  const prBotWorkflow = useMemo(() => {
    if (!report) {
      return "";
    }

    return `name: VibeScore PR Bot
on:
  pull_request:
    types: [opened, synchronize, reopened]
jobs:
  comment:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    steps:
      - name: Scan pull request
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
        run: |
          RESPONSE=$(curl -s -X POST "${typeof window !== "undefined" ? window.location.origin : ""}/api/ci-summary" \\
            -H "Content-Type: application/json" \\
            -H "Authorization: Bearer \${GH_TOKEN}" \\
            -d '{"repoUrl":"https://github.com/${report.repository.fullName}","rulePack":"${report.rulePack}","scanTarget":{"mode":"pull_request","pullRequestNumber":\${{ github.event.pull_request.number }}}}')
          BODY=$(echo "$RESPONSE" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).markdown||d))")
          gh pr comment \${{ github.event.pull_request.number }} --body "$BODY"`;
  }, [report]);

  const teamDashboardActions = useMemo(() => {
    if (!report) {
      return [];
    }

    return [
      {
        label: "Risky repos",
        value: orgSummary ? orgSummary.riskBreakdown.HIGH : report.risk.level === "HIGH" ? 1 : 0,
        note: report.risk.level === "HIGH" ? `${report.repository.fullName} needs owner attention.` : "No high-risk current scan.",
      },
      {
        label: "Improving",
        value: progressSummary && progressSummary.healthDelta > 0 ? `+${progressSummary.healthDelta}` : "Baseline",
        note: progressSummary ? `${progressSummary.improvedMetrics.length} signals improved.` : "Run a second scan to measure movement.",
      },
      {
        label: "Stale dependencies",
        value: report.dependencyRisk.highRiskCount,
        note: report.dependencyRisk.recommendations[0] ?? report.dependencyRisk.summary,
      },
      {
        label: "Needs handoff docs",
        value: report.documentation.score < 70 ? "Yes" : "No",
        note: report.documentation.score < 70 ? "Improve setup, deployment, and operating notes." : "Docs are currently serviceable.",
      },
    ];
  }, [orgSummary, progressSummary, report]);

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

    if (scanScope === "branch" && !branchRef.trim()) {
      setError("Please enter the branch name to scan.");
      return;
    }

    if (scanScope === "pull_request" && !pullRequestNumber.trim()) {
      setError("Please enter the pull request number to scan.");
      return;
    }

    window.history.replaceState(null, "", new URL(shareableScanUrl).search || window.location.pathname);
    setError(null);
    setReport(null);
    setComparison(null);
    setHistory([]);
    setOrgSummary(null);
    setPersistenceNote(null);
    setPhase("investigating");
    setOutputScrollRequest((request) => request + 1);
    setIsSubmitting(true);

    const stopLogAnimation = runLogAnimation();
    const start = Date.now();

    try {
      const response = await fetch("/api/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl,
          rulePack,
          githubToken: githubToken || undefined,
          scanTarget:
            scanScope === "default"
              ? { mode: "default" }
              : scanScope === "branch"
                ? { mode: "branch", ref: branchRef }
                : { mode: "pull_request", pullRequestNumber },
        }),
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

    window.history.replaceState(null, "", new URL(shareableScanUrl).search || window.location.pathname);
    setError(null);
    setReport(null);
    setComparison(null);
    setHistory([]);
    setOrgSummary(null);
    setPersistenceNote(null);
    setPhase("investigating");
    setOutputScrollRequest((request) => request + 1);
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
          githubToken: githubToken || undefined,
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
    await copyToClipboard(shareableScanUrl, "Share link copied");
  };

  const copyMarkdownReport = async () => {
    if (!report) return;

    const markdown = `# VibeScore Report: ${report.repository.fullName}

- Health: ${report.verdict.overallHealth}/100
- Production readiness: ${report.verdict.productionReadiness}
- Risk: ${report.risk.level}
- Rule pack: ${report.rulePack}
- Scan target: ${report.scanTarget.label}
- Dependency risk: ${report.dependencyRisk.level} (${report.dependencyRisk.score}/100)
- Secret hygiene: ${report.secretHygiene.status} (${report.secretHygiene.score}/100)

## Verdict
${report.verdict.message}

## Top Remediation
${report.remediationPlan
  .slice(0, 3)
  .map((item, index) => `${index + 1}. ${item.title} (${item.priority}, ${item.effort} effort): ${item.impact}`)
  .join("\n")}

Generated by VibeScore: ${shareableScanUrl}`;

    await copyToClipboard(markdown, "Markdown summary copied");
  };

  const shareOnX = () => {
    if (!report && !comparison) return;
    const text = encodeURIComponent(`VibeScore Report: ${topShareLine}`);
    const url = encodeURIComponent(window.location.origin);
    window.open(`https://x.com/intent/tweet?text=${text}&url=${url}`, "_blank");
  };

  const shareOnLinkedIn = () => {
    const url = encodeURIComponent(window.location.origin);
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, "_blank");
  };

  useEffect(() => {
    if (outputScrollRequest === 0 || phase === "idle") {
      return;
    }

    const scrollToOutput = () => {
      const output = investigationOutputRef.current;
      if (!output) {
        return;
      }

      const top = output.getBoundingClientRect().top + window.scrollY - 16;
      window.scrollTo({
        top: Math.max(0, top),
        behavior: "smooth",
      });
    };

    const frame = window.requestAnimationFrame(scrollToOutput);
    const timeout = window.setTimeout(scrollToOutput, 180);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [outputScrollRequest, phase]);

  return (
    <main className="relative min-h-screen overflow-x-hidden px-4 pb-10 pt-14 md:px-10 md:pb-14 md:pt-16">
      <div className="pointer-events-none absolute inset-0 grid-overlay" />
      <div className="pointer-events-none absolute left-[-10%] top-[-10%] h-72 w-72 rounded-full bg-[#33ff00]/15 blur-[120px]" />
      <div className="pointer-events-none absolute right-[-8%] top-[18%] h-80 w-80 rounded-full bg-[#ffb000]/10 blur-[140px]" />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 md:gap-8">
        <motion.section
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="signal-frame relative overflow-hidden rounded-2xl p-6 md:p-10"
        >
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#33ff00]/60 to-transparent" />
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
            <p className="mono text-xs uppercase tracking-[0.22em] text-[#ffb000]">
              VibeScore / Bitcoin DeFi Repo Intelligence
            </p>
          </div>
          <h1 className="mt-5 max-w-4xl text-4xl font-bold leading-tight text-[var(--foreground)] sm:text-5xl md:text-7xl">
            We investigate code.
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--muted)] md:text-lg">
            Paste a GitHub repository URL and get a practical report for maintainability, documentation, dependency risk, testing confidence, security hygiene, and production readiness.
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

          <div className="mt-6 grid gap-3 lg:grid-cols-3">
            <div className="rounded-2xl border border-[var(--border)] bg-[rgba(31,82,31,0.1)] p-4 backdrop-blur-sm">
              <p className="mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--muted)]">
                Rule Pack
              </p>
              <select
                className="mt-2 w-full rounded-xl border border-[var(--border)] bg-black/45 px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[#33ff00]"
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
            <div className="rounded-2xl border border-[var(--border)] bg-[rgba(31,82,31,0.1)] p-4 backdrop-blur-sm">
              <p className="mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--muted)]">
                Focus
              </p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--foreground)]">
                {activeRulePack.emphasis.map((item) => (
                  <span key={item} className="rounded-full border border-[var(--border)] bg-black/35 px-2.5 py-1.5">
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-[var(--border)] bg-[rgba(31,82,31,0.1)] p-4 backdrop-blur-sm">
              <p className="mono text-[0.65rem] uppercase tracking-[0.18em] text-[var(--muted)]">
                Scan Scope
              </p>
              <select
                className="mt-2 w-full rounded-xl border border-[var(--border)] bg-black/45 px-4 py-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[#33ff00]"
                value={scanScope}
                onChange={(event) => setScanScope(event.target.value as ScanTargetMode)}
                disabled={mode === "compare" || isSubmitting}
              >
                <option value="default">Default branch</option>
                <option value="branch">Branch</option>
                <option value="pull_request">Pull request</option>
              </select>
              {mode === "single" && scanScope === "branch" ? (
                <Input
                  value={branchRef}
                  onChange={(event) => setBranchRef(event.target.value)}
                  placeholder="feature/refactor-score"
                  className="mt-2 text-xs"
                />
              ) : null}
              {mode === "single" && scanScope === "pull_request" ? (
                <Input
                  value={pullRequestNumber}
                  onChange={(event) => setPullRequestNumber(event.target.value)}
                  placeholder="42"
                  className="mt-2 text-xs"
                />
              ) : null}
              {mode === "compare" ? (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Compare mode uses repository defaults.
                </p>
              ) : null}
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

            <details className="group overflow-hidden rounded-2xl border border-[var(--border)] bg-[rgba(31,82,31,0.1)] backdrop-blur-sm">
              <summary className="mono cursor-pointer select-none px-4 py-3 text-[0.65rem] uppercase tracking-[0.18em] text-[var(--muted)] transition-colors hover:text-[#ffb000]">
                Advanced: Scan Private Repositories (Optional)
              </summary>
              <div className="flex flex-col gap-3 border-t border-[var(--border)] bg-black/25 p-4">
                <p className="text-xs leading-relaxed text-[var(--muted)]">
                  Provide your GitHub Personal Access Token (PAT) to analyze private repositories. 
                  The token is only sent securely for this request and is never stored on our database.
                </p>
                <Input
                  type="password"
                  value={githubToken}
                  onChange={(event) => handleTokenChange(event.target.value)}
                  placeholder="ghp_... or github_pat_..."
                  className="text-xs"
                />
              </div>
            </details>

            <div className="flex flex-col gap-3 md:flex-row">
              <Button
                onClick={mode === "compare" ? handleComparison : handleInvestigation}
                disabled={isSubmitting}
                className="h-14 min-w-56 shadow-[0_0_30px_-8px_rgba(247,147,26,0.65)]"
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
          {clipboardMessage ? (
            <div className="mt-4 inline-flex items-center gap-2 rounded-md border border-[var(--accent-primary)]/50 bg-[var(--accent-primary)]/10 px-3 py-2 text-xs text-[var(--accent-primary)]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {clipboardMessage}
            </div>
          ) : null}
        </motion.section>

        {phase === "investigating" ? (
          <motion.section
            ref={investigationOutputRef}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="signal-frame relative overflow-hidden rounded-2xl p-5 md:p-7"
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
              <div>
                <p className="mono text-xs uppercase tracking-[0.2em] text-[#ffb000]">
                  Live analysis
                </p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Reading repository signals and preparing a practical health report.
                </p>
              </div>
              <Binary className="h-4 w-4 text-[#33ff00]" />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-[1.6fr_1fr]">
              <div className="mono rounded-2xl border border-[var(--border)] bg-black/45 p-4 text-xs leading-6 text-[#ffb000]">
                {logs.map((line) => (
                  <div key={line}>{line}</div>
                ))}
                {typingLine ? <div>{typingLine}<span className="animate-pulse">_</span></div> : null}
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[rgba(31,82,31,0.1)] p-4 backdrop-blur-sm">
                <p className="mono text-[0.65rem] text-[var(--muted)]">
                  Analysis timeline
                </p>
                <div className="mt-3 space-y-2">
                  {INVESTIGATION_LOGS.map((line, index) => {
                    const done = index < logs.length;
                    return (
                      <div key={line} className="flex items-center gap-2 text-xs">
                        <span
                          className={`h-2 w-2 rounded-full ${done ? "bg-[#33ff00] shadow-[0_0_12px_rgba(247,147,26,0.7)]" : "bg-zinc-700"}`}
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
            ref={investigationOutputRef}
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
                        Comparison Report
                      </p>
                      <h2 className="mt-2 text-2xl font-bold uppercase md:text-3xl">
                        Dual Repo Analysis
                      </h2>
                      <p className="mt-3 text-sm text-[var(--muted)]">
                        Rule Pack: {comparison.left.rulePack}
                      </p>
                    </div>
                    <div className="stamp rounded-md px-5 py-2 text-center text-sm font-semibold">
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
                      {statLabel("Dependency Risk", `${comparison.left.dependencyRisk.score}/100`)}
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
                      {statLabel("Dependency Risk", `${comparison.right.dependencyRisk.score}/100`)}
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
                  <p className="mono text-xs text-[var(--accent-secondary)]">Repository report</p>
                  <h2 className="mt-2 text-2xl font-bold uppercase md:text-3xl">{report.caseId}</h2>
                  <p className="mt-3 text-sm text-[var(--muted)]">Repository: {report.repository.fullName}</p>
                  <p className="text-sm text-[var(--muted)]">Report status: Complete</p>
                </div>
                <div className="stamp rounded-md px-5 py-2 text-center text-sm font-semibold">
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
                {statLabel("Dependency Risk", `${report.dependencyRisk.score}/100`)}
                {statLabel("Rule Pack", report.rulePack)}
                {statLabel("Scan Target", report.scanTarget.label)}
              </div>
              {report.scanTarget.mode === "pull_request" ? (
                <div className="mt-4 rounded-md border border-[var(--border)] bg-black/20 p-3 text-xs text-[var(--muted)]">
                  <div className="flex items-center gap-2 text-[var(--foreground)]">
                    <GitPullRequest className="h-3.5 w-3.5 text-[var(--accent-secondary)]" />
                    PR #{report.scanTarget.pullRequestNumber}: {report.scanTarget.pullRequestTitle}
                  </div>
                  <p className="mt-2">
                    {report.scanTarget.baseRef} → {report.scanTarget.headRef} / Changed files:{" "}
                    {report.scanTarget.changedFiles ?? "unknown"}
                  </p>
                </div>
              ) : null}
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

              <Panel>
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-[var(--accent-secondary)]" />
                  <h3 className="text-lg font-semibold uppercase">Secret Hygiene Review</h3>
                </div>
                <p className={`mt-3 text-4xl font-bold ${scoreTint(report.secretHygiene.score)}`}>
                  {report.secretHygiene.score}
                </p>
                <p className="mono mt-1 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                  Status: {report.secretHygiene.status}
                </p>
                <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">
                  {report.secretHygiene.summary}
                </p>
                <div className="mt-4 space-y-2 text-xs text-zinc-200">
                  {report.secretHygiene.signals.map((signal) => (
                    <p key={signal}>- {signal}</p>
                  ))}
                </div>
              </Panel>

              <Panel>
                <div className="flex items-center gap-2">
                  <PackageSearch className="h-4 w-4 text-[var(--accent-primary)]" />
                  <h3 className="text-lg font-semibold uppercase">Dependency Risk Review</h3>
                </div>
                <p className={`mt-3 text-4xl font-bold ${scoreTint(report.dependencyRisk.score)}`}>
                  {report.dependencyRisk.score}
                </p>
                <p className="mono mt-1 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                  {report.dependencyRisk.level} risk / {report.dependencyRisk.lockfileStatus}
                </p>
                <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">
                  {report.dependencyRisk.summary}
                </p>
                <div className="mt-4 grid gap-2 text-xs text-zinc-200 sm:grid-cols-3">
                  {statLabel("Direct", report.dependencyRisk.directDependencies)}
                  {statLabel("Transitive", report.dependencyRisk.transitiveDependencies)}
                  {statLabel("High Risk", report.dependencyRisk.highRiskCount)}
                </div>
                <div className="mt-4 space-y-2 text-xs text-zinc-200">
                  {report.dependencyRisk.topRisks.length > 0 ? (
                    report.dependencyRisk.topRisks.slice(0, 3).map((item) => (
                      <div key={`${item.ecosystem}-${item.name}`} className="rounded-md border border-[var(--border)] bg-black/20 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-[var(--foreground)]">{item.name}</span>
                          <span className="text-[var(--muted)]">{item.action}</span>
                          <span className="text-[var(--accent-secondary)]">{item.featureNeed}</span>
                        </div>
                        <p className="mt-2 text-[var(--muted)]">{item.signals[0]}</p>
                      </div>
                    ))
                  ) : (
                    report.dependencyRisk.findings.map((finding) => <p key={finding}>- {finding}</p>)
                  )}
                </div>
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

            <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
              <Panel>
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-[var(--accent-primary)]" />
                  <h3 className="text-lg font-semibold uppercase">Executive Brief</h3>
                </div>
                <div className="mt-4 space-y-3 text-sm text-[var(--muted)]">
                  <div className="rounded-md border border-[var(--border)] bg-black/20 p-3">
                    <p className="text-[0.7rem] uppercase text-[var(--muted)]">Decision</p>
                    <p className="mt-1 text-base font-semibold text-[var(--foreground)]">
                      {report.verdict.productionReadiness === "HIGH"
                        ? "Ready for deeper production review"
                        : report.verdict.productionReadiness === "MEDIUM"
                          ? "Usable with targeted remediation"
                          : "Needs stabilization before production"}
                    </p>
                  </div>
                  <div className="rounded-md border border-[var(--border)] bg-black/20 p-3">
                    <p className="text-[0.7rem] uppercase text-[var(--muted)]">Biggest Risk</p>
                    <p className="mt-1 text-sm text-[var(--foreground)]">
                      {report.remediationPlan[0]?.title ?? report.risk.summary}
                    </p>
                  </div>
                  <div className="rounded-md border border-[var(--border)] bg-black/20 p-3">
                    <p className="text-[0.7rem] uppercase text-[var(--muted)]">Next Best Action</p>
                    <p className="mt-1 text-sm text-[var(--foreground)]">
                      {report.remediationPlan[0]?.actions[0] ?? "Re-run the scan after the next meaningful repository change."}
                    </p>
                  </div>
                </div>
              </Panel>

              <Panel>
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-[var(--accent-secondary)]" />
                  <h3 className="text-lg font-semibold uppercase">Score Breakdown</h3>
                </div>
                <div className="mt-4 space-y-3">
                  {scoreBreakdown.map((item) => {
                    const healthy = item.positive ? item.value >= 70 : item.value <= 30;
                    return (
                      <div key={item.label} className="grid gap-2 text-xs sm:grid-cols-[9rem_1fr_3rem] sm:items-center">
                        <span className="text-[var(--muted)]">{item.label}</span>
                        <div className="h-2 rounded-full bg-black/40">
                          <div
                            className={`h-2 rounded-full ${healthy ? "bg-[var(--accent-primary)]" : "bg-[var(--accent-secondary)]"}`}
                            style={{ width: `${Math.max(0, Math.min(100, item.value))}%` }}
                          />
                        </div>
                        <span className="text-right text-[var(--foreground)]">{item.value}</span>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            </div>

            <Panel>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-[var(--accent-primary)]" />
                  <h3 className="text-lg font-semibold uppercase">Fix Missions</h3>
                </div>
                <div className="rounded-md border border-[var(--border)] bg-black/20 px-3 py-2 text-xs text-[var(--muted)]">
                  Complete missions, rescan, and track the score lift.
                </div>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {fixMissions.map((mission) => (
                  <div key={mission.id} className="rounded-lg border border-[var(--border)] bg-black/25 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md border border-[var(--accent-primary)]/50 px-2 py-1 text-[0.65rem] uppercase tracking-[0.14em] text-[var(--accent-primary)]">
                          Mission {mission.missionNumber}
                        </span>
                        <span className="rounded-md border border-[var(--border)] px-2 py-1 text-[0.65rem] uppercase tracking-[0.14em] text-[var(--muted)]">
                          {mission.category}
                        </span>
                      </div>
                      <span className="text-xs font-semibold text-[var(--accent-secondary)]">
                        +{mission.estimatedGain} projected
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-[var(--foreground)]">{mission.title}</p>
                    <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{mission.summary}</p>
                    <div className="mt-3 space-y-2 text-xs text-zinc-200">
                      {mission.actions.slice(0, 3).map((action) => (
                        <div key={action} className="flex gap-2">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-primary)]" />
                          <span>{action}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <div className="grid gap-6 lg:grid-cols-2">
              <Panel>
                <div className="flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-[var(--accent-secondary)]" />
                  <h3 className="text-lg font-semibold uppercase">Score Simulator</h3>
                </div>
                <p className="mt-3 text-xs text-[var(--muted)]">
                  Select missions to estimate the next scan after fixes land.
                </p>
                <div className="mt-4 rounded-lg border border-[var(--border)] bg-black/25 p-4">
                  <p className="mono text-[0.65rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                    Projected Score
                  </p>
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <span className="text-4xl font-bold text-[var(--foreground)]">
                      {report.verdict.overallHealth} → {simulation?.projectedScore ?? report.verdict.overallHealth}
                    </span>
                    <span className="pb-1 text-sm font-semibold text-[var(--accent-primary)]">
                      +{simulation?.projectedGain ?? 0} estimated
                    </span>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {fixMissions.map((mission) => (
                    <label
                      key={mission.id}
                      className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-black/20 p-3 text-xs transition hover:border-[var(--accent-secondary)]"
                    >
                      <span className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedSimulationMissions.includes(mission.id)}
                          onChange={() => toggleSimulationMission(mission.id)}
                          className="h-4 w-4 accent-[var(--accent-primary)]"
                        />
                        <span className="text-[var(--foreground)]">{mission.title}</span>
                      </span>
                      <span className="shrink-0 text-[var(--accent-secondary)]">+{mission.estimatedGain}</span>
                    </label>
                  ))}
                </div>
              </Panel>

              <Panel>
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-[var(--accent-primary)]" />
                  <h3 className="text-lg font-semibold uppercase">AI Roast / Praise Mode</h3>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {[
                    ["cto", "CTO"],
                    ["investor", "Investor"],
                    ["junior", "Junior"],
                    ["praise", "Praise"],
                    ["roast", "Roast"],
                  ].map(([value, label]) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={voiceMode === value ? "primary" : "outline"}
                      onClick={() => setVoiceMode(value as VoiceMode)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                <div className="mt-4 rounded-lg border border-[var(--border)] bg-black/25 p-4">
                  <p className="text-sm leading-relaxed text-zinc-100">{voiceSummary}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4 w-full justify-start gap-2"
                  onClick={() => copyToClipboard(voiceSummary, "Voice summary copied")}
                >
                  <Copy className="h-4 w-4" />
                  Copy This Take
                </Button>
              </Panel>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Panel>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-[var(--accent-secondary)]" />
                  <h3 className="text-lg font-semibold uppercase">Team Dashboard</h3>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {teamDashboardActions.map((item) => (
                    <div key={item.label} className="rounded-md border border-[var(--border)] bg-black/20 p-3">
                      <p className="text-[0.65rem] uppercase tracking-[0.16em] text-[var(--muted)]">{item.label}</p>
                      <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{item.value}</p>
                      <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{item.note}</p>
                    </div>
                  ))}
                </div>
                <a
                  href="/leaderboard"
                  className="mt-4 inline-flex w-full items-center justify-start gap-2 rounded-md border border-[var(--border)] px-4 py-3 text-xs uppercase tracking-[0.12em] text-[var(--muted)] transition hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]"
                >
                  <Trophy className="h-4 w-4" />
                  Open Repo Leaderboard
                </a>
              </Panel>

              <Panel>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-[var(--accent-primary)]" />
                  <h3 className="text-lg font-semibold uppercase">Weekly Digest</h3>
                </div>
                <p className="mt-3 text-xs text-[var(--muted)]">
                  Copy this into email, Slack, Linear, or founder updates.
                </p>
                <pre className="mt-4 whitespace-pre-wrap rounded-md border border-[var(--border)] bg-black/40 p-3 text-[0.7rem] text-[#bcffe8]">
                  {weeklyDigest}
                </pre>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4 w-full justify-start gap-2"
                  onClick={() => copyToClipboard(weeklyDigest, "Weekly digest copied")}
                >
                  <Copy className="h-4 w-4" />
                  Copy Weekly Digest
                </Button>
              </Panel>
            </div>

            <Panel>
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-[var(--accent-primary)]" />
                <h3 className="text-lg font-semibold uppercase">Remediation Plan</h3>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                  <Input
                    value={reportSearch}
                    onChange={(event) => setReportSearch(event.target.value)}
                    placeholder="Search actions, evidence, categories"
                    className="pl-10 text-xs"
                  />
                </div>
                <select
                  className="rounded-md border border-[var(--border)] bg-black/30 px-3 py-2 text-xs text-[var(--foreground)]"
                  value={remediationPriority}
                  onChange={(event) => setRemediationPriority(event.target.value as RemediationPriorityFilter)}
                >
                  <option value="All">All priorities</option>
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                </select>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {filteredRemediationPlan.map((item) => (
                  <div key={item.id} className="rounded-lg border border-[var(--border)] bg-black/25 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-md border px-2 py-1 text-[0.65rem] uppercase tracking-[0.14em] ${
                          item.priority === "Critical"
                            ? "border-[var(--danger)]/60 text-[var(--danger)]"
                            : item.priority === "High"
                              ? "border-[var(--accent-secondary)]/60 text-[var(--accent-secondary)]"
                              : "border-[var(--border)] text-[var(--muted)]"
                        }`}
                      >
                        {item.priority}
                      </span>
                      <span className="rounded-md border border-[var(--border)] px-2 py-1 text-[0.65rem] uppercase tracking-[0.14em] text-[var(--muted)]">
                        {item.effort} effort
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-[var(--foreground)]">{item.title}</p>
                    <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{item.summary}</p>
                    <p className="mt-3 text-xs text-zinc-200">Impact: {item.impact}</p>
                    <div className="mt-3 space-y-2 text-xs text-[var(--muted)]">
                      {item.actions.map((action) => (
                        <p key={action}>- {action}</p>
                      ))}
                    </div>
                    <div className="mt-3 border-t border-[var(--border)] pt-3 text-xs text-zinc-200">
                      {item.evidence.map((evidence) => (
                        <div key={`${item.id}-${evidence.label}`} className="mt-2 first:mt-0">
                          <span className="text-[var(--muted)]">{evidence.label}: </span>
                          <span>{evidence.value}</span>
                          {evidence.path ? (
                            <span className="ml-1 text-[var(--accent-secondary)]">{evidence.path}</span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {filteredRemediationPlan.length === 0 ? (
                  <div className="rounded-lg border border-[var(--border)] bg-black/20 p-4 text-sm text-[var(--muted)]">
                    No remediation items match the current filters.
                  </div>
                ) : null}
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

Scan Target:
${report.scanTarget.label}

Health Score:
${report.verdict.overallHealth}

AI Assistance:
${report.aiAssistance.score}%

Documentation:
${report.documentation.score}

Maintainability:
${report.maintainability.score}

Secret Hygiene:
${report.secretHygiene.status} / ${report.secretHygiene.score}

Dependency Risk:
${report.dependencyRisk.level} / ${report.dependencyRisk.score}

Top Remediation:
${report.remediationPlan[0]?.title ?? "No urgent remediation"}

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
                  <Button variant="outline" className="w-full justify-start gap-2" onClick={copyMarkdownReport}>
                    <Copy className="h-4 w-4" />
                    Copy Markdown Summary
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2" onClick={copyPublicLink}>
                    <Copy className="h-4 w-4" />
                    Copy Scan Setup Link
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => copyToClipboard(publicProfileUrl, "Public profile link copied")}
                  >
                    <Link2 className="h-4 w-4" />
                    Copy Public Profile
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
                  <a
                    href={publicProfileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full items-center justify-start gap-2 rounded-md border border-[var(--border)] px-4 py-3 text-xs uppercase tracking-[0.12em] text-[var(--muted)] transition hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Public Profile
                  </a>
                  {clipboardMessage ? (
                    <div className="inline-flex w-full items-center gap-2 rounded-md border border-[var(--accent-primary)]/50 bg-[var(--accent-primary)]/10 px-3 py-2 text-xs text-[var(--accent-primary)]">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {clipboardMessage}
                    </div>
                  ) : null}
                </div>
              </div>
            </Panel>

            <Panel>
              <h3 className="text-lg font-semibold uppercase">Explainable Findings</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={findingCategory === "All" ? "primary" : "outline"}
                  onClick={() => setFindingCategory("All")}
                >
                  All
                </Button>
                {findingCategories.map((category) => (
                  <Button
                    key={category}
                    type="button"
                    size="sm"
                    variant={findingCategory === category ? "primary" : "outline"}
                    onClick={() => setFindingCategory(category)}
                  >
                    {category}
                  </Button>
                ))}
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {filteredFindings.map((finding) => (
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
                {filteredFindings.length === 0 ? (
                  <div className="rounded-lg border border-[var(--border)] bg-black/20 p-4 text-sm text-[var(--muted)]">
                    No findings match the current filters.
                  </div>
                ) : null}
              </div>
            </Panel>

            <div className="grid gap-6 lg:grid-cols-2">
              <Panel>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-[var(--accent-primary)]" />
                  <h3 className="text-lg font-semibold uppercase">Before / After Progress</h3>
                </div>
                {persistenceNote ? (
                  <div className="mt-3 rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-xs text-[var(--danger)]">
                    {persistenceNote}
                  </div>
                ) : null}
                {progressSummary && previousScan ? (
                  <div className="mt-4 rounded-lg border border-[var(--border)] bg-black/25 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="mono text-[0.65rem] uppercase tracking-[0.16em] text-[var(--muted)]">
                          Delta since {new Date(previousScan.generatedAt).toLocaleDateString()}
                        </p>
                        <p className="mt-2 text-2xl font-bold text-[var(--foreground)]">
                          {previousScan.overallHealth} → {report.verdict.overallHealth}
                        </p>
                      </div>
                      <div
                        className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                          progressSummary.healthDelta >= 0
                            ? "border-[var(--accent-primary)]/50 text-[var(--accent-primary)]"
                            : "border-[var(--danger)]/50 text-[var(--danger)]"
                        }`}
                      >
                        {progressSummary.healthDelta > 0 ? "+" : ""}
                        {progressSummary.healthDelta} health
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {statLabel("Improved Signals", progressSummary.improvedMetrics.length)}
                      {statLabel("Needs Attention", progressSummary.regressedMetrics.length)}
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {trendDeltas.map((delta) => {
                        const lowerIsBetter = negativeComparisonMetrics.has(delta.metric);
                        const improved = delta.delta === 0 ? null : lowerIsBetter ? delta.delta < 0 : delta.delta > 0;
                        return (
                          <div
                            key={delta.metric}
                            className="rounded-md border border-[var(--border)] bg-black/20 p-3 text-xs"
                          >
                            <p className="text-[var(--muted)]">{delta.metric}</p>
                            <div className="mt-1 flex items-center justify-between gap-2">
                              <span className="text-[var(--foreground)]">
                                {delta.previous} → {delta.current}
                              </span>
                              <span
                                className={
                                  improved === null
                                    ? "text-[var(--muted)]"
                                    : improved
                                      ? "text-[var(--accent-primary)]"
                                      : "text-[var(--danger)]"
                                }
                              >
                                {delta.delta > 0 ? "+" : ""}
                                {delta.delta}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-[var(--muted)]">
                    No previous baseline yet. Run another scan after fixing missions to see before/after movement.
                  </p>
                )}
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
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-[var(--accent-secondary)]" />
                  <h3 className="text-lg font-semibold uppercase">CI / GitHub App Integration</h3>
                </div>
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
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start gap-2"
                    onClick={() => copyToClipboard(ciWorkflow, "CI workflow copied")}
                  >
                    <Copy className="h-4 w-4" />
                    Copy Workflow YAML
                  </Button>
                  <pre className="whitespace-pre-wrap rounded-md border border-[var(--border)] bg-black/40 p-3 text-[0.65rem] text-[#bcffe8]">
                    {ciWorkflow}
                  </pre>
                  <div className="rounded-md border border-[var(--border)] bg-black/20 p-3">
                    <div className="flex items-center gap-2">
                      <GitPullRequest className="h-4 w-4 text-[var(--accent-secondary)]" />
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--foreground)]">
                        PR Bot Commenter
                      </p>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
                      Comment a VibeScore summary on every pull request so reviewers see health and risk movement.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3 w-full justify-start gap-2"
                      onClick={() => copyToClipboard(prBotWorkflow, "PR bot workflow copied")}
                    >
                      <Copy className="h-4 w-4" />
                      Copy PR Bot Workflow
                    </Button>
                  </div>
                </div>
              </Panel>

              <Panel>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[var(--accent-primary)]" />
                  <h3 className="text-lg font-semibold uppercase">Public Badge</h3>
                </div>
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
{`![VibeScore](${typeof window !== "undefined" ? window.location.origin : ""}/api/badge?repo=${encodeURIComponent(report.repository.fullName)})`}
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
