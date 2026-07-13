import type {
  ThesisEvaluation,
  ThesisMomentum,
} from "../../../shared/contracts";

export function evaluationMomentum(
  evaluation: ThesisEvaluation,
): ThesisMomentum {
  if (evaluation.outcome === "reinforced") {
    return "strengthening";
  }
  if (
    evaluation.outcome === "weakened" ||
    evaluation.outcome === "contradicted"
  ) {
    return "weakening";
  }
  if (evaluation.outcome === "revised") {
    if (evaluation.confidenceDelta > 0) {
      return "strengthening";
    }
    if (evaluation.confidenceDelta < 0) {
      return "weakening";
    }
  }
  return "unchanged";
}

export function reviewStatusLabel(
  status: ThesisEvaluation["reviewStatus"],
): string {
  if (status === "pending") {
    return "Needs review";
  }
  return status.charAt(0).toUpperCase() + status.slice(1);
}
