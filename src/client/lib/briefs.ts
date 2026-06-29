import type {
  DailyBrief,
  IntelligenceUpdate,
} from "../../shared/contracts";

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "being",
  "broad",
  "from",
  "into",
  "more",
  "only",
  "still",
  "than",
  "that",
  "their",
  "this",
  "through",
  "with",
]);

export function getSecondarySignalUpdate(
  brief: DailyBrief,
  updates: IntelligenceUpdate[],
  signal: string,
  index: number,
): IntelligenceUpdate | null {
  const updatesById = new Map(
    updates.map((update) => [update.id, update] as const),
  );
  const positionalUpdateId = brief.updateIds[index + 1];
  const positionallyLinked = positionalUpdateId
    ? updatesById.get(positionalUpdateId)
    : undefined;
  if (positionallyLinked) {
    return positionallyLinked;
  }

  const signalTerms = terms(signal);
  const candidates = brief.updateIds
    .map((updateId) => updatesById.get(updateId))
    .filter((update): update is IntelligenceUpdate => update !== undefined);
  if (candidates.length === 0) {
    return null;
  }

  return candidates
    .map((update, candidateIndex) => ({
      update,
      candidateIndex,
      score: relevanceScore(signal, signalTerms, update),
    }))
    .toSorted(
      (left, right) =>
        right.score - left.score ||
        left.candidateIndex - right.candidateIndex,
    )[0]!.update;
}

function relevanceScore(
  signal: string,
  signalTerms: Set<string>,
  update: IntelligenceUpdate,
): number {
  const searchable = [
    update.title,
    update.whatHappened,
    update.whyItMatters,
    ...update.beneficiaries,
    ...update.threatened,
    ...update.watchNext,
    ...update.thesisImpacts.flatMap((impact) => [
      impact.summary,
      impact.thesisDelta,
    ]),
  ].join(" ");
  const updateTerms = terms(searchable);
  const tickerScore = update.companyTickers.reduce(
    (score, ticker) =>
      score +
      (new RegExp(`\\b${escapeRegExp(ticker)}\\b`, "i").test(signal) ? 5 : 0),
    0,
  );
  const overlapScore = [...signalTerms].reduce(
    (score, term) => score + (updateTerms.has(term) ? 1 : 0),
    0,
  );
  return tickerScore + overlapScore;
}

function terms(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .match(/[a-z0-9][a-z0-9-]{2,}/g)
      ?.filter((term) => !STOP_WORDS.has(term)) ?? [],
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
