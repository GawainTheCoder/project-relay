import { useEffect, useMemo, useState } from "react";

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
    beliefs: BeliefSummary[];
    dashboard: DashboardPayload;
  } | null>(null);
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
      .then((beliefs) => setRemoteState({ beliefs, dashboard }))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          // Older Relay servers do not expose belief endpoints yet. The
          // dashboard-derived compatibility model remains fully usable.
        }
      });
    return () => controller.abort();
  }, [dashboard]);

  return remoteState?.dashboard === dashboard
    ? remoteState.beliefs
    : fallback;
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
