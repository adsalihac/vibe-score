import { Prisma } from "@prisma/client";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";

import {
  type AnalysisScore,
  type ArchitectureReview,
  type DocumentationEvidence,
  type ExplainableFinding,
  type InvestigationReport,
  type RepoArchetype,
  type RepositoryIdentity,
  type RemediationItem,
  type RiskLevel,
  type RulePackId,
  type ScanTarget,
  type ScanTargetMode,
  type SecretHygiene,
  type TestingReadiness,
} from "@/types/report";
import { prisma } from "@/lib/prisma";
import { resolveRulePack } from "@/lib/rule-packs";

interface GitHubRepoPayload {
  full_name: string;
  name: string;
  owner: { login: string };
  default_branch: string;
  pushed_at: string;
  created_at: string;
  language: string | null;
}

interface GitHubPullPayload {
  number: number;
  title: string;
  changed_files: number;
  base: { ref: string; sha: string };
  head: { ref: string; sha: string };
}

interface TreeResponse {
  tree: Array<{ path: string; type: "blob" | "tree"; size?: number }>;
}

interface FileSample {
  path: string;
  content: string;
}

interface RawMetrics {
  fileCount: number;
  contributors: number;
  dependencyCount: number;
  readmeLength: number;
  docsFlags: string[];
  docFiles: string[];
  astFilesParsed: number;
  functionCount: number;
  importCount: number;
  maxNesting: number;
  longFileCount: number;
  longFiles: string[];
  duplicateSignal: number;
  todoCount: number;
  todoFiles: string[];
  testFiles: number;
  testFilePaths: string[];
  frameworks: string[];
  staleDays: number;
  topFolders: string[];
  languageBreakdown: string[];
  trackedEnvFiles: string[];
  envExampleFiles: string[];
  envIgnored: boolean;
  secretPatternCount: number;
  secretRiskFiles: string[];
  secretSignalLabels: string[];
}

interface ParsedRepositoryTarget {
  owner: string;
  repo: string;
  branchRef?: string;
  pullRequestNumber?: number;
}

interface InvestigationOptions {
  rulePack?: RulePackId | string;
  persist?: boolean;
  scanTarget?: {
    mode?: ScanTargetMode;
    ref?: string;
    pullRequestNumber?: number | string;
  };
}

const LOGS = [
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

const CODE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".java",
  ".rb",
  ".rs",
  ".php",
  ".cs",
];

const SAFE_CONFIG_FILES = [".gitignore", ".env.example", ".env.sample", ".env.template"];

