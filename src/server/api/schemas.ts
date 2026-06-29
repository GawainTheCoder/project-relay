import { z } from "zod";

import {
  impactReviewDecisions,
  impactReviewReasonTags,
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

export const importSourceInputSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    publisher: z.string().trim().min(1).max(200),
    sourceUrl: webUrlSchema.optional(),
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

export const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
