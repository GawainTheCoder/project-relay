import { createHash } from "node:crypto";

export interface StoryCandidate {
  id: string;
  title: string;
  publishedAt: string;
  companyTickers: readonly string[];
}

export interface StoryClusteringPolicy {
  maxPublicationGapHours: number;
  minimumExactTitleTokens: number;
  minimumSharedTitleTokens: number;
  minimumTitleContainment: number;
  minimumTitleJaccard: number;
}

export const DEFAULT_STORY_CLUSTERING_POLICY: StoryClusteringPolicy = {
  maxPublicationGapHours: 72,
  minimumExactTitleTokens: 4,
  minimumSharedTitleTokens: 5,
  minimumTitleContainment: 0.82,
  minimumTitleJaccard: 0.58,
};

export type StoryComparisonReasonCode =
  | "company-overlap"
  | "publication-window"
  | "title-overlap";

export interface StoryComparisonReason {
  code: StoryComparisonReasonCode;
  passed: boolean;
  detail: string;
}

export interface StoryTitleSimilarity {
  leftTokenCount: number;
  rightTokenCount: number;
  sharedTokenCount: number;
  containment: number;
  jaccard: number;
}

export interface StoryComparison {
  sameStory: boolean;
  score: number;
  clusterKey: string | null;
  anchorId: string;
  overlappingCompanyTickers: string[];
  publicationGapHours: number | null;
  titleSimilarity: StoryTitleSimilarity;
  reasons: StoryComparisonReason[];
}

export interface StoryClusterMember {
  id: string;
  duplicateOfAnchor: boolean;
  comparisonToAnchor: StoryComparison | null;
}

export interface StoryCluster {
  key: string;
  anchorId: string;
  members: StoryClusterMember[];
}

const TITLE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "in",
  "is",
  "it",
  "its",
  "new",
  "news",
  "of",
  "on",
  "or",
  "report",
  "reported",
  "reporting",
  "reports",
  "says",
  "the",
  "to",
  "update",
  "with",
]);

/**
 * Conservatively identifies two publisher records as coverage of one event.
 *
 * Matching requires all three independent gates: overlapping company context,
 * publication inside a bounded window, and strong content-token overlap. The
 * score is explanatory only; callers should use `sameStory` for decisions.
 */
export function compareStories(
  left: StoryCandidate,
  right: StoryCandidate,
  policyOverrides: Partial<StoryClusteringPolicy> = {},
): StoryComparison {
  const policy = { ...DEFAULT_STORY_CLUSTERING_POLICY, ...policyOverrides };
  const leftTokens = normalizedTitleTokens(left.title);
  const rightTokens = normalizedTitleTokens(right.title);
  const sharedTokens = intersection(leftTokens, rightTokens);
  const unionTokenCount = new Set([...leftTokens, ...rightTokens]).size;
  const smallerTokenCount = Math.min(leftTokens.length, rightTokens.length);
  const containment =
    smallerTokenCount === 0 ? 0 : sharedTokens.length / smallerTokenCount;
  const jaccard =
    unionTokenCount === 0 ? 0 : sharedTokens.length / unionTokenCount;
  const titleSimilarity: StoryTitleSimilarity = {
    leftTokenCount: leftTokens.length,
    rightTokenCount: rightTokens.length,
    sharedTokenCount: sharedTokens.length,
    containment: roundRatio(containment),
    jaccard: roundRatio(jaccard),
  };

  const leftCompanies = normalizedCompanies(left.companyTickers);
  const rightCompanies = normalizedCompanies(right.companyTickers);
  const overlappingCompanyTickers = intersection(
    leftCompanies,
    rightCompanies,
  );
  const hasCompanyOverlap = overlappingCompanyTickers.length > 0;

  const leftTimestamp = Date.parse(left.publishedAt);
  const rightTimestamp = Date.parse(right.publishedAt);
  const hasValidTimestamps =
    Number.isFinite(leftTimestamp) && Number.isFinite(rightTimestamp);
  const publicationGapHours = hasValidTimestamps
    ? Math.abs(leftTimestamp - rightTimestamp) / 3_600_000
    : null;
  const isInsidePublicationWindow =
    publicationGapHours !== null &&
    publicationGapHours <= policy.maxPublicationGapHours;

  const isExactTokenSet =
    leftTokens.length === rightTokens.length &&
    leftTokens.length >= policy.minimumExactTitleTokens &&
    sharedTokens.length === leftTokens.length;
  const hasStrongTitleOverlap =
    isExactTokenSet ||
    (sharedTokens.length >= policy.minimumSharedTitleTokens &&
      containment >= policy.minimumTitleContainment &&
      jaccard >= policy.minimumTitleJaccard);
  const sameStory =
    hasCompanyOverlap &&
    isInsidePublicationWindow &&
    hasStrongTitleOverlap;

  const companyCoverage =
    Math.min(leftCompanies.length, rightCompanies.length) === 0
      ? 0
      : overlappingCompanyTickers.length /
        Math.min(leftCompanies.length, rightCompanies.length);
  const publicationProximity =
    publicationGapHours === null
      ? 0
      : Math.max(
          0,
          1 - publicationGapHours / policy.maxPublicationGapHours,
        );
  const titleScore = containment * 0.65 + jaccard * 0.35;
  const score = Math.round(
    100 *
      (titleScore * 0.8 +
        publicationProximity * 0.1 +
        companyCoverage * 0.1),
  );
  const anchor = selectAnchor(left, right);

  return {
    sameStory,
    score,
    clusterKey: sameStory ? storyKey(anchor) : null,
    anchorId: anchor.id,
    overlappingCompanyTickers,
    publicationGapHours:
      publicationGapHours === null
        ? null
        : Math.round(publicationGapHours * 100) / 100,
    titleSimilarity,
    reasons: [
      {
        code: "company-overlap",
        passed: hasCompanyOverlap,
        detail: hasCompanyOverlap
          ? `Shared company context: ${overlappingCompanyTickers.join(", ")}.`
          : "No overlapping company ticker context.",
      },
      {
        code: "publication-window",
        passed: isInsidePublicationWindow,
        detail:
          publicationGapHours === null
            ? "At least one publication timestamp is invalid."
            : `Published ${formatHours(publicationGapHours)} hours apart; limit is ${policy.maxPublicationGapHours} hours.`,
      },
      {
        code: "title-overlap",
        passed: hasStrongTitleOverlap,
        detail: `Shared ${sharedTokens.length} content tokens; containment ${formatRatio(containment)}, Jaccard ${formatRatio(jaccard)}.`,
      },
    ],
  };
}

