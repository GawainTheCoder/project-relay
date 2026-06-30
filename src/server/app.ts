import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import type {
  DailyBrief,
  ImportSourceInput,
  IntelligenceUpdate,
  SourceRefreshResult,
  ThesisEvaluation,
} from "../shared/contracts.js";

import { jsonError, validationDetails } from "./api/errors.js";
import {
  briefListQuerySchema,
  companyInputSchema,
  impactReviewInputSchema,
  importSourceInputSchema,
  researchSourceInputSchema,
  resourceIdSchema,
  searchQuerySchema,
  thesisEvaluationReviewInputSchema,
  thesisListQuerySchema,
  tickerSchema,
} from "./api/schemas.js";
import {
  createRelayRepository,
  type RelayRepository,
} from "./db/repository.js";
import { createImpactReviewRepository } from "./evaluation/index.js";
import { findSourceForUrl } from "./ingestion/source-registry.js";
import { canonicalizeUrl } from "./ingestion/normalize.js";
import { LocalSearchService } from "./search/index.js";

const MAX_API_BODY_BYTES = 1_100_000;
const DEFAULT_ALLOWED_HOSTNAMES = ["127.0.0.1", "::1", "localhost"] as const;

export interface AppServices {
  analyzeImportedSource?: (
    input: ImportSourceInput,
  ) => Promise<IntelligenceUpdate>;
  refreshSources?: () => Promise<SourceRefreshResult>;
  evaluateTheses?: () => Promise<{
    evaluatedAt: string;
    model: string;
    evaluations: ThesisEvaluation[];
  }>;
  generateBrief?: () => Promise<DailyBrief>;
}

export interface CreateAppOptions {
  repository?: RelayRepository;
  databasePath?: string;
  services?: AppServices;
  allowedHostnames?: readonly string[];
}

interface ImportSuccess {
  ok: true;
  payload: {
    documentId: string;
    duplicate: boolean;
    status: string;
    message?: string;
    update?: IntelligenceUpdate;
  };
  status: 200 | 201 | 202;
}

