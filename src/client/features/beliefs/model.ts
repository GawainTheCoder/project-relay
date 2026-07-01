import type {
  Company,
  DashboardPayload,
  IntelligenceUpdate,
  ThesisImpact,
} from "../../../shared/contracts";
import type {
  BeliefDetail,
  BeliefEvaluation,
  BeliefEvaluationOutcome,
  BeliefEvidence,
  BeliefEvidenceStance,
  BeliefSummary,
} from "../../lib/api";

const confidencePercent = {
  high: 80,
  medium: 60,
  low: 40,
} as const;

function impactStance(impact: ThesisImpact): BeliefEvidenceStance {
  if (impact.direction === "bullish") {
    return "supports";
  }
  if (impact.direction === "bearish") {
    return "opposes";
  }
  return "context";
}

function evaluationOutcome(
  impact: ThesisImpact,
): BeliefEvaluationOutcome {
  if (impact.direction === "bullish") {
    return "reinforced";
  }
  if (impact.direction === "bearish") {
    return "weakened";
  }
  return "revised";
}

function confidenceDelta(impact: ThesisImpact) {
  const magnitude = {
    high: 5,
    medium: 3,
    low: 1,
  }[impact.confidence];
  if (impact.direction === "bullish") {
    return magnitude;
  }
  if (impact.direction === "bearish") {
    return -magnitude;
  }
  return 0;
}

function isPendingImpact(impact: ThesisImpact) {
  return (
    impact.review?.decision === "deferred" ||
    (!impact.review && impact.decision === "proposed")
  );
}

function evidenceForUpdate(
  update: IntelligenceUpdate,
  stance: BeliefEvidenceStance,
): BeliefEvidence[] {
  return update.claims.map((claim) => ({
    id: `${update.id}:${claim.id}`,
    claimId: claim.id,
    quote: claim.quote,
    locator: claim.locator,
    publisher: update.publisher,
    sourceTitle: update.title,
    publishedAt: update.publishedAt,
    stance,
    updateId: update.id,
  }));
}

function companyImpacts(
  company: Company,
  updates: IntelligenceUpdate[],
) {
  return updates.flatMap((update) =>
    update.thesisImpacts
      .filter((impact) => impact.companyTicker === company.ticker)
      .map((impact) => ({ impact, update })),
  );
}

function buildCompanyBelief(
  company: Company,
  updates: IntelligenceUpdate[],
): BeliefDetail {
  const impacts = companyImpacts(company, updates).sort(
    (left, right) =>
      new Date(right.update.publishedAt).getTime() -
      new Date(left.update.publishedAt).getTime(),
  );
  const evidence = impacts.flatMap(({ impact, update }) =>
    evidenceForUpdate(update, impactStance(impact)),
  );
  const pendingEvaluations: BeliefEvaluation[] = impacts
    .filter(({ impact }) => isPendingImpact(impact))
    .map(({ impact, update }) => ({
      id: impact.id,
      outcome: evaluationOutcome(impact),
      reviewStatus:
        impact.review?.decision === "deferred" ? "deferred" : "pending",
      proposedStatement: impact.thesisDelta || null,
      confidenceDelta: confidenceDelta(impact),
      rationale: impact.summary,
      evidenceIds: update.claims.map((claim) => `${update.id}:${claim.id}`),
      createdAt: update.ingestedAt,
    }));
  const supportingEvidence = evidence.filter(
    (item) => item.stance === "supports",
  );
  const opposingEvidence = evidence.filter(
    (item) => item.stance === "opposes",
  );
  const contextualEvidence = evidence.filter(
    (item) => item.stance === "context",
  );

  return {
    id: company.ticker,
    kind: "company",
    title: `${company.ticker} · ${company.name}`,
    statement: company.thesis,
    confidence: confidencePercent[company.confidence],
    companyTicker: company.ticker,
    layerIds: company.layerIds,
    updatedAt: company.updatedAt,
    supportingEvidenceCount: supportingEvidence.length,
    opposingEvidenceCount: opposingEvidence.length,
    pendingEvaluationCount: pendingEvaluations.filter(
      (evaluation) => evaluation.reviewStatus === "pending",
    ).length,
    whyItMatters: company.whyItMatters,
    latestChange: null,
    unknowns: [],
    strengtheningConditions: company.provesRight,
    weakeningConditions: company.breaksThesis,
    supportingEvidence,
    opposingEvidence,
    contextualEvidence,
    pendingEvaluations,
    versions: [
      {
        id: `${company.ticker}:current`,
        version: 1,
        statement: company.thesis,
        confidence: confidencePercent[company.confidence],
        rationale: "Initial company thesis imported from the legacy watchlist.",
        createdAt: company.updatedAt,
      },
    ],
  };
}

export function deriveBeliefDetails(
  dashboard: DashboardPayload,
): BeliefDetail[] {
  return dashboard.companies.map((company) =>
    buildCompanyBelief(company, dashboard.updates),
  );
}

export function deriveBeliefSummaries(
  dashboard: DashboardPayload,
): BeliefSummary[] {
  return deriveBeliefDetails(dashboard).map((belief) => ({
    id: belief.id,
    kind: belief.kind,
    title: belief.title,
    statement: belief.statement,
    confidence: belief.confidence,
    companyTicker: belief.companyTicker,
    layerIds: belief.layerIds,
    updatedAt: belief.updatedAt,
    supportingEvidenceCount: belief.supportingEvidenceCount,
    opposingEvidenceCount: belief.opposingEvidenceCount,
    pendingEvaluationCount: belief.pendingEvaluationCount,
  }));
}

export function deriveBeliefDetail(
  dashboard: DashboardPayload,
  beliefId: string,
) {
  const normalizedId = beliefId.toLowerCase();
  return deriveBeliefDetails(dashboard).find(
    (belief) =>
      belief.id.toLowerCase() === normalizedId ||
      belief.companyTicker?.toLowerCase() === normalizedId,
  );
}
