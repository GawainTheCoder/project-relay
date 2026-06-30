import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  DashboardPayload,
  ImpactReviewInput,
} from "../../shared/contracts";
import {
  evaluateBeliefs,
  generateBrief,
  getDashboard,
  refreshSources,
  reviewImpact,
} from "../lib/api";
import { DashboardContext } from "./dashboard-context";

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadDashboard = useCallback(async (signal?: AbortSignal) => {
    setError(null);
    try {
      const dashboard = await getDashboard(signal);
      setData(dashboard);
    } catch (caughtError) {
      if (
        caughtError instanceof DOMException &&
        caughtError.name === "AbortError"
      ) {
        return;
      }
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Relay could not load the dashboard.",
      );
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadDashboard(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadDashboard]);

  const reload = useCallback(async () => {
    setIsLoading(true);
    await loadDashboard();
  }, [loadDashboard]);

  const reviewThesisImpact = useCallback(
    async (impactId: string, input: ImpactReviewInput) => {
      const review = await reviewImpact(impactId, input);
      setData((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          updates: current.updates.map((update) => ({
            ...update,
            thesisImpacts: update.thesisImpacts.map((impact) =>
              impact.id === impactId ? { ...impact, review } : impact,
            ),
          })),
        };
      });
    },
    [],
  );

  const refreshAllSources = useCallback(async () => {
    const result = await refreshSources();
    await loadDashboard();
    return result;
  }, [loadDashboard]);

  const evaluateAllBeliefs = useCallback(async () => {
    const result = await evaluateBeliefs();
    await loadDashboard();
    return result;
  }, [loadDashboard]);

  const regenerateBrief = useCallback(async () => {
    const brief = await generateBrief();
    setData((current) => (current ? { ...current, brief } : current));
  }, []);

  const value = useMemo(
    () => ({
      data,
      error,
      evaluateAllBeliefs,
      isLoading,
      reload,
      reviewThesisImpact,
      refreshAllSources,
      regenerateBrief,
    }),
    [
      data,
      reviewThesisImpact,
      error,
      evaluateAllBeliefs,
      isLoading,
      regenerateBrief,
      reload,
      refreshAllSources,
    ],
  );

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}
