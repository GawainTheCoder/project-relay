import { useCallback, useEffect, useMemo, useState } from "react";

import type { DashboardPayload } from "../../../shared/contracts";
import {
  getBelief,
  listBeliefs,
  type BeliefDetail,
  type BeliefSummary,
} from "../../lib/api";
import {
  deriveBeliefDetail,
  deriveBeliefSummaries,
} from "./model";

function enrichBeliefDetail(
  belief: BeliefDetail,
  dashboard: DashboardPayload,
): BeliefDetail {
  const company = belief.companyTicker
    ? dashboard.companies.find(
        (candidate) => candidate.ticker === belief.companyTicker,
      )
    : undefined;
  const enrichEvidence = (evidence: BeliefDetail["supportingEvidence"]) =>
    evidence.map((item) => {
      const update = item.updateId
        ? dashboard.updates.find((candidate) => candidate.id === item.updateId)
        : undefined;
      return update
        ? {
            ...item,
            publisher: update.publisher,
            sourceTitle: update.title,
            publishedAt: update.publishedAt,
          }
        : item;
    });

  return {
    ...belief,
    whyItMatters: company?.whyItMatters ?? belief.whyItMatters,
    supportingEvidence: enrichEvidence(belief.supportingEvidence),
    opposingEvidence: enrichEvidence(belief.opposingEvidence),
    contextualEvidence: enrichEvidence(belief.contextualEvidence),
  };
}

export function useBeliefs(dashboard: DashboardPayload | null) {
  const [remoteState, setRemoteState] = useState<{
    beliefs: BeliefSummary[] | null;
    dashboard: DashboardPayload;
    error: string | null;
    isLoading: boolean;
  } | null>(null);
  const [revision, setRevision] = useState(0);
  const fallback = useMemo(
    () => (dashboard ? deriveBeliefSummaries(dashboard) : []),
    [dashboard],
  );

  useEffect(() => {
    if (!dashboard) {
      return;
    }
    const controller = new AbortController();
    void listBeliefs(controller.signal)
      .then((beliefs) =>
        setRemoteState({ beliefs, dashboard, error: null, isLoading: false }),
      )
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setRemoteState((current) => ({
            beliefs: current?.dashboard === dashboard ? current.beliefs : null,
            dashboard,
            error:
              error instanceof Error
                ? error.message
                : "Thesis data is unavailable.",
            isLoading: false,
          }));
        }
      });
    return () => controller.abort();
  }, [dashboard, revision]);

  const reload = useCallback(() => {
    setRemoteState((current) =>
      dashboard
        ? {
            beliefs:
              current?.dashboard === dashboard ? current.beliefs : null,
            dashboard,
            error: null,
            isLoading: true,
          }
        : current,
    );
    setRevision((current) => current + 1);
  }, [dashboard]);

  const currentState =
    remoteState?.dashboard === dashboard ? remoteState : null;
  const canonicalBeliefs = currentState?.beliefs ?? null;
  const hasCanonicalBeliefs = canonicalBeliefs !== null;

  return {
    beliefs: canonicalBeliefs ?? fallback,
    error: hasCanonicalBeliefs ? null : (currentState?.error ?? null),
    isLoading:
      Boolean(dashboard) &&
      (!currentState || (currentState.isLoading && !hasCanonicalBeliefs)),
    reload,
  };
}

export function useBeliefDetail(
  dashboard: DashboardPayload | null,
  beliefId: string,
  revision = 0,
) {
  const [remoteState, setRemoteState] = useState<{
    belief: BeliefDetail | null;
    id: string;
  } | null>(null);
  const fallback = useMemo(
    () =>
      dashboard
        ? deriveBeliefDetail(dashboard, beliefId)
        : undefined,
    [beliefId, dashboard],
  );

  useEffect(() => {
    if (!dashboard || !beliefId) {
      return;
    }
    const controller = new AbortController();
    void getBelief(beliefId, controller.signal)
      .then((belief) =>
        setRemoteState({
          belief: enrichBeliefDetail(belief, dashboard),
          id: beliefId,
        }),
      )
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setRemoteState({ belief: null, id: beliefId });
        }
      });
    return () => controller.abort();
  }, [beliefId, dashboard, revision]);

  const hasResolvedRemote = remoteState?.id === beliefId;
  return {
    belief: hasResolvedRemote ? (remoteState.belief ?? fallback) : fallback,
    isResolving: Boolean(dashboard && beliefId) && !hasResolvedRemote,
  };
}