/**
 * Builds deterministic, input-order-independent story chains.
 *
 * A candidate must match a cluster's earliest anchor directly. This avoids
 * transitive chaining where a sequence of only loosely related headlines can
 * collapse into one event.
 */
export function clusterStories(
  candidates: readonly StoryCandidate[],
  policyOverrides: Partial<StoryClusteringPolicy> = {},
): StoryCluster[] {
  assertUniqueCandidateIds(candidates);
  const sortedCandidates = [...candidates].sort(compareCandidateOrder);
  const clusters: StoryCluster[] = [];

  for (const candidate of sortedCandidates) {
    const matches = clusters.flatMap((cluster) => {
      const anchor = sortedCandidates.find(
        (item) => item.id === cluster.anchorId,
      );
      if (!anchor) {
        throw new Error("Story cluster anchor is missing.");
      }
      const comparison = compareStories(
        anchor,
        candidate,
        policyOverrides,
      );
      return comparison.sameStory ? [{ cluster, comparison }] : [];
    });
    matches.sort(
      (left, right) =>
        right.comparison.score - left.comparison.score ||
        left.cluster.key.localeCompare(right.cluster.key),
    );
    const bestMatch = matches[0];

    if (bestMatch) {
      bestMatch.cluster.members.push({
        id: candidate.id,
        duplicateOfAnchor: true,
        comparisonToAnchor: bestMatch.comparison,
      });
      continue;
    }

    clusters.push({
      key: storyKey(candidate),
      anchorId: candidate.id,
      members: [
        {
          id: candidate.id,
          duplicateOfAnchor: false,
          comparisonToAnchor: null,
        },
      ],
    });
  }

  return clusters;
}

export function normalizedTitleTokens(title: string): string[] {
  const tokens =
    title
      .normalize("NFKC")
      .toLocaleLowerCase("en-US")
      .match(/[\p{L}\p{N}]+/gu) ?? [];
  return [
    ...new Set(tokens.filter((token) => !TITLE_STOP_WORDS.has(token))),
  ].sort();
}

function normalizedCompanies(tickers: readonly string[]): string[] {
  return [
    ...new Set(
      tickers
        .map((ticker) => ticker.trim().toLocaleUpperCase("en-US"))
        .filter(Boolean),
    ),
  ].sort();
}

function intersection(
  left: readonly string[],
  right: readonly string[],
): string[] {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
}

function selectAnchor(
  left: StoryCandidate,
  right: StoryCandidate,
): StoryCandidate {
  return compareCandidateOrder(left, right) <= 0 ? left : right;
}

function compareCandidateOrder(
  left: StoryCandidate,
  right: StoryCandidate,
): number {
  const leftTimestamp = Date.parse(left.publishedAt);
  const rightTimestamp = Date.parse(right.publishedAt);
  const normalizedLeftTimestamp = Number.isFinite(leftTimestamp)
    ? leftTimestamp
    : Number.POSITIVE_INFINITY;
  const normalizedRightTimestamp = Number.isFinite(rightTimestamp)
    ? rightTimestamp
    : Number.POSITIVE_INFINITY;
  return (
    normalizedLeftTimestamp - normalizedRightTimestamp ||
    left.id.localeCompare(right.id)
  );
}

function storyKey(anchor: StoryCandidate): string {
  const timestamp = Date.parse(anchor.publishedAt);
  const dateBucket = Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString().slice(0, 10)
    : "unknown-date";
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        dateBucket,
        companies: normalizedCompanies(anchor.companyTickers),
        titleTokens: normalizedTitleTokens(anchor.title),
      }),
    )
    .digest("hex")
    .slice(0, 20);
  return `story-${digest}`;
}

function assertUniqueCandidateIds(
  candidates: readonly StoryCandidate[],
): void {
  const ids = candidates.map((candidate) => candidate.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Story candidate IDs must be unique.");
  }
}

function roundRatio(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function formatRatio(value: number): string {
  return value.toFixed(2);
}

function formatHours(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}
