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
  type RiskLevel,
  type RulePackId,
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

function parseRepositoryUrl(repoUrl: string) {
  const cleaned = repoUrl
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\.git$/, "");

  const match = cleaned.match(/^github\.com\/([^/]+)\/([^/]+)/i);
  if (!match) {
    throw new Error("Please provide a valid GitHub repository URL.");
  }

  return { owner: match[1], repo: match[2] };
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
  branch: string,
): Promise<Record<string, unknown> | null> {
  try {
    const contentResponse = await githubRequest<{
      content: string;
      encoding: string;
    }>(`/repos/${owner}/${repo}/contents/package.json?ref=${branch}`);

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

  const readme = files.find((file) => /readme\.md$/i.test(file.path));
  const readmeLength = readme?.content.length ?? 0;

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

function buildRisk(metrics: RawMetrics, debtIndex: number, maintainability: number) {
  const stalePenalty = metrics.staleDays > 365 ? 20 : metrics.staleDays > 120 ? 10 : 0;
  const riskScore = normalizeToScore(debtIndex * 0.5 + (100 - maintainability) * 0.4 + stalePenalty);

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
  risk: { level: RiskLevel; summary: string };
}): ExplainableFinding[] {
  const { metrics, ai, documentation, maintainability, architecture, technicalDebt, testing, risk } = args;

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
  options: { rulePack?: RulePackId | string; persist?: boolean } = {},
): Promise<{
  logs: string[];
  report: InvestigationReport;
  persistence?: { enabled: boolean; message?: string };
}> {
  const { owner, repo } = parseRepositoryUrl(repoUrl);
  const rulePack = resolveRulePack(options.rulePack);

  const repoPayload = await githubRequest<GitHubRepoPayload>(`/repos/${owner}/${repo}`);
  const [tree, contributors, packageJson, readmePreview] = await Promise.all([
    githubRequest<TreeResponse>(
      `/repos/${owner}/${repo}/git/trees/${repoPayload.default_branch}?recursive=1`,
    ),
    fetchContributors(owner, repo),
    fetchPackageJson(owner, repo, repoPayload.default_branch),
    fetchFileSample(owner, repo, repoPayload.default_branch, ["README.md"]),
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

  const sampledFiles = await fetchFileSample(owner, repo, repoPayload.default_branch, [
    ...new Set([...docsPaths, ...codePaths.slice(0, 25)]),
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
  const risk = buildRisk(metrics, technicalDebt.index, maintainability.score);
  const explainableFindings = buildExplainableFindings({
    metrics,
    ai: aiAssistance,
    documentation,
    maintainability,
    architecture,
    technicalDebt,
    testing,
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
    aiAssistance,
    documentation,
    maintainability,
    architecture,
    technicalDebt,
    testing,
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
      const message =
        error instanceof Error
          ? error.message
          : "Failed to persist investigation history.";
      console.error("Investigation persistence failed:", message);
      persistence = { enabled: false, message };
    }
  }

  return { logs: LOGS, report, persistence };
}
