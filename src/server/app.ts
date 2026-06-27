import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import type {
  DailyBrief,
  ImportSourceInput,
  IntelligenceUpdate,
} from "../shared/contracts.js";

import { jsonError, validationDetails } from "./api/errors.js";
import {
  decisionInputSchema,
  importSourceInputSchema,
  resourceIdSchema,
  tickerSchema,
} from "./api/schemas.js";
import {
  createRelayRepository,
  type RelayRepository,
} from "./db/repository.js";
import { canonicalizeUrl } from "./ingestion/normalize.js";

const MAX_API_BODY_BYTES = 1_100_000;
const DEFAULT_ALLOWED_HOSTNAMES = ["127.0.0.1", "::1", "localhost"] as const;

export interface AppServices {
  analyzeImportedSource?: (
    input: ImportSourceInput,
  ) => Promise<IntelligenceUpdate>;
  refreshSources?: () => Promise<{
    imported: number;
    analyzed: number;
    errors: string[];
  }>;
  generateBrief?: () => Promise<DailyBrief>;
}

export interface CreateAppOptions {
  repository?: RelayRepository;
  databasePath?: string;
  services?: AppServices;
  allowedHostnames?: readonly string[];
}

async function requestJson(context: {
  req: { json: () => Promise<unknown> };
}): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    return null;
  }
}

