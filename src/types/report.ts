export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type RulePackId = "startup" | "enterprise" | "oss";

export type ScanTargetMode = "default" | "branch" | "pull_request";

export type RepoArchetype =
  | "Architect"
  | "Startup Chaos"
  | "AI Power User"
  | "Legacy Survivor"
  | "Enterprise Fortress";

export interface RepositoryIdentity {
  owner: string;
  name: string;
  fullName: string;
  primaryLanguages: string[];
  totalFiles: number;
  contributors: number;
  repositoryAge: string;
  lastActivity: string;
  dependencyCount: number;
}

export interface ScanTarget {
  mode: ScanTargetMode;
  label: string;
  ref: string;
  requestedRef?: string;
  baseRef?: string;
  headRef?: string;
  pullRequestNumber?: number;
  pullRequestTitle?: string;
  changedFiles?: number;
}

export interface AnalysisScore {
  score: number;
  confidence: "Low" | "Medium" | "High";
  narrative: string;
}

export interface DocumentationEvidence {
  status: "POOR" | "FAIR" | "GOOD" | "EXCELLENT";
  score: number;
  checklist: string[];
}

export interface ArchitectureReview {
  grade: "A" | "B" | "C" | "D";
  assessment: string;
}

export interface TechnicalDebt {
  debtLevel: RiskLevel;
  index: number;
  findings: string[];
}

export interface TestingReadiness {
  coverageConfidence: number;
  frameworks: string[];
  health: string;
}

export interface SecretHygiene {
  status: "CLEAR" | "WATCH" | "RISK";
  score: number;
  summary: string;
  signals: string[];
  findings: string[];
}

export interface RiskAssessment {
  level: RiskLevel;
  summary: string;
}

export interface Verdict {
  message: string;
  productionReadiness: "LOW" | "MEDIUM" | "HIGH";
  overallHealth: number;
  style: "Human + AI" | "Human-led" | "AI-accelerated";
}

export interface ExplainableEvidence {
  label: string;
  value: string;
  path?: string;
}

export interface ExplainableFinding {
  id: string;
  category:
    | "AI Assistance"
    | "Documentation"
    | "Maintainability"
    | "Architecture"
    | "Technical Debt"
    | "Testing"
    | "Secret Hygiene"
    | "Risk";
  title: string;
  summary: string;
  evidence: ExplainableEvidence[];
}

export interface RemediationItem {
  id: string;
  category: ExplainableFinding["category"];
  priority: "Critical" | "High" | "Medium";
  effort: "Low" | "Medium" | "High";
  title: string;
  summary: string;
  impact: string;
  evidence: ExplainableEvidence[];
  actions: string[];
}

export interface InvestigationReport {
  caseId: string;
  repository: RepositoryIdentity;
  scanTarget: ScanTarget;
  aiAssistance: AnalysisScore;
  documentation: DocumentationEvidence;
  maintainability: AnalysisScore;
  architecture: ArchitectureReview;
  technicalDebt: TechnicalDebt;
  testing: TestingReadiness;
  secretHygiene: SecretHygiene;
  risk: RiskAssessment;
  archetype: RepoArchetype;
  archetypeSummary: string[];
  verdict: Verdict;
  generatedAt: string;
  rulePack: RulePackId;
  explainableFindings: ExplainableFinding[];
  remediationPlan: RemediationItem[];
}

export interface InvestigationApiResponse {
  logs: string[];
  report: InvestigationReport;
  persistence?: {
    enabled: boolean;
    message?: string;
  };
}

export interface HistoricalInvestigation {
  caseId: string;
  overallHealth: number;
  riskLevel: RiskLevel;
  verdictStyle: Verdict["style"];
  generatedAt: string;
  rulePack: RulePackId;
  metrics: {
    aiAssistance: number;
    documentation: number;
    maintainability: number;
    technicalDebt: number;
    testing: number;
    secretHygiene: number;
  };
}

export interface OrganizationSummary {
  owner: string;
  totalRepos: number;
  totalScans: number;
  averageHealth: number;
  riskBreakdown: Record<RiskLevel, number>;
  latestScanAt: string | null;
  topRepos: Array<{
    repoFullName: string;
    scans: number;
    averageHealth: number;
    lastScanAt: string;
  }>;
}

export interface ComparisonDelta {
  metric: string;
  left: number;
  right: number;
  delta: number;
  direction: "higher" | "lower" | "equal";
}

export interface ComparisonCallouts {
  strongestRepo: string;
  mostRiskyRepo: string;
  healthLead: number;
  riskGap: number;
}

export interface ComparisonReport {
  left: InvestigationReport;
  right: InvestigationReport;
  deltas: ComparisonDelta[];
  callouts: ComparisonCallouts;
}
