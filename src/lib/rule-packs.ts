import { type RulePackId } from "@/types/report";

export interface RulePackConfig {
  id: RulePackId;
  label: string;
  description: string;
  emphasis: string[];
  weights: {
    documentation: number;
    maintainability: number;
    technicalDebt: number;
    testing: number;
    risk: number;
  };
}

export const RULE_PACKS: RulePackConfig[] = [
  {
    id: "startup",
    label: "Startup",
    description: "Optimized for momentum, tolerates controlled debt, highlights runway risk.",
    emphasis: ["Delivery speed", "Lean documentation", "Risk visibility"],
    weights: {
      documentation: 0.18,
      maintainability: 0.24,
      technicalDebt: 0.18,
      testing: 0.1,
      risk: 0.3,
    },
  },
  {
    id: "enterprise",
    label: "Enterprise",
    description: "Prioritizes documentation, stability, and long-term maintainability.",
    emphasis: ["Compliance", "Durability", "Process rigor"],
    weights: {
      documentation: 0.28,
      maintainability: 0.28,
      technicalDebt: 0.22,
      testing: 0.15,
      risk: 0.07,
    },
  },
  {
    id: "oss",
    label: "Open Source",
    description: "Balances community docs, test discipline, and architectural clarity.",
    emphasis: ["Community onboarding", "Testing cadence", "Clear architecture"],
    weights: {
      documentation: 0.24,
      maintainability: 0.25,
      technicalDebt: 0.18,
      testing: 0.2,
      risk: 0.13,
    },
  },
];

export const RULE_PACK_BY_ID = Object.fromEntries(
  RULE_PACKS.map((pack) => [pack.id, pack]),
) as Record<RulePackId, RulePackConfig>;

export function resolveRulePack(id?: RulePackId | string): RulePackConfig {
  if (id && id in RULE_PACK_BY_ID) {
    return RULE_PACK_BY_ID[id as RulePackId];
  }
  return RULE_PACK_BY_ID.startup;
}
