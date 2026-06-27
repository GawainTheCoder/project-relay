import { z } from "zod";

import { layerIds } from "../../shared/contracts.js";

const sentimentSchema = z.enum([
  "bullish",
  "bearish",
  "neutral",
  "not-material",
]);
const materialitySchema = z.enum(["high", "medium", "low", "not-material"]);
const confidenceSchema = z.enum(["high", "medium", "low"]);
const layerIdSchema = z.enum(layerIds);
const shortTextSchema = z.string().trim().min(1).max(500);
const analysisTextSchema = z.string().trim().min(1).max(4_000);
export const MIN_EVIDENCE_QUOTE_CHARS = 20;

export const analysisOutputSchema = z
  .object({
    layerIds: z.array(layerIdSchema).max(layerIds.length),
    companyTickers: z.array(z.string().trim().min(1).max(24)).max(30),
    materiality: materialitySchema,
    sentiment: sentimentSchema,
    groundedSummary: analysisTextSchema,
    inference: z
      .object({
        whyItMatters: analysisTextSchema,
        beneficiaries: z.array(shortTextSchema).max(20),
        threatened: z.array(shortTextSchema).max(20),
        watchNext: z.array(shortTextSchema).max(20),
      })
      .strict(),
    claims: z
      .array(
        z
          .object({
            quote: z
              .string()
              .trim()
              .min(MIN_EVIDENCE_QUOTE_CHARS)
              .max(1_500),
            locator: z.string().trim().min(1).max(50),
          })
          .strict(),
      )
      .max(24),
    thesisImpacts: z
      .array(
        z
          .object({
            companyTicker: z.string().trim().min(1).max(24),
            direction: sentimentSchema,
            summary: z.string().trim().min(1).max(1_500),
            confidence: confidenceSchema,
            horizon: z.string().trim().min(1).max(100),
          })
          .strict(),
      )
      .max(24),
  })
  .strict();

export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;

export const dailyBriefOutputSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    summary: z.string().trim().min(1).max(4_000),
    signal: z.string().trim().min(1).max(2_000),
    secondarySignals: z.array(shortTextSchema).max(8),
    updateIds: z.array(z.string().trim().min(1).max(128)).max(30),
    citationClaimIds: z.array(z.string().trim().min(1).max(128)).max(60),
  })
  .strict();

export type DailyBriefOutput = z.infer<typeof dailyBriefOutputSchema>;
