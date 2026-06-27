import type { Context } from "hono";
import type { ZodError } from "zod";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function jsonError(
  context: Context,
  status: 400 | 403 | 404 | 409 | 413 | 500 | 502 | 503,
  code: string,
  message: string,
  details?: unknown,
): Response {
  const body: ApiErrorBody = {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
    },
  };
  return context.json(body, status);
}

export function validationDetails(
  error: ZodError,
): Array<{ code: string; message: string; path: PropertyKey[] }> {
  return error.issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issue.path,
  }));
}
