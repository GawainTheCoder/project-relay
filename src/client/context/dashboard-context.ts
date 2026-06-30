import { createContext } from "react";

import type {
  DashboardPayload,
  ImpactReviewInput,
} from "../../shared/contracts";
import type {
  EvaluateBeliefsResult,
  RefreshSourcesResult,
} from "../lib/api";

export interface DashboardContextValue {
  data: DashboardPayload | null;
  error: string | null;
  isLoading: boolean;
  reload: () => Promise<void>;
  reviewThesisImpact: (
    impactId: string,
    input: ImpactReviewInput,
  ) => Promise<void>;
  evaluateAllBeliefs: () => Promise<EvaluateBeliefsResult>;
  refreshAllSources: () => Promise<RefreshSourcesResult>;
  regenerateBrief: () => Promise<void>;
}

export const DashboardContext =
  createContext<DashboardContextValue | null>(null);
