import type {
  ImportSourceInput,
  SourceKind,
} from "../../../shared/contracts";

export type SignalIntakeMode = "url" | "excerpt";

export interface SignalImportInput extends ImportSourceInput {
  sourceProfileId?: string;
}

interface BuildSignalImportInputOptions {
  content: string;
  mode: SignalIntakeMode;
  publishedAt?: string;
  publisher: string;
  sourceKind: SourceKind;
  sourceProfileId: string;
  sourceUrl: string;
  title: string;
}

export function buildSignalImportInput({
  content,
  mode,
  publishedAt,
  publisher,
  sourceKind,
  sourceProfileId,
  sourceUrl,
  title,
}: BuildSignalImportInputOptions): SignalImportInput {
  return {
    title,
    publisher,
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(publishedAt
      ? { publishedAt: `${publishedAt}T00:00:00.000Z` }
      : {}),
    ...(mode === "excerpt" ? { content } : {}),
    sourceKind,
    ...(sourceProfileId ? { sourceProfileId } : {}),
  };
}