export function createApp(options: CreateAppOptions = {}): Hono {
  const application = new Hono();
  const activeOperations = new Set<string>();
  const allowedHostnames = new Set(
    options.allowedHostnames ??
      process.env.RELAY_ALLOWED_HOSTS?.split(",")
        .map((host) => host.trim())
        .filter(Boolean) ??
      DEFAULT_ALLOWED_HOSTNAMES,
  );
  const normalizedAllowedHostnames = new Set(
    [...allowedHostnames].map(normalizeHostname),
  );
  let defaultRepository: RelayRepository | undefined;
  const getRepository = (): RelayRepository => {
    if (options.repository) {
      return options.repository;
    }
    defaultRepository ??= createRelayRepository(options.databasePath);
    return defaultRepository;
  };

  application.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: {
        baseUri: ["'self'"],
        childSrc: ["'none'"],
        connectSrc: ["'self'"],
        defaultSrc: ["'self'"],
        fontSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        frameSrc: ["'none'"],
        imgSrc: ["'self'", "data:"],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        workerSrc: ["'self'"],
      },
      permissionsPolicy: {
        camera: [],
        geolocation: [],
        microphone: [],
      },
      referrerPolicy: "no-referrer",
      strictTransportSecurity: "max-age=31536000; includeSubDomains",
      xFrameOptions: "DENY",
    }),
  );

  application.use("/api/*", async (context, next) => {
    const hostname = normalizeHostname(new URL(context.req.url).hostname);
    if (!normalizedAllowedHostnames.has(hostname)) {
      return jsonError(
        context,
        403,
        "HOST_NOT_ALLOWED",
        "The request host is not allowed.",
      );
    }

    if (!["GET", "HEAD", "OPTIONS"].includes(context.req.method)) {
      const origin = context.req.header("origin");
      const fetchSite = context.req.header("sec-fetch-site");
      if (
        fetchSite === "cross-site" ||
        (origin && !hasSameHostname(origin, context.req.url))
      ) {
        return jsonError(
          context,
          403,
          "CROSS_SITE_REQUEST",
          "Cross-site write requests are not allowed.",
        );
      }
    }

    await next();
    context.header("Cache-Control", "no-store");
  });

  application.use(
    "/api/*",
    bodyLimit({
      maxSize: MAX_API_BODY_BYTES,
      onError: (context) =>
        jsonError(
          context,
          413,
          "PAYLOAD_TOO_LARGE",
          "The request body exceeds Relay's import limit.",
        ),
    }),
  );

  application.get("/api/health", (context) => {
    return context.json({
      service: "relay",
      status: "ok",
    });
  });

  application.get("/api/dashboard", (context) => {
    return context.json(getRepository().getDashboard());
  });

  application.get("/api/updates/:id", (context) => {
    const parsedId = resourceIdSchema.safeParse(context.req.param("id"));
    if (!parsedId.success) {
      return jsonError(
        context,
        400,
        "VALIDATION_ERROR",
        "The update ID is invalid.",
        validationDetails(parsedId.error),
      );
    }
    const update = getRepository().getUpdate(parsedId.data);
    if (!update) {
      return jsonError(
        context,
        404,
        "UPDATE_NOT_FOUND",
        "The requested update does not exist.",
      );
    }
    return context.json(update);
  });

  application.post("/api/updates/:id/decision", async (context) => {
    const parsedId = resourceIdSchema.safeParse(context.req.param("id"));
    const parsedBody = decisionInputSchema.safeParse(await requestJson(context));
    if (!parsedId.success || !parsedBody.success) {
      return jsonError(
        context,
        400,
        "VALIDATION_ERROR",
        "The review decision is invalid.",
        [
          ...(parsedId.success ? [] : validationDetails(parsedId.error)),
          ...(parsedBody.success ? [] : validationDetails(parsedBody.error)),
        ],
      );
    }
    const update = getRepository().decideUpdate(
      parsedId.data,
      parsedBody.data.decision,
    );
    if (!update) {
      return jsonError(
        context,
        404,
        "UPDATE_NOT_FOUND",
        "The requested update does not exist.",
      );
    }
    return context.json(update);
  });

  application.get("/api/companies/:ticker", (context) => {
    const parsedTicker = tickerSchema.safeParse(context.req.param("ticker"));
    if (!parsedTicker.success) {
      return jsonError(
        context,
        400,
        "VALIDATION_ERROR",
        "The company ticker is invalid.",
        validationDetails(parsedTicker.error),
      );
    }
    const company = getRepository().getCompany(parsedTicker.data);
    if (!company) {
      return jsonError(
        context,
        404,
        "COMPANY_NOT_FOUND",
        "The requested company does not exist.",
      );
    }
    return context.json(company);
  });

  application.post("/api/sources/import", async (context) => {
    const parsedBody = importSourceInputSchema.safeParse(
      await requestJson(context),
    );
    if (!parsedBody.success) {
      return jsonError(
        context,
        400,
        "VALIDATION_ERROR",
        "The source document is invalid.",
        validationDetails(parsedBody.error),
      );
    }

    const importedInput: ImportSourceInput = {
      title: parsedBody.data.title,
      publisher: parsedBody.data.publisher,
      ...(parsedBody.data.sourceUrl
        ? { sourceUrl: canonicalizeUrl(parsedBody.data.sourceUrl) }
        : {}),
      ...(parsedBody.data.publishedAt
        ? { publishedAt: parsedBody.data.publishedAt }
        : {}),
      ...(parsedBody.data.content ? { content: parsedBody.data.content } : {}),
    };
    const repository = getRepository();
    const document = repository.persistSourceDocument({
      ...importedInput,
      content:
        importedInput.content ??
        `URL import queued for secure retrieval: ${importedInput.sourceUrl ?? ""}`,
    });
    if (document.duplicate && document.updateId) {
      const existingUpdate = repository.getUpdate(document.updateId);
      if (existingUpdate) {
        return context.json({
          documentId: document.id,
          duplicate: true,
          status: "analyzed",
          update: existingUpdate,
        });
      }
    }

    if (!options.services?.analyzeImportedSource) {
      return context.json(
        {
          documentId: document.id,
          duplicate: document.duplicate,
          status: document.status,
          message:
            "The source is saved locally and is waiting for the analysis service.",
        },
        202,
      );
    }

    const operationId = `source-analysis:${document.id}`;
    if (activeOperations.has(operationId)) {
      return jsonError(
        context,
        409,
        "OPERATION_IN_PROGRESS",
        "This source is already being analyzed.",
      );
    }
    activeOperations.add(operationId);
    try {
      const analyzedUpdate =
        await options.services.analyzeImportedSource(importedInput);
      const update = repository.persistAnalyzedUpdate(analyzedUpdate);
      repository.markSourceDocumentAnalyzed(document.id, update.id);
      return context.json(
        {
          documentId: document.id,
          duplicate: document.duplicate,
          status: "analyzed",
          update,
        },
        201,
      );
    } catch (error) {
      repository.markSourceDocumentError(
        document.id,
        error instanceof Error ? error.message : "Unknown analysis error",
      );
      return jsonError(
        context,
        502,
        "ANALYSIS_FAILED",
        "The source was saved, but analysis failed.",
      );
    } finally {
      activeOperations.delete(operationId);
    }
  });

  application.post("/api/sources/refresh", async (context) => {
    if (!options.services?.refreshSources) {
      return jsonError(
        context,
        503,
        "SERVICE_UNAVAILABLE",
        "Source refresh is not configured.",
      );
    }
    if (activeOperations.has("source-refresh")) {
      return jsonError(
        context,
        409,
        "OPERATION_IN_PROGRESS",
        "A source refresh is already running.",
      );
    }
    activeOperations.add("source-refresh");
    try {
      const result = await options.services.refreshSources();
      return context.json(result);
    } finally {
      activeOperations.delete("source-refresh");
    }
  });

  application.post("/api/briefs/generate", async (context) => {
    if (!options.services?.generateBrief) {
      return jsonError(
        context,
        503,
        "SERVICE_UNAVAILABLE",
        "Daily brief generation is not configured.",
      );
    }
    if (activeOperations.has("brief-generation")) {
      return jsonError(
        context,
        409,
        "OPERATION_IN_PROGRESS",
        "Daily brief generation is already running.",
      );
    }
    activeOperations.add("brief-generation");
    try {
      const generated = await options.services.generateBrief();
      const brief = getRepository().persistDailyBrief(generated);
      return context.json(brief, 201);
    } finally {
      activeOperations.delete("brief-generation");
    }
  });

  application.notFound((context) => {
    if (context.req.path.startsWith("/api/")) {
      return jsonError(
        context,
        404,
        "ROUTE_NOT_FOUND",
        "The requested API route does not exist.",
      );
    }
    return context.text("Not found", 404);
  });

  application.onError((error, context) => {
    console.error("Relay request failed", {
      method: context.req.method,
      name: error.name,
      path: context.req.path,
    });
    return jsonError(
      context,
      500,
      "INTERNAL_ERROR",
      "Relay could not complete the request.",
    );
  });

  return application;
}

export const app = createApp();

function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/^\[|\]$/g, "");
}

function hasSameHostname(origin: string, requestUrl: string): boolean {
  try {
    return (
      normalizeHostname(new URL(origin).hostname) ===
      normalizeHostname(new URL(requestUrl).hostname)
    );
  } catch {
    return false;
  }
}
