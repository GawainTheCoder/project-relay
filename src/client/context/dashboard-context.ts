import { createContext } from "react";

import type {
  DashboardPayload,
  ImpactReviewInput,
} from "../../shared/contracts";
import type { RefreshSourcesResult } from "../lib/api";

export interface DashboardContextValue {
  data: DashboardPayload | null;
  error: string | null;
  isLoading: boolean;
  reload: () => Promise<void>;
  reviewThesisImpact: (
    impactId: string,
    input: ImpactReviewInput,
  ) => Promise<void>;
  refreshAllSources: () => Promise<RefreshSourcesResult>;
  regenerateBrief: () => Promise<void>;
}

export const DashboardContext =
  createContext<DashboardContextValue | null>(null);
