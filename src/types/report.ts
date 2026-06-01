export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

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

export interface InvestigationReport {
  caseId: string;
  repository: RepositoryIdentity;
  aiAssistance: AnalysisScore;
  documentation: DocumentationEvidence;
  maintainability: AnalysisScore;
  architecture: ArchitectureReview;
  technicalDebt: TechnicalDebt;
  testing: TestingReadiness;
  risk: RiskAssessment;
  archetype: RepoArchetype;
  archetypeSummary: string[];
  verdict: Verdict;
  generatedAt: string;
}

export interface InvestigationApiResponse {
  logs: string[];
  report: InvestigationReport;
}
