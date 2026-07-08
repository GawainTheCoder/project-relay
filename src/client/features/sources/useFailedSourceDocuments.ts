import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  type FailedSourceDocument,
  getFailedSourceDocuments,
} from "../../lib/api";

interface FailedSourceDocumentsState {
  documents: FailedSourceDocument[];
  error: string | null;
  isLoading: boolean;
  reload: () => Promise<void>;
}

export function useFailedSourceDocuments(): FailedSourceDocumentsState {
  const [documents, setDocuments] = useState<FailedSourceDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getFailedSourceDocuments();
      setDocuments(result.documents);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed ingestions are unavailable.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getFailedSourceDocuments(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setDocuments(result.documents);
          setError(null);
        }
      })
      .catch((caughtError: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Failed ingestions are unavailable.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });
    return () => controller.abort();
  }, []);

  return {
    documents,
    error,
    isLoading,
    reload,
  };
}
