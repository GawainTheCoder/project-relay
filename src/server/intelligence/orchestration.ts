import type {
  ImportSourceInput,
  IntelligenceUpdate,
} from "../../shared/contracts.js";
import {
  ingestUrl,
  normalizeManualDocument,
  type NormalizeDocumentOptions,
  type UrlIngestionInput,
  type UrlIngestionOptions,
} from "../ingestion/index.js";
import {
  analyzeDocument,
  type AnalyzeDocumentOptions,
} from "./analyze.js";

export interface AnalyzeImportedSourceOptions {
  normalization?: NormalizeDocumentOptions;
  analysis?: AnalyzeDocumentOptions;
}

export async function analyzeImportedSource(
  input: ImportSourceInput,
  options: AnalyzeImportedSourceOptions = {},
): Promise<IntelligenceUpdate> {
  const document = normalizeManualDocument(input, options.normalization);
  return analyzeDocument(document, options.analysis);
}

export interface AnalyzeUrlSourceOptions {
  ingestion?: UrlIngestionOptions;
  analysis?: AnalyzeDocumentOptions;
}

export async function analyzeUrlSource(
  input: UrlIngestionInput,
  options: AnalyzeUrlSourceOptions = {},
): Promise<IntelligenceUpdate> {
  const document = await ingestUrl(input, options.ingestion);
  return analyzeDocument(document, options.analysis);
}
