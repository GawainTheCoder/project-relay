import type {
  IntelligenceUpdate,
  ThesisImpact,
} from "../../shared/contracts";

export function isThesisChangingImpact(impact: ThesisImpact): boolean {
  return (
    impact.direction !== "not-material" &&
    impact.decision !== "rejected" &&
    impact.review?.decision !== "rejected" &&
    impact.thesisDelta.trim().length > 0
  );
}

export function isThesisChangingSignal(
  update: IntelligenceUpdate,
): boolean {
  const hasDirectMacroRoute = update.macroThesisImpacts.some(
    (impact) =>
      impact.relevance === "primary" ||
      impact.relevance === "secondary",
  );
  return (
    update.materiality !== "not-material" &&
    update.novelty !== "repetition" &&
    update.sentiment !== "not-material" &&
    update.claims.length > 0 &&
    (update.thesisImpacts.some(isThesisChangingImpact) ||
      hasDirectMacroRoute)
  );
}
