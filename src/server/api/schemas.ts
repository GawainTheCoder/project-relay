import { z } from "zod";

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

export const decisionInputSchema = z
  .object({
    decision: z.enum(["accepted", "rejected"]),
  })
  .strict();

export const importSourceInputSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    publisher: z.string().trim().min(1).max(200),
    sourceUrl: webUrlSchema.optional(),
    publishedAt: z.iso.datetime({ offset: true }).optional(),
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
