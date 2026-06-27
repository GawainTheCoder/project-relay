import type { ResearchSource } from "../../shared/contracts.js";

export interface SourceParagraph {
  locator: string;
  text: string;
}

export interface NormalizedDocument {
  id: string;
  sourceType: ResearchSource["type"];
  title: string;
  publisher: string;
  sourceUrl: string | null;
  publishedAt: string;
  ingestedAt: string;
  content: string;
  paragraphs: SourceParagraph[];
}

export interface RssEntry {
  externalId: string;
  title: string;
  publisher: string;
  sourceUrl: string;
  publishedAt: string;
  content: string;
}

export interface PublicSourceDefinition {
  id: string;
  name: string;
  type: Extract<ResearchSource["type"], "rss" | "paper" | "release">;
  url: string;
  enabledByDefault: boolean;
}
