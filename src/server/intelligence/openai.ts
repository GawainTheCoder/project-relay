import OpenAI from "openai";

import {
  IntelligenceConfigurationError,
  IntelligenceRefusalError,
  IntelligenceResponseError,
} from "./errors.js";

export interface OpenAIRequestOptions {
  client?: OpenAI;
}

export function resolveOpenAIClient(client?: OpenAI): OpenAI {
  if (client) {
    return client;
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new IntelligenceConfigurationError(
      "OPENAI_API_KEY is required to run intelligence analysis.",
    );
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY.trim(),
    maxRetries: 1,
    timeout: 90_000,
  });
}

export function requireParsedOutput<T>(
  response: unknown,
  parsed: T | null | undefined,
): T {
  if (parsed !== null && parsed !== undefined) {
    return parsed;
  }

  const refusal = findRefusal(response);
  if (refusal) {
    throw new IntelligenceRefusalError(refusal);
  }

  throw new IntelligenceResponseError(
    "The model returned no structured intelligence result.",
  );
}

export function toSafeIntelligenceError(
  error: unknown,
  operation: string,
): Error {
  if (
    error instanceof IntelligenceConfigurationError ||
    error instanceof IntelligenceRefusalError ||
    error instanceof IntelligenceResponseError
  ) {
    return error;
  }

  if (error instanceof OpenAI.APIError) {
    const status = error.status ? ` (HTTP ${error.status})` : "";
    return new IntelligenceResponseError(
      `OpenAI ${operation} failed${status}.`,
      { cause: error },
    );
  }

  return new IntelligenceResponseError(`OpenAI ${operation} failed.`, {
    cause: error,
  });
}

function findRefusal(value: unknown): string | null {
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    if (typeof record.refusal === "string" && record.refusal.trim()) {
      return record.refusal;
    }

    for (const nested of Object.values(record)) {
      const result = findRefusal(nested);
      if (result) {
        return result;
      }
    }
  }

  if (Array.isArray(value)) {
    for (const nested of value) {
      const result = findRefusal(nested);
      if (result) {
        return result;
      }
    }
  }

  return null;
}