interface ImportFailure {
  ok: false;
  error: {
    code: string;
    message: string;
  };
  status: 409 | 502;
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
  let reviewRepository:
    | ReturnType<typeof createImpactReviewRepository>
    | undefined;
  const getReviewRepository = () => {
    reviewRepository ??= createImpactReviewRepository(
      getRepository().database,
    );
    return reviewRepository;
  };
  let searchService: LocalSearchService | undefined;
  const getSearchService = () => {
    searchService ??= new LocalSearchService(getRepository().database);
    return searchService;
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

  const standardBodyLimit = bodyLimit({
    maxSize: MAX_API_BODY_BYTES,
    onError: (context) =>
      jsonError(
        context,
        413,
        "PAYLOAD_TOO_LARGE",
        "The request body exceeds Relay's import limit.",
      ),
  });
  application.use("/api/*", standardBodyLimit);

  application.get("/api/health", (context) => {
    return context.json({
      service: "relay",
      status: "ok",
    });
  });

  application.get("/api/dashboard", (context) => {
    return context.json(getRepository().getDashboard());
  });

  application.get("/api/theses", (context) => {
    const parsedQuery = thesisListQuerySchema.safeParse({
      kind: context.req.query("kind") ?? undefined,
      status: context.req.query("status") ?? undefined,
    });
    if (!parsedQuery.success) {
      return jsonError(
        context,
        400,
        "VALIDATION_ERROR",
        "The thesis list query is invalid.",
        validationDetails(parsedQuery.error),
      );
    }
    return context.json({
      theses: getRepository().listTheses({
        status: parsedQuery.data.status,
        ...(parsedQuery.data.kind
          ? { kind: parsedQuery.data.kind }
          : {}),
      }),
    });
  });

  application.get("/api/theses/:id", (context) => {
    const parsedId = resourceIdSchema.safeParse(context.req.param("id"));
    if (!parsedId.success) {
      return jsonError(
        context,
        400,
        "VALIDATION_ERROR",
        "The thesis ID is invalid.",
        validationDetails(parsedId.error),
      );
    }
    const thesis = getRepository().getThesisDetail(parsedId.data);
    if (!thesis) {
      return jsonError(
        context,
        404,
        "THESIS_NOT_FOUND",
        "The requested thesis does not exist.",
      );
    }
    return context.json(thesis);
  });

  application.post("/api/theses/evaluate", async (context) => {
    if (!options.services?.evaluateTheses) {
      return jsonError(
        context,
        503,
        "SERVICE_UNAVAILABLE",
        "Thesis evaluation is not configured.",
      );
    }
    if (activeOperations.has("thesis-evaluation")) {
      return jsonError(
        context,
        409,
        "OPERATION_IN_PROGRESS",
        "A thesis evaluation is already running.",
      );
    }
    activeOperations.add("thesis-evaluation");
    try {
      const result = await options.services.evaluateTheses();
      return context.json(result, 201);
    } catch {
      return jsonError(
        context,
        502,
        "THESIS_EVALUATION_FAILED",
        "Relay could not evaluate theses.",
      );
    } finally {
      activeOperations.delete("thesis-evaluation");
    }
  });

  application.post(
    "/api/thesis-evaluations/:id/review",
    async (context) => {
      const parsedId = resourceIdSchema.safeParse(context.req.param("id"));
      const parsedBody = thesisEvaluationReviewInputSchema.safeParse(
        await requestJson(context),
      );
      if (!parsedId.success || !parsedBody.success) {
        return jsonError(
          context,
          400,
          "VALIDATION_ERROR",
          "The thesis evaluation review is invalid.",
          [
            ...(parsedId.success
              ? []
              : validationDetails(parsedId.error)),
            ...(parsedBody.success
              ? []
              : validationDetails(parsedBody.error)),
          ],
        );
      }
      try {
        return context.json(
          getRepository().reviewThesisEvaluation(
            parsedId.data,
            {
              decision: parsedBody.data.decision,
              ...(parsedBody.data.note
                ? { note: parsedBody.data.note }
                : {}),
            },
          ),
        );
      } catch (error) {
        if (error instanceof RangeError) {
          return jsonError(
            context,
            404,
            "THESIS_EVALUATION_NOT_FOUND",
            "The requested thesis evaluation does not exist.",
          );
        }
        if (error instanceof TypeError) {
          return jsonError(
            context,
            409,
            "THESIS_EVALUATION_CONFLICT",
            error.message,
          );
        }
        throw error;
      }
    },
  );

  application.get("/api/search", (context) => {
    const parsedQuery = searchQuerySchema.safeParse({
      q: context.req.query("q"),
      limit: context.req.query("limit") ?? undefined,
    });
    if (!parsedQuery.success) {
      return jsonError(
        context,
        400,
        "VALIDATION_ERROR",
        "Search queries must contain between 2 and 120 characters.",
        validationDetails(parsedQuery.error),
      );
    }
    return context.json({
      query: parsedQuery.data.q,
      results: getSearchService().search(parsedQuery.data.q, {
        limit: parsedQuery.data.limit,
      }),
    });
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

  application.post("/api/impacts/:id/review", async (context) => {
    const parsedId = resourceIdSchema.safeParse(context.req.param("id"));
    const parsedBody = impactReviewInputSchema.safeParse(
      await requestJson(context),
    );
    if (!parsedId.success || !parsedBody.success) {
      return jsonError(
        context,
        400,
        "VALIDATION_ERROR",
        "The impact review is invalid.",
        [
          ...(parsedId.success ? [] : validationDetails(parsedId.error)),
          ...(parsedBody.success ? [] : validationDetails(parsedBody.error)),
        ],
      );
    }
    try {
      const review = getReviewRepository().reviewImpact({
        impactId: parsedId.data,
        decision: parsedBody.data.decision,
        reasonTags: parsedBody.data.reasonTags,
        ...(parsedBody.data.note ? { note: parsedBody.data.note } : {}),
      });
      return context.json(review);
    } catch (error) {
      if (error instanceof RangeError) {
        return jsonError(
          context,
          404,
          "IMPACT_NOT_FOUND",
          "The requested thesis impact does not exist.",
        );
      }
      if (error instanceof TypeError) {
        return jsonError(
          context,
          400,
          "VALIDATION_ERROR",
          error.message,
        );
      }
      throw error;
    }
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

  application.post("/api/companies", async (context) => {
    const parsedBody = companyInputSchema.safeParse(await requestJson(context));
    if (!parsedBody.success) {
      return jsonError(
        context,
        400,
        "VALIDATION_ERROR",
        "The company thesis is invalid.",
        validationDetails(parsedBody.error),
      );
    }
    try {
      const company = getRepository().upsertCompany(parsedBody.data);
      return context.json(company, 201);
    } catch (error) {
      if (error instanceof RangeError) {
        return jsonError(
          context,
          400,
          "VALIDATION_ERROR",
          error.message,
        );
      }
      throw error;
    }
  });

  application.delete("/api/companies/:ticker", (context) => {
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
    if (!getRepository().archiveCompany(parsedTicker.data)) {
      return jsonError(
        context,
        404,
        "COMPANY_NOT_FOUND",
        "The requested company does not exist.",
      );
    }
    return context.body(null, 204);
  });

  application.post("/api/sources", async (context) => {
    const parsedBody = researchSourceInputSchema.safeParse(
      await requestJson(context),
    );
    if (!parsedBody.success) {
      return jsonError(
        context,
        400,
        "VALIDATION_ERROR",
        "The research source is invalid.",
        validationDetails(parsedBody.error),
      );
    }
    const source = getRepository().addSource(parsedBody.data);
    return context.json(source, 201);
  });

  application.get("/api/sources/:id", (context) => {
    const parsedId = resourceIdSchema.safeParse(context.req.param("id"));
    if (!parsedId.success) {
      return jsonError(
        context,
        400,
        "VALIDATION_ERROR",
        "The source ID is invalid.",
        validationDetails(parsedId.error),
      );
    }
    const source = getRepository().getSource(parsedId.data);
    if (!source) {
      return jsonError(
        context,
        404,
        "SOURCE_NOT_FOUND",
        "The requested source does not exist.",
      );
    }
    return context.json(source);
  });

  application.delete("/api/sources/:id", (context) => {
    const parsedId = resourceIdSchema.safeParse(context.req.param("id"));
    if (!parsedId.success) {
      return jsonError(
        context,
        400,
        "VALIDATION_ERROR",
        "The source ID is invalid.",
        validationDetails(parsedId.error),
      );
    }
    if (!getRepository().archiveSource(parsedId.data)) {
      return jsonError(
        context,
        404,
        "SOURCE_NOT_FOUND",
        "The requested source does not exist.",
      );
    }
    return context.body(null, 204);
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
      ...(parsedBody.data.sourceKind
        ? { sourceKind: parsedBody.data.sourceKind }
        : {}),
    };
    const result = await processImportedSource({
      activeOperations,
      input: importedInput,
      repository: getRepository(),
      ...(options.services ? { services: options.services } : {}),
    });
    if (!result.ok) {
      return jsonError(
        context,
        result.status,
        result.error.code,
        result.error.message,
      );
    }
    return context.json(result.payload, result.status);
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

  application.get("/api/briefs", (context) => {
    const parsedQuery = briefListQuerySchema.safeParse({
      limit: context.req.query("limit") ?? undefined,
    });
    if (!parsedQuery.success) {
      return jsonError(
        context,
        400,
        "VALIDATION_ERROR",
        "The brief history query is invalid.",
        validationDetails(parsedQuery.error),
      );
    }
    return context.json({
      briefs: getRepository().listBriefs(parsedQuery.data.limit),
    });
  });

  application.get("/api/briefs/:id", (context) => {
    const parsedId = resourceIdSchema.safeParse(context.req.param("id"));
    if (!parsedId.success) {
      return jsonError(
        context,
        400,
        "VALIDATION_ERROR",
        "The brief ID is invalid.",
        validationDetails(parsedId.error),
      );
    }
    const brief = getRepository().getBrief(parsedId.data);
    if (!brief) {
      return jsonError(
        context,
        404,
        "BRIEF_NOT_FOUND",
        "The requested brief does not exist.",
      );
    }
    return context.json(brief);
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

async function processImportedSource(input: {
  activeOperations: Set<string>;
  input: ImportSourceInput;
  repository: RelayRepository;
  services?: AppServices;
}): Promise<ImportSuccess | ImportFailure> {
  const document = input.repository.persistSourceDocument({
    ...input.input,
    content:
      input.input.content ??
      `URL import queued for secure retrieval: ${input.input.sourceUrl ?? ""}`,
    researchSourceId:
      (input.input.sourceUrl
        ? findSourceForUrl(input.input.sourceUrl)?.id
        : undefined) ?? "manual-imports",
  });
  if (document.duplicate && document.updateId) {
    const existingUpdate = input.repository.getUpdate(document.updateId);
    if (existingUpdate) {
      return {
        ok: true,
        payload: {
          documentId: document.id,
          duplicate: true,
          status: "analyzed",
          update: existingUpdate,
        },
        status: 200,
      };
    }
  }

  if (!input.services?.analyzeImportedSource) {
    return {
      ok: true,
      payload: {
        documentId: document.id,
        duplicate: document.duplicate,
        status: document.status,
        message:
          "The source is saved locally and is waiting for the analysis service.",
      },
      status: 202,
    };
  }

  const operationId = `source-analysis:${document.id}`;
  if (input.activeOperations.has(operationId)) {
    return {
      ok: false,
      error: {
        code: "OPERATION_IN_PROGRESS",
        message: "This source is already being analyzed.",
      },
      status: 409,
    };
  }
  input.activeOperations.add(operationId);
  try {
    const analyzedUpdate = await input.services.analyzeImportedSource(
      input.input,
    );
    const update = input.repository.persistAnalyzedUpdate(analyzedUpdate);
    input.repository.markSourceDocumentAnalyzed(document.id, update.id);
    return {
      ok: true,
      payload: {
        documentId: document.id,
        duplicate: document.duplicate,
        status: "analyzed",
        update,
      },
      status: 201,
    };
  } catch (error) {
    input.repository.markSourceDocumentError(
      document.id,
      error instanceof Error ? error.message : "Unknown analysis error",
    );
    return {
      ok: false,
      error: {
        code: "ANALYSIS_FAILED",
        message: "The source was saved, but analysis failed.",
      },
      status: 502,
    };
  } finally {
    input.activeOperations.delete(operationId);
  }
}

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
