import { z } from "zod";

import {
  impactReviewDecisions,
  impactReviewReasonTags,
  layerIds,
  thesisEvaluationReviewStatuses,
  thesisKinds,
  thesisStatuses,
} from "../../shared/contracts.js";
import { MAX_MANUAL_DOCUMENT_CHARS } from "../ingestion/normalize.js";

const webUrlSchema = z
  .url()
  .max(2_048)
  .refine((value) => {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
    );
  }, "Use an HTTP or HTTPS URL without embedded credentials.");

export const resourceIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

export const tickerSchema = z
  .string()
  .min(1)
  .max(12)
  .regex(/^[A-Za-z][A-Za-z0-9.-]*$/)
  .transform((value) => value.toUpperCase());

const thesisListSchema = z.array(z.string().trim().min(1).max(500)).max(20);

export const companyInputSchema = z
  .object({
    ticker: tickerSchema,
    name: z.string().trim().min(1).max(120),
    layerIds: z.array(z.enum(layerIds)).max(layerIds.length).default([]),
    description: z.string().trim().max(2_000).default(""),
    thesis: z.string().trim().min(1).max(4_000),
    whyItMatters: z.string().trim().max(2_000).default(""),
    provesRight: thesisListSchema.default([]),
    breaksThesis: thesisListSchema.default([]),
    watchMetrics: thesisListSchema.default([]),
    confidence: z.enum(["high", "medium", "low"]).default("medium"),
  })
  .strict();

export const researchSourceInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    type: z.enum(["rss", "paper", "release"]),
    url: webUrlSchema,
    enabled: z.boolean().default(true),
    layerIds: z.array(z.enum(layerIds)).max(layerIds.length).default([]),
    companyTickers: z.array(tickerSchema).max(50).default([]),
  })
  .strict();

export const sourceProfileInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    domain: z
      .string()
      .trim()
      .toLowerCase()
      .regex(
        /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/,
        "Use a bare public domain such as example.com.",
      ),
    publicUrl: webUrlSchema,
    role: z.enum(["primary", "context"]),
    authorityTier: z.enum(["first-party", "specialist", "context"]),
    layerIds: z.array(z.enum(layerIds)).max(layerIds.length).default([]),
    companyTickers: z.array(tickerSchema).max(50).default([]),
    thesisIds: z.array(resourceIdSchema).max(50).default([]),
  })
  .strict();

export const briefListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const thesisListQuerySchema = z
  .object({
    kind: z.enum(thesisKinds).optional(),
    status: z.union([z.enum(thesisStatuses), z.literal("all")]).default("active"),
  })
  .strict();

export const importSourceInputSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    publisher: z.string().trim().min(1).max(200),
    sourceUrl: webUrlSchema.optional(),
    sourceProfileId: resourceIdSchema.optional(),
    publishedAt: z.iso.datetime({ offset: true }).optional(),
    sourceKind: z
      .enum([
        "earnings-release",
        "transcript",
        "paper",
        "technical",
        "other",
      ])
      .optional(),
    content: z
      .string()
      .trim()
      .min(20)
      .max(MAX_MANUAL_DOCUMENT_CHARS)
      .optional(),
  })
  .strict()
  .refine((value) => value.content || value.sourceUrl, {
    message: "Provide pasted source content or a source URL.",
    path: ["content"],
  });

export const impactReviewInputSchema = z
  .object({
    decision: z.enum(impactReviewDecisions),
    reasonTags: z.array(z.enum(impactReviewReasonTags)).min(1).max(7),
    note: z.string().trim().max(2_000).optional(),
  })
  .strict()
  .refine(
    (value) =>
      !value.reasonTags.includes("other") || Boolean(value.note?.trim()),
    {
      message: "Add a note when the review reason is other.",
      path: ["note"],
    },
  );

export const thesisEvaluationReviewInputSchema = z
  .object({
    decision: z.enum(
      thesisEvaluationReviewStatuses.filter(
        (status) => status !== "pending",
      ) as ["accepted", "rejected", "deferred"],
    ),
    note: z.string().trim().max(2_000).optional(),
  })
  .strict();

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