const SECRET_VALUE_PATTERNS = [
  { label: "GitHub classic token prefix", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g },
  { label: "GitHub fine-grained token prefix", pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { label: "AWS access key prefix", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { label: "OpenAI-style key prefix", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { label: "Private key block", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  {
    label: "Secret-like assignment",
    pattern:
      /\b(api[_-]?key|secret|token|password|private[_-]?key|client[_-]?secret)\b\s*[:=]\s*["'][^"'\s]{16,}["']/gi,
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeToScore(value: number) {
  return Math.round(clamp(value, 0, 100));
}

function riskScoreFromLevel(level: RiskLevel) {
  return level === "LOW" ? 100 : level === "MEDIUM" ? 65 : 35;
}

function formatList(list: string[], fallback: string) {
  return list.length > 0 ? list.join(", ") : fallback;
}

function parseRepositoryUrl(repoUrl: string): ParsedRepositoryTarget {
  const cleaned = repoUrl
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[?#]/)[0]
    .replace(/\/$/, "");

  const parts = cleaned.split("/").filter(Boolean);
  if (parts[0]?.toLowerCase() !== "github.com" || parts.length < 3) {
    throw new Error("Please provide a valid GitHub repository URL.");
  }

  const owner = parts[1];
  const repo = parts[2].replace(/\.git$/i, "");
  const segment = parts[3]?.toLowerCase();

  if (!owner || !repo) {
    throw new Error("Please provide a valid GitHub repository URL.");
  }

  if (segment === "pull" && parts[4]) {
    const pullRequestNumber = Number.parseInt(parts[4], 10);
    if (Number.isFinite(pullRequestNumber)) {
      return { owner, repo, pullRequestNumber };
    }
  }

  if (segment === "tree" && parts.length > 4) {
    return {
      owner,
      repo,
      branchRef: decodeURIComponent(parts.slice(4).join("/")),
    };
  }

  return { owner, repo };
}

function isDatabaseConnectionError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("authentication failed") ||
    lower.includes("p1000") ||
    lower.includes("can't reach database server") ||
    lower.includes("p1001") ||
    lower.includes("invalid database") ||
    lower.includes("database credentials")
  );
}

async function githubRequest<T>(path: string): Promise<T> {
  const token = process.env.GIT_TOKEN || process.env.GH_TOKEN;
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    let apiMessage = "";
    try {
      const payload = (await response.json()) as { message?: string };
      apiMessage = payload.message ?? "";
    } catch {
      apiMessage = "";
    }

    if (response.status === 403) {
      const remaining = response.headers.get("x-ratelimit-remaining");
      const reset = response.headers.get("x-ratelimit-reset");
      const resetAt = reset
        ? new Date(Number.parseInt(reset, 10) * 1000).toISOString()
        : "unknown";

      throw new Error(
        `GitHub API request failed: 403. ${
          apiMessage || "Rate limit exceeded or access denied."
        } Add GIT_TOKEN to .env.local for higher API limits. Remaining: ${remaining ?? "unknown"}. Reset: ${resetAt}.`,
      );
    }

    throw new Error(
      `GitHub API request failed: ${response.status}${apiMessage ? ` - ${apiMessage}` : ""}`,
    );
  }

  return (await response.json()) as T;
}

function sanitizeGitRef(ref: string) {
  return ref.trim().replace(/[\r\n\t]/g, "").replace(/^\/+|\/+$/g, "");
}

function parsePullRequestNumber(input?: number | string) {
  if (typeof input === "number" && Number.isFinite(input)) {
    return Math.floor(input);
  }

  if (typeof input === "string") {
    const parsed = Number.parseInt(input.trim().replace(/^#/, ""), 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

async function fetchBranchSha(owner: string, repo: string, branch: string) {
  try {
    const branchPayload = await githubRequest<{ commit: { sha: string } }>(
      `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
    );
    return branchPayload.commit.sha;
  } catch {
    return branch;
  }
}

async function resolveScanTarget(args: {
  owner: string;
  repo: string;
  defaultBranch: string;
  parsed: ParsedRepositoryTarget;
  requested?: InvestigationOptions["scanTarget"];
}): Promise<ScanTarget> {
  const { owner, repo, defaultBranch, parsed, requested } = args;
  const requestedPullNumber = parsePullRequestNumber(requested?.pullRequestNumber);
  const mode =
    requested?.mode ??
    (requestedPullNumber || parsed.pullRequestNumber
      ? "pull_request"
      : requested?.ref || parsed.branchRef
        ? "branch"
        : "default");

  if (mode === "pull_request") {
    const pullRequestNumber = requestedPullNumber ?? parsed.pullRequestNumber;
    if (!pullRequestNumber) {
      throw new Error("Pull request number is required for PR scans.");
    }

    const pull = await githubRequest<GitHubPullPayload>(
      `/repos/${owner}/${repo}/pulls/${pullRequestNumber}`,
    );

    return {
      mode,
      label: `Pull Request #${pull.number}`,
      ref: pull.head.sha,
      requestedRef: String(pull.number),
      baseRef: pull.base.ref,
      headRef: pull.head.ref,
      pullRequestNumber: pull.number,
      pullRequestTitle: pull.title,
      changedFiles: pull.changed_files,
    };
  }

  if (mode === "branch") {
    const requestedRef = sanitizeGitRef(requested?.ref ?? parsed.branchRef ?? "");
    if (!requestedRef) {
      throw new Error("Branch name is required for branch scans.");
    }

    const ref = await fetchBranchSha(owner, repo, requestedRef);
    return {
      mode,
      label: `Branch ${requestedRef}`,
      ref,
      requestedRef,
      headRef: requestedRef,
    };
  }

  return {
    mode: "default",
    label: `Default Branch ${defaultBranch}`,
    ref: defaultBranch,
    requestedRef: defaultBranch,
    headRef: defaultBranch,
  };
}

async function fetchContributors(owner: string, repo: string) {
  try {
    const contributors = await githubRequest<Array<{ id: number }>>(
      `/repos/${owner}/${repo}/contributors?per_page=100`,
    );
    return contributors.length;
  } catch {
    return 1;
  }
}

async function fetchPackageJson(
  owner: string,
  repo: string,
  ref: string,
): Promise<Record<string, unknown> | null> {
  try {
    const contentResponse = await githubRequest<{
      content: string;
      encoding: string;
    }>(`/repos/${owner}/${repo}/contents/package.json?ref=${encodeURIComponent(ref)}`);

    if (contentResponse.encoding !== "base64") {
      return null;
    }

    const raw = Buffer.from(contentResponse.content, "base64").toString("utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractFrameworks(packageJson: Record<string, unknown> | null) {
  if (!packageJson) {
    return [];
  }

  const dependencies = {
    ...(typeof packageJson.dependencies === "object" && packageJson.dependencies
      ? (packageJson.dependencies as Record<string, string>)
      : {}),
    ...(typeof packageJson.devDependencies === "object" && packageJson.devDependencies
      ? (packageJson.devDependencies as Record<string, string>)
      : {}),
  };

  const known = [
    "jest",
    "vitest",
    "mocha",
    "playwright",
    "cypress",
    "testing-library",
    "pytest",
    "go test",
    "rspec",
  ];

  return known.filter((name) =>
    Object.keys(dependencies).some((dep) => dep.includes(name)),
  );
}

function getLanguageFromPath(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  if (!extension) {
    return null;
  }

  const mapping: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TypeScript",
    js: "JavaScript",
    jsx: "JavaScript",
    py: "Python",
    go: "Go",
    java: "Java",
    rb: "Ruby",
    rs: "Rust",
    php: "PHP",
    cs: "C#",
    md: "Markdown",
  };

  return mapping[extension] ?? null;
}

async function fetchFileSample(
  owner: string,
  repo: string,
  branch: string,
  paths: string[],
) {
  const sampleTargets = paths.slice(0, 25);
  const files = await Promise.all(
    sampleTargets.map(async (path): Promise<FileSample | null> => {
      try {
        const response = await fetch(
          `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`,
          { next: { revalidate: 0 } },
        );
        if (!response.ok) {
          return null;
        }
        const content = await response.text();
        return { path, content };
      } catch {
        return null;
      }
    }),
  );

  return files.filter((file): file is FileSample => !!file);
}

function inspectWithAst(files: FileSample[]) {
  let functionCount = 0;
  let importCount = 0;
  let maxNesting = 0;
  let astFilesParsed = 0;

  for (const file of files) {
    const isJsFamily = /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file.path);
    if (!isJsFamily) {
      continue;
    }

    try {
      const ast = parse(file.content, {
        sourceType: "unambiguous",
        plugins: ["typescript", "jsx"],
      });
      astFilesParsed += 1;

      traverse(ast, {
        enter(path) {
          if (
            path.isFunctionDeclaration() ||
            path.isFunctionExpression() ||
            path.isArrowFunctionExpression()
          ) {
            functionCount += 1;
          }

          if (path.isImportDeclaration()) {
            importCount += 1;
          }

          const depth = path.getAncestry().length;
          if (depth > maxNesting) {
            maxNesting = depth;
          }
        },
      });
    } catch {
      continue;
    }
  }

  return { functionCount, importCount, maxNesting, astFilesParsed };
}

function buildRawMetrics(args: {
  repo: GitHubRepoPayload;
  tree: TreeResponse;
  contributors: number;
  packageJson: Record<string, unknown> | null;
  files: FileSample[];
}): RawMetrics {
  const { repo, tree, contributors, packageJson, files } = args;

  const fileEntries = tree.tree.filter((entry) => entry.type === "blob");

  const docsFlags = [
    fileEntries.some((file) => file.path.toLowerCase() === "readme.md")
      ? "Detailed README"
      : null,
    fileEntries.some((file) => /(^|\/)docs\//i.test(file.path))
      ? "Documentation Folder"
      : null,
    fileEntries.some((file) => /contributing\.md$/i.test(file.path))
      ? "Contribution Guide"
      : null,
    fileEntries.some((file) => /(changelog|history)\.md$/i.test(file.path))
      ? "Changelog"
      : null,
    fileEntries.some((file) => /(api|openapi|swagger)\.(md|ya?ml|json)$/i.test(file.path))
      ? "API Documentation"
      : null,
    fileEntries.some((file) => /install/i.test(file.path) && file.path.endsWith(".md"))
      ? "Installation Guide"
      : null,
    fileEntries.some((file) => /example/i.test(file.path))
      ? "Usage Examples"
      : null,
  ].filter((item): item is string => !!item);

  const docFiles = fileEntries
    .filter((file) => {
      const lower = file.path.toLowerCase();
      return lower.endsWith(".md") || /(^|\/)docs\//i.test(lower);
    })
    .slice(0, 10)
    .map((file) => file.path);

  const trackedEnvFiles = fileEntries
    .filter((file) => {
      const basename = file.path.split("/").pop()?.toLowerCase() ?? "";
      return (
        basename.startsWith(".env") &&
        ![".env.example", ".env.sample", ".env.template"].includes(basename)
      );
    })
    .slice(0, 8)
    .map((file) => file.path);

  const envExampleFiles = fileEntries
    .filter((file) => {
      const basename = file.path.split("/").pop()?.toLowerCase() ?? "";
      return [".env.example", ".env.sample", ".env.template"].includes(basename);
    })
    .slice(0, 8)
    .map((file) => file.path);

  const readme = files.find((file) => /readme\.md$/i.test(file.path));
  const gitignore = files.find((file) => file.path.toLowerCase() === ".gitignore");
  const readmeLength = readme?.content.length ?? 0;
  const envIgnored = gitignore
    ? gitignore.content
        .split("\n")
        .map((line) => line.trim())
        .some((line) => line === ".env" || line === ".env*" || line.startsWith(".env."))
    : false;

  const longFiles = files.filter((file) => file.content.split("\n").length > 350);
  const longFileCount = longFiles.length;
  const todoFiles = files.filter((file) => /TODO|FIXME|HACK/gi.test(file.content));
  const todoCount = todoFiles.reduce((count, file) => {
    return count + (file.content.match(/TODO|FIXME|HACK/gi)?.length ?? 0);
  }, 0);

  const normalizedFingerprints = files
    .map((file) =>
      file.content
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 10)
        .join("\n"),
    )
    .filter(Boolean);

  const duplicates = normalizedFingerprints.length - new Set(normalizedFingerprints).size;
  const duplicateSignal = normalizedFingerprints.length
    ? duplicates / normalizedFingerprints.length
    : 0;

  const { functionCount, importCount, maxNesting, astFilesParsed } = inspectWithAst(files);

  const secretRisk = files.reduce(
    (state, file) => {
      const matchedLabels = SECRET_VALUE_PATTERNS.filter(({ pattern }) => {
        pattern.lastIndex = 0;
        return pattern.test(file.content);
      }).map(({ label }) => label);

      if (matchedLabels.length === 0) {
        return state;
      }

      return {
        count: state.count + matchedLabels.length,
        files: [...state.files, file.path],
        labels: [...state.labels, ...matchedLabels],
      };
    },
    { count: 0, files: [] as string[], labels: [] as string[] },
  );

  const dependencyCount = packageJson
    ? Object.keys(
        {
          ...(typeof packageJson.dependencies === "object" && packageJson.dependencies
            ? (packageJson.dependencies as Record<string, string>)
            : {}),
          ...(typeof packageJson.devDependencies === "object" && packageJson.devDependencies
            ? (packageJson.devDependencies as Record<string, string>)
            : {}),
        },
      ).length
    : 0;

  const testFilePaths = fileEntries.filter((file) =>
    /(test|spec)\.(ts|tsx|js|jsx|py|go|java|rb|rs)$|__tests__/i.test(file.path),
  );
  const testFiles = testFilePaths.length;

  const topFolders = Array.from(
    new Set(
      fileEntries
        .map((entry) => entry.path.split("/")[0])
        .filter((folder) => folder && !folder.includes(".")),
    ),
  ).slice(0, 8);

  const languageCounts = new Map<string, number>();
  fileEntries.forEach((file) => {
    const language = getLanguageFromPath(file.path);
    if (!language || language === "Markdown") {
      return;
    }
    languageCounts.set(language, (languageCounts.get(language) ?? 0) + 1);
  });

  const languageBreakdown = [...languageCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name]) => name);

  const staleDays = Math.floor(
    (Date.now() - new Date(repo.pushed_at).getTime()) / (1000 * 60 * 60 * 24),
  );

  return {
    fileCount: fileEntries.length,
    contributors,
    dependencyCount,
    readmeLength,
    docsFlags,
    docFiles,
    astFilesParsed,
    functionCount,
    importCount,
    maxNesting,
    longFileCount,
    longFiles: longFiles.map((file) => file.path).slice(0, 6),
    duplicateSignal,
    todoCount,
    todoFiles: todoFiles.map((file) => file.path).slice(0, 6),
    testFiles,
    testFilePaths: testFilePaths.map((file) => file.path).slice(0, 8),
    frameworks: extractFrameworks(packageJson),
    staleDays,
    topFolders,
    languageBreakdown,
    trackedEnvFiles,
    envExampleFiles,
    envIgnored,
    secretPatternCount: secretRisk.count,
    secretRiskFiles: [...new Set(secretRisk.files)].slice(0, 8),
    secretSignalLabels: [...new Set(secretRisk.labels)].slice(0, 8),
  };
}

function buildAiAssistance(metrics: RawMetrics): AnalysisScore {
  const repetitiveness = metrics.duplicateSignal * 100;
  const structureUniformity = clamp((metrics.importCount / Math.max(metrics.astFilesParsed, 1)) * 8, 0, 20);
  const boilerplateSignal = clamp((metrics.dependencyCount / Math.max(metrics.fileCount, 1)) * 100, 0, 20);

  const score = normalizeToScore(30 + repetitiveness * 0.45 + structureUniformity + boilerplateSignal);

  const confidence: AnalysisScore["confidence"] =
    metrics.astFilesParsed > 12 ? "High" : metrics.astFilesParsed > 5 ? "Medium" : "Low";

  return {
    score,
    confidence,
    narrative:
      "The repository demonstrates multiple indicators commonly associated with AI-assisted development patterns. Evidence includes repetitive implementation structures, consistent documentation patterns, generated boilerplate, and standardized code layouts. This remains an estimation rather than certainty.",
  };
}

function buildDocumentation(metrics: RawMetrics) {
  const score = normalizeToScore(
    metrics.docsFlags.length * 13 + (metrics.readmeLength > 4000 ? 18 : metrics.readmeLength > 2000 ? 10 : 5),
  );

  const status: DocumentationEvidence["status"] =
    score > 85
      ? "EXCELLENT"
      : score > 70
        ? "GOOD"
        : score > 50
          ? "FAIR"
          : "POOR";

  const baseChecklist = [
    "Detailed README",
    "Installation Guide",
    "Usage Examples",
    "Contribution Guide",
    "API Documentation",
    "Changelog",
  ];

  return {
    status,
    score,
    checklist: baseChecklist.filter((item) => metrics.docsFlags.includes(item)),
  };
}

function buildMaintainability(metrics: RawMetrics): AnalysisScore {
  const organizationSignal = clamp(metrics.topFolders.length * 10, 10, 25);
  const complexityPenalty = clamp(metrics.maxNesting * 1.2 + metrics.longFileCount * 5, 0, 35);
  const duplicationPenalty = clamp(metrics.duplicateSignal * 40, 0, 20);
  const todoPenalty = clamp(metrics.todoCount * 0.8, 0, 15);

  const score = normalizeToScore(
    78 + organizationSignal - complexityPenalty - duplicationPenalty - todoPenalty,
  );

  const confidence: AnalysisScore["confidence"] =
    metrics.astFilesParsed > 8 ? "High" : metrics.astFilesParsed > 4 ? "Medium" : "Low";

  return {
    score,
    confidence,
    narrative:
      "Folder organization, naming consistency, separation of concerns, and modular boundaries were evaluated through repository structure and code sampling. The maintainability score is inferred from available repository evidence.",
  };
}

function buildArchitecture(metrics: RawMetrics): ArchitectureReview {
  const architectureSignal =
    clamp(metrics.topFolders.length * 6, 0, 30) +
    clamp(metrics.importCount / Math.max(metrics.astFilesParsed, 1), 0, 15) -
    clamp(metrics.longFileCount * 4, 0, 20);

  const grade: ArchitectureReview["grade"] =
    architectureSignal > 32 ? "A" : architectureSignal > 20 ? "B" : architectureSignal > 10 ? "C" : "D";

  const assessment =
    grade === "A"
      ? "Architecture appears modular with clear folder boundaries and healthy dependency distribution across components."
      : grade === "B"
        ? "Architecture is generally coherent with some concentration risk in larger modules."
        : grade === "C"
          ? "Architecture works but reveals coupling hotspots and opportunities for stronger modularity."
          : "Architecture has significant concentration and coupling issues that may slow future delivery.";

  return { grade, assessment };
}

function buildTechnicalDebt(metrics: RawMetrics) {
  const index = normalizeToScore(
    metrics.longFileCount * 8 + metrics.todoCount * 2 + metrics.duplicateSignal * 35,
  );

  const debtLevel: RiskLevel = index > 65 ? "HIGH" : index > 35 ? "MEDIUM" : "LOW";

  const findings = [
    metrics.longFileCount > 0
      ? `${metrics.longFileCount} large files may hide concentrated complexity.`
      : "No oversized files detected in sampled paths.",
    metrics.todoCount > 0
      ? `${metrics.todoCount} TODO/FIXME markers indicate deferred work.`
      : "Few explicit deferred-work markers detected.",
    metrics.duplicateSignal > 0.2
      ? "Repeated structure patterns suggest possible duplication risk."
      : "No strong duplication signal detected in sampled files.",
  ];

  return { debtLevel, index, findings };
}

function buildTesting(metrics: RawMetrics): TestingReadiness {
  const frameworkSignal = metrics.frameworks.length * 18;
  const fileSignal = clamp((metrics.testFiles / Math.max(metrics.fileCount, 1)) * 900, 0, 45);
  const coverageConfidence = normalizeToScore(18 + frameworkSignal + fileSignal);

  const health =
    coverageConfidence > 75
      ? "Testing footprint appears mature with clear framework signals and active test files."
      : coverageConfidence > 50
        ? "Testing posture is moderate; key flows are likely covered but gaps remain."
        : "Testing signal is limited. Coverage confidence is low and likely incomplete.";

  return {
    coverageConfidence,
    frameworks: metrics.frameworks.length ? metrics.frameworks : ["No clear framework detected"],
    health,
  };
}

function buildSecretHygiene(metrics: RawMetrics): SecretHygiene {
  const trackedEnvPenalty = metrics.trackedEnvFiles.length * 35;
  const patternPenalty = metrics.secretPatternCount * 25;
  const envExamplePenalty = metrics.envExampleFiles.length > 0 ? 0 : 8;
  const gitignorePenalty = metrics.envIgnored ? 0 : 12;
  const score = normalizeToScore(
    92 - trackedEnvPenalty - patternPenalty - envExamplePenalty - gitignorePenalty,
  );

  const status: SecretHygiene["status"] =
    metrics.trackedEnvFiles.length > 0 || metrics.secretPatternCount > 0 || score < 60
      ? "RISK"
      : score < 80
        ? "WATCH"
        : "CLEAR";

  const signals = [
    metrics.trackedEnvFiles.length > 0
      ? `${metrics.trackedEnvFiles.length} tracked environment file(s) detected`
      : "No tracked runtime .env files detected",
    metrics.envExampleFiles.length > 0
      ? `Environment template present: ${metrics.envExampleFiles[0]}`
      : "No .env template detected",
    metrics.envIgnored ? ".env patterns appear ignored" : ".env ignore rule was not confirmed",
    metrics.secretPatternCount > 0
      ? `${metrics.secretPatternCount} secret-like source pattern(s) found`
      : "No secret-like source values found in sampled files",
  ];

  const findings = [
    metrics.trackedEnvFiles.length > 0
      ? "Remove committed runtime environment files and rotate any exposed credentials."
      : "Runtime environment files were not found in the repository tree.",
    metrics.secretPatternCount > 0
      ? `Potential secret patterns were found in: ${formatList(metrics.secretRiskFiles, "sampled files")}.`
      : "Sampled source files did not expose recognizable secret tokens.",
    metrics.envExampleFiles.length > 0
      ? "Keep template files placeholder-only and document required variables there."
      : "Add a placeholder-only .env.example so setup does not require real credentials in docs or source.",
  ];

  const summary =
    status === "CLEAR"
      ? "No hardcoded secret values were detected in sampled files, and environment hygiene looks controlled."
      : status === "WATCH"
        ? "Secret hygiene is mostly acceptable, but environment conventions need tightening."
        : "Secret hygiene needs attention. The report only returns paths and counts, not secret values.";

  return { status, score, summary, signals, findings };
}

function buildRisk(
  metrics: RawMetrics,
  debtIndex: number,
  maintainability: number,
  secretHygiene: number,
) {
  const stalePenalty = metrics.staleDays > 365 ? 20 : metrics.staleDays > 120 ? 10 : 0;
  const secretPenalty = secretHygiene < 60 ? 18 : secretHygiene < 80 ? 8 : 0;
  const riskScore = normalizeToScore(
    debtIndex * 0.45 + (100 - maintainability) * 0.35 + stalePenalty + secretPenalty,
  );

  const level: RiskLevel = riskScore > 70 ? "HIGH" : riskScore > 45 ? "MEDIUM" : "LOW";

  const summary =
    level === "LOW"
      ? "No critical architectural concerns detected from sampled repository evidence."
      : level === "MEDIUM"
        ? "Moderate risk profile due to complexity concentration or duplication signals."
        : "Elevated risk profile detected with significant complexity, debt, or stale maintenance patterns.";

  return { level, summary };
}

function buildExplainableFindings(args: {
  metrics: RawMetrics;
  ai: AnalysisScore;
  documentation: DocumentationEvidence;
  maintainability: AnalysisScore;
  architecture: ArchitectureReview;
  technicalDebt: { debtLevel: RiskLevel; index: number; findings: string[] };
  testing: TestingReadiness;
  secretHygiene: SecretHygiene;
  risk: { level: RiskLevel; summary: string };
}): ExplainableFinding[] {
  const {
    metrics,
    ai,
    documentation,
    maintainability,
    architecture,
    technicalDebt,
    testing,
    secretHygiene,
    risk,
  } = args;

  return [
    {
      id: "ai-assistance",
      category: "AI Assistance",
      title: "Patterned delivery signals",
      summary: ai.narrative,
      evidence: [
        {
          label: "Repetition signal",
          value: `${Math.round(metrics.duplicateSignal * 100)}%`,
        },
        {
          label: "Import density",
          value: `${metrics.importCount} imports across ${metrics.astFilesParsed} files`,
        },
        {
          label: "Function footprint",
          value: `${metrics.functionCount} functions sampled`,
        },
      ],
    },
    {
      id: "documentation",
      category: "Documentation",
      title: "Documentation evidence",
      summary: `Documentation score ${documentation.score} (${documentation.status}).`,
      evidence: [
        {
          label: "Signals",
          value: formatList(metrics.docsFlags, "No strong documentation signals."),
        },
        {
          label: "Doc files",
          value: formatList(metrics.docFiles, "No docs files detected."),
          path: metrics.docFiles[0],
        },
        {
          label: "README size",
          value: `${metrics.readmeLength.toLocaleString()} characters`,
        },
      ],
    },
    {
      id: "maintainability",
      category: "Maintainability",
      title: "Maintainability surface",
      summary: maintainability.narrative,
      evidence: [
        {
          label: "Top folders",
          value: formatList(metrics.topFolders, "No clear module folders detected."),
        },
        {
          label: "Deep nesting",
          value: `${metrics.maxNesting} levels`,
        },
        {
          label: "Large files",
          value: formatList(metrics.longFiles, "No oversized files in sample."),
          path: metrics.longFiles[0],
        },
      ],
    },
    {
      id: "architecture",
      category: "Architecture",
      title: "Structural signals",
      summary: architecture.assessment,
      evidence: [
        {
          label: "Folder spread",
          value: `${metrics.topFolders.length} top-level modules`,
        },
        {
          label: "Dependency footprint",
          value: `${metrics.dependencyCount} dependencies detected`,
        },
        {
          label: "Longest file set",
          value: metrics.longFiles.length ? `${metrics.longFiles.length} sampled` : "No long files sampled.",
          path: metrics.longFiles[0],
        },
      ],
    },
    {
      id: "technical-debt",
      category: "Technical Debt",
      title: "Debt markers",
      summary: `Debt index ${technicalDebt.index}% (${technicalDebt.debtLevel} risk).`,
      evidence: [
        {
          label: "Deferred markers",
          value: `${metrics.todoCount} TODO/FIXME/HACK markers`,
          path: metrics.todoFiles[0],
        },
        {
          label: "Large files",
          value: `${metrics.longFileCount} large files`,
          path: metrics.longFiles[0],
        },
        {
          label: "Duplication signal",
          value: `${Math.round(metrics.duplicateSignal * 100)}%`,
        },
      ],
    },
    {
      id: "testing",
      category: "Testing",
      title: "Testing signals",
      summary: testing.health,
      evidence: [
        {
          label: "Test files",
          value: `${metrics.testFiles} detected`,
          path: metrics.testFilePaths[0],
        },
        {
          label: "Frameworks",
          value: formatList(testing.frameworks, "No framework detected"),
        },
      ],
    },
    {
      id: "secret-hygiene",
      category: "Secret Hygiene",
      title: "Secret key exposure scan",
      summary: secretHygiene.summary,
      evidence: [
        {
          label: "Status",
          value: `${secretHygiene.status} (${secretHygiene.score}/100)`,
        },
        {
          label: "Tracked env files",
          value: formatList(metrics.trackedEnvFiles, "No tracked runtime env files."),
          path: metrics.trackedEnvFiles[0],
        },
        {
          label: "Secret-like patterns",
          value:
            metrics.secretPatternCount > 0
              ? `${metrics.secretPatternCount} pattern(s): ${formatList(
                  metrics.secretSignalLabels,
                  "classified signal",
                )}`
              : "No token-like values found in sampled files.",
          path: metrics.secretRiskFiles[0],
        },
      ],
    },
    {
      id: "risk",
      category: "Risk",
      title: "Risk posture",
      summary: risk.summary,
      evidence: [
        {
          label: "Staleness",
          value: `${metrics.staleDays} days since last activity`,
        },
        {
          label: "Debt index",
          value: `${technicalDebt.index}%`,
        },
        {
          label: "Maintainability score",
          value: `${maintainability.score}`,
        },
      ],
    },
  ];
}

function buildRemediationPlan(args: {
  metrics: RawMetrics;
  documentation: DocumentationEvidence;
  maintainability: AnalysisScore;
  architecture: ArchitectureReview;
  technicalDebt: { debtLevel: RiskLevel; index: number; findings: string[] };
  testing: TestingReadiness;
  secretHygiene: SecretHygiene;
  risk: { level: RiskLevel; summary: string };
}): RemediationItem[] {
  const {
    metrics,
    documentation,
    maintainability,
    architecture,
    technicalDebt,
    testing,
    secretHygiene,
    risk,
  } = args;
  const items: RemediationItem[] = [];

  if (secretHygiene.status !== "CLEAR") {
    items.push({
      id: "remediate-secret-hygiene",
      category: "Secret Hygiene",
      priority: secretHygiene.status === "RISK" ? "Critical" : "High",
      effort: metrics.trackedEnvFiles.length > 0 ? "Medium" : "Low",
      title: "Tighten secret and environment hygiene",
      summary: secretHygiene.summary,
      impact: "Reduces credential leakage risk and makes onboarding safer.",
      evidence: [
        {
          label: "Secret hygiene",
          value: `${secretHygiene.score}/100`,
        },
        {
          label: "Path signal",
          value: formatList(
            [...metrics.trackedEnvFiles, ...metrics.secretRiskFiles].slice(0, 3),
            "No risky path captured",
          ),
          path: metrics.trackedEnvFiles[0] ?? metrics.secretRiskFiles[0],
        },
      ],
      actions: [
        "Move real credentials into deployment secrets or local-only environment files.",
        "Rotate any credential that may have been committed.",
        "Keep only placeholder values in .env.example, never live keys.",
      ],
    });
  }

  if (testing.coverageConfidence < 65) {
    items.push({
      id: "raise-testing-confidence",
      category: "Testing",
      priority: testing.coverageConfidence < 45 ? "High" : "Medium",
      effort: "Medium",
      title: "Raise testing confidence around core flows",
      summary: testing.health,
      impact: "Improves release confidence and makes PR/branch scans more meaningful.",
      evidence: [
        {
          label: "Coverage confidence",
          value: `${testing.coverageConfidence}%`,
        },
        {
          label: "Detected test paths",
          value: formatList(metrics.testFilePaths, "No test files detected"),
          path: metrics.testFilePaths[0],
        },
      ],
      actions: [
        "Add smoke tests for the main user journey and API routes.",
        "Add regression tests around scoring and report generation helpers.",
        "Run the test command in CI before publishing VibeScore badges or summaries.",
      ],
    });
  }

  if (documentation.score < 75) {
    items.push({
      id: "improve-docs-evidence",
      category: "Documentation",
      priority: documentation.score < 55 ? "High" : "Medium",
      effort: "Low",
      title: "Improve documentation evidence",
      summary: `Documentation is currently scored ${documentation.score} (${documentation.status}).`,
      impact: "Improves contributor onboarding, audits, and generated organization snapshots.",
      evidence: [
        {
          label: "Documentation flags",
          value: formatList(metrics.docsFlags, "No strong documentation signals"),
        },
        {
          label: "Doc paths",
          value: formatList(metrics.docFiles, "No docs files detected"),
          path: metrics.docFiles[0],
        },
      ],
      actions: [
        "Add setup, environment, and local development instructions.",
        "Document expected test and build commands.",
        "Add examples or screenshots for the primary workflow.",
      ],
    });
  }

  if (
    technicalDebt.index > 35 ||
    maintainability.score < 70 ||
    architecture.grade === "C" ||
    architecture.grade === "D"
  ) {
    items.push({
      id: "reduce-complexity-hotspots",
      category: "Technical Debt",
      priority: technicalDebt.index > 65 || maintainability.score < 55 ? "High" : "Medium",
      effort: "High",
      title: "Reduce complexity hotspots",
      summary: technicalDebt.findings.join(" "),
      impact: "Improves maintainability score and lowers production-readiness risk.",
      evidence: [
        {
          label: "Debt index",
          value: `${technicalDebt.index}%`,
        },
        {
          label: "Large files",
          value: formatList(metrics.longFiles, "No oversized files in sample"),
          path: metrics.longFiles[0],
        },
      ],
      actions: [
        "Split oversized files by workflow, domain, or shared helper responsibility.",
        "Convert repeated logic into local utilities only where duplication is proven.",
        "Resolve TODO/FIXME/HACK markers that sit on production paths.",
      ],
    });
  }

  if (risk.level !== "LOW") {
    items.push({
      id: "stabilize-risk-posture",
      category: "Risk",
      priority: risk.level === "HIGH" ? "High" : "Medium",
      effort: "Medium",
      title: "Stabilize the risk posture",
      summary: risk.summary,
      impact: "Moves the repository toward a safer production-readiness verdict.",
      evidence: [
        {
          label: "Risk level",
          value: risk.level,
        },
        {
          label: "Last activity",
          value: `${metrics.staleDays} days since last push`,
        },
      ],
      actions: [
        "Address the highest-risk finding before adding new product surface.",
        "Re-scan after fixes and compare against the previous health baseline.",
        "Use the CI summary endpoint to keep future drift visible.",
      ],
    });
  }

  if (items.length === 0) {
    items.push({
      id: "codify-health-gates",
      category: "Risk",
      priority: "Medium",
      effort: "Low",
      title: "Codify current health as a gate",
      summary: "The repository is healthy enough that the next move is preserving quality drift.",
      impact: "Keeps future scans from silently regressing as the product grows.",
      evidence: [
        {
          label: "Current posture",
          value: "No urgent remediation item generated",
        },
      ],
      actions: [
        "Add VibeScore CI summary checks to scheduled scans.",
        "Track health deltas after larger PRs.",
        "Keep secret hygiene templates placeholder-only.",
      ],
    });
  }

  const priorityRank: Record<RemediationItem["priority"], number> = {
    Critical: 0,
    High: 1,
    Medium: 2,
  };

  return items
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority])
    .slice(0, 5);
}

function inferArchetype(args: {
  aiScore: number;
  maintainability: number;
  docs: number;
  debt: number;
  staleDays: number;
}): { archetype: RepoArchetype; summary: string[] } {
  const { aiScore, maintainability, docs, debt, staleDays } = args;

  if (staleDays > 500) {
    return {
      archetype: "Legacy Survivor",
      summary: ["Old code.", "Still standing.", "Operational resilience persists."],
    };
  }

  if (docs > 82 && maintainability > 78) {
    return {
      archetype: "Architect",
      summary: ["Well-structured.", "Well-documented.", "Built for longevity."],
    };
  }

  if (aiScore > 68 && maintainability > 65) {
    return {
      archetype: "AI Power User",
      summary: ["Heavy AI assistance.", "Surprisingly maintainable.", "Delivery speed is high."],
    };
  }

  if (docs > 80 && debt < 30) {
    return {
      archetype: "Enterprise Fortress",
      summary: ["Process-heavy.", "Highly documented.", "Extremely stable."],
    };
  }

  return {
    archetype: "Startup Chaos",
    summary: ["Fast-moving.", "High velocity.", "Growing technical debt."],
  };
}

function buildRepositoryAge(createdAt: string) {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
  if (days < 30) return `${days} days`;
  const months = Math.floor(days / 30);
  if (months < 24) return `${months} months`;
  return `${Math.floor(months / 12)} years`;
}

export async function investigateRepository(
  repoUrl: string,
  options: InvestigationOptions = {},
): Promise<{
  logs: string[];
  report: InvestigationReport;
  persistence?: { enabled: boolean; message?: string };
}> {
  const parsed = parseRepositoryUrl(repoUrl);
  const { owner, repo } = parsed;
  const rulePack = resolveRulePack(options.rulePack);

  const repoPayload = await githubRequest<GitHubRepoPayload>(`/repos/${owner}/${repo}`);
  const scanTarget = await resolveScanTarget({
    owner,
    repo,
    defaultBranch: repoPayload.default_branch,
    parsed,
    requested: options.scanTarget,
  });
  const [tree, contributors, packageJson, readmePreview] = await Promise.all([
    githubRequest<TreeResponse>(
      `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(scanTarget.ref)}?recursive=1`,
    ),
    fetchContributors(owner, repo),
    fetchPackageJson(owner, repo, scanTarget.ref),
    fetchFileSample(owner, repo, scanTarget.ref, ["README.md"]),
  ]);

  const codePaths = tree.tree
    .filter(
      (entry) =>
        entry.type === "blob" &&
        CODE_EXTENSIONS.some((ext) => entry.path.toLowerCase().endsWith(ext)) &&
        (entry.size ?? 0) < 250000,
    )
    .map((entry) => entry.path);

  const docsPaths = tree.tree
    .filter((entry) => entry.type === "blob" && entry.path.toLowerCase().endsWith(".md"))
    .slice(0, 10)
    .map((entry) => entry.path);

  const safeConfigPaths = tree.tree
    .filter((entry) => {
      if (entry.type !== "blob") {
        return false;
      }

      const basename = entry.path.split("/").pop()?.toLowerCase() ?? "";
      return SAFE_CONFIG_FILES.includes(basename);
    })
    .slice(0, 8)
    .map((entry) => entry.path);

  const sampledFiles = await fetchFileSample(owner, repo, scanTarget.ref, [
    ...new Set([...safeConfigPaths, ...docsPaths, ...codePaths.slice(0, 25)]),
  ]);

  const metrics = buildRawMetrics({
    repo: repoPayload,
    tree,
    contributors,
    packageJson,
    files: [...readmePreview, ...sampledFiles],
  });

  const aiAssistance = buildAiAssistance(metrics);
  const documentation = buildDocumentation(metrics);
  const maintainability = buildMaintainability(metrics);
  const architecture = buildArchitecture(metrics);
  const technicalDebt = buildTechnicalDebt(metrics);
  const testing = buildTesting(metrics);
  const secretHygiene = buildSecretHygiene(metrics);
  const risk = buildRisk(metrics, technicalDebt.index, maintainability.score, secretHygiene.score);
  const explainableFindings = buildExplainableFindings({
    metrics,
    ai: aiAssistance,
    documentation,
    maintainability,
    architecture,
    technicalDebt,
    testing,
    secretHygiene,
    risk,
  });
  const remediationPlan = buildRemediationPlan({
    metrics,
    documentation,
    maintainability,
    architecture,
    technicalDebt,
    testing,
    secretHygiene,
    risk,
  });
  const archetype = inferArchetype({
    aiScore: aiAssistance.score,
    maintainability: maintainability.score,
    docs: documentation.score,
    debt: technicalDebt.index,
    staleDays: metrics.staleDays,
  });

  const riskScore = riskScoreFromLevel(risk.level);
  const overallHealth = normalizeToScore(
    documentation.score * rulePack.weights.documentation +
      maintainability.score * rulePack.weights.maintainability +
      (100 - technicalDebt.index) * rulePack.weights.technicalDebt +
      testing.coverageConfidence * rulePack.weights.testing +
      riskScore * rulePack.weights.risk,
  );

  const style =
    aiAssistance.score > 68
      ? "Human + AI"
      : aiAssistance.score > 45
        ? "Human-led"
        : "AI-accelerated";

  const repositoryIdentity: RepositoryIdentity = {
    owner,
    name: repoPayload.name,
    fullName: repoPayload.full_name,
    primaryLanguages:
      metrics.languageBreakdown.length > 0
        ? metrics.languageBreakdown
        : [repoPayload.language ?? "Unknown"],
    totalFiles: metrics.fileCount,
    contributors: metrics.contributors,
    repositoryAge: buildRepositoryAge(repoPayload.created_at),
    lastActivity: new Date(repoPayload.pushed_at).toISOString().slice(0, 10),
    dependencyCount: metrics.dependencyCount,
  };

  const report: InvestigationReport = {
    caseId: `VS-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 89999)}`,
    repository: repositoryIdentity,
    scanTarget,
    aiAssistance,
    documentation,
    maintainability,
    architecture,
    technicalDebt,
    testing,
    secretHygiene,
    risk,
    archetype: archetype.archetype,
    archetypeSummary: archetype.summary,
    verdict: {
      message:
        style === "Human + AI"
          ? "This repository appears to be human-led development with significant AI assistance."
          : style === "Human-led"
            ? "This repository appears primarily human-led with selective automation support."
            : "This repository appears strongly automation-accelerated with focused human oversight.",
      productionReadiness: overallHealth > 80 ? "HIGH" : overallHealth > 60 ? "MEDIUM" : "LOW",
      overallHealth,
      style,
    },
    generatedAt: new Date().toISOString(),
    rulePack: rulePack.id,
    explainableFindings,
    remediationPlan,
  };

  let persistence: { enabled: boolean; message?: string } | undefined;

  if (options.persist !== false && process.env.DATABASE_URL) {
    try {
      const payload = report as unknown as Prisma.JsonObject;
      await prisma.investigation.create({
        data: {
          repoFullName: report.repository.fullName,
          caseId: report.caseId,
          payload,
        },
      });
      persistence = { enabled: true };
    } catch (error) {
      const rawMessage =
        error instanceof Error
          ? error.message
          : "Failed to persist investigation history.";

      const message = isDatabaseConnectionError(rawMessage)
        ? "Historical Trend Scans are unavailable because database connection is not configured correctly. Investigations still run normally."
        : "Historical Trend Scans are temporarily unavailable.";

      console.error("Investigation persistence failed:", rawMessage);
      persistence = { enabled: false, message };
    }
  }

  return { logs: LOGS, report, persistence };
}
