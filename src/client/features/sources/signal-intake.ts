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
  publisher: string;
  sourceKind: SourceKind;
  sourceProfileId: string;
  sourceUrl: string;
  title: string;
}

export function buildSignalImportInput({
  content,
  mode,
  publisher,
  sourceKind,
  sourceProfileId,
  sourceUrl,
  title,
}: BuildSignalImportInputOptions): SignalImportInput {
  return {
    title,
    publisher,
    ...(mode === "url" ? { sourceUrl } : { content }),
    sourceKind,
    ...(sourceProfileId ? { sourceProfileId } : {}),
  };
}
