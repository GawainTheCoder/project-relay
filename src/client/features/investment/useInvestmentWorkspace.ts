import { useCallback, useEffect, useState } from "react";

import type {
  PortfolioReadModel,
  ReviewsReadModel,
} from "../../../shared/contracts";
import { getPortfolio, getReviews } from "../../lib/api";

interface InvestmentWorkspaceErrors {
  portfolio: string | null;
  reviews: string | null;
}

export interface InvestmentWorkspaceState {
  errors: InvestmentWorkspaceErrors;
  isLoading: boolean;
  portfolio: PortfolioReadModel | null;
  reload: () => Promise<void>;
  reviews: ReviewsReadModel | null;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useInvestmentWorkspace(): InvestmentWorkspaceState {
  const [portfolio, setPortfolio] = useState<PortfolioReadModel | null>(null);
  const [reviews, setReviews] = useState<ReviewsReadModel | null>(null);
  const [errors, setErrors] = useState<InvestmentWorkspaceErrors>({
    portfolio: null,
    reviews: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async (signal?: AbortSignal) => {
    setErrors({ portfolio: null, reviews: null });
    const [portfolioResult, reviewsResult] = await Promise.allSettled([
      getPortfolio(signal),
      getReviews(signal),
    ]);
    if (signal?.aborted) {
      return;
    }
    if (portfolioResult.status === "fulfilled") {
      setPortfolio(portfolioResult.value);
    } else {
      setErrors((current) => ({
        ...current,
        portfolio: errorMessage(
          portfolioResult.reason,
          "Portfolio data is unavailable.",
        ),
      }));
    }
    if (reviewsResult.status === "fulfilled") {
      setReviews(reviewsResult.value);
    } else {
      setErrors((current) => ({
        ...current,
        reviews: errorMessage(
          reviewsResult.reason,
          "Review data is unavailable.",
        ),
      }));
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void load(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  const reload = useCallback(async () => {
    setIsLoading(true);
    await load();
  }, [load]);

  return { errors, isLoading, portfolio, reload, reviews };
}
