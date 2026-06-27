import { createContext } from "react";

import type {
  DashboardPayload,
  ReviewDecision,
} from "../../shared/contracts";
import type { RefreshSourcesResult } from "../lib/api";

export interface DashboardContextValue {
  data: DashboardPayload | null;
  error: string | null;
  isLoading: boolean;
  reload: () => Promise<void>;
  decideImpact: (
    updateId: string,
    decision: Exclude<ReviewDecision, "proposed">,
  ) => Promise<void>;
  refreshAllSources: () => Promise<RefreshSourcesResult>;
  regenerateBrief: () => Promise<void>;
}

export const DashboardContext =
  createContext<DashboardContextValue | null>(null);
