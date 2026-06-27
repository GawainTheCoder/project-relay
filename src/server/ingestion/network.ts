import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";

export const DEFAULT_FETCH_TIMEOUT_MS = 12_000;
export const DEFAULT_MAX_BODY_BYTES = 2_000_000;
export const DEFAULT_MAX_REDIRECTS = 3;
export const RELAY_USER_AGENT =
  "ProjectRelay/0.1 (+personal AI infrastructure research)";

export type HostResolver = (
  hostname: string,
) => Promise<Array<{ address: string; family: number }>>;

export interface SecureFetchOptions {
  fetchImpl?: typeof fetch;
  resolveHost?: HostResolver;
  timeoutMs?: number;
  maxBodyBytes?: number;
  maxRedirects?: number;
  acceptedContentTypes?: readonly string[];
}

export interface SecureFetchResult {
  body: string;
  contentType: string;
  finalUrl: string;
}

interface ResolvedRemoteTarget {
  address: string;
  family: 4 | 6;
  url: string;
}

const HTML_CONTENT_TYPES = [
  "text/html",
  "application/xhtml+xml",
  "text/plain",
] as const;

export async function secureFetchText(
  value: string,
  options: SecureFetchOptions = {},
): Promise<SecureFetchResult> {
  const resolveHost = options.resolveHost ?? defaultResolver;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const acceptedContentTypes = options.acceptedContentTypes ?? HTML_CONTENT_TYPES;
  let currentUrl = value;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const target = await resolveRemoteTarget(currentUrl, resolveHost);
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS,
    );

    try {
      const requestHeaders = {
        Accept: acceptedContentTypes.join(", "),
        "User-Agent": RELAY_USER_AGENT,
      };
      const response = options.fetchImpl
        ? await options.fetchImpl(target.url, {
            method: "GET",
            headers: requestHeaders,
            redirect: "manual",
            signal: controller.signal,
          })
        : await fetchPinnedTarget(target, requestHeaders, controller.signal);
      if (isRedirect(response.status)) {
        await discardResponse(response);
        if (redirectCount === maxRedirects) {
          throw new Error("Source exceeded the redirect limit.");
        }
        const location = response.headers.get("location");
        if (!location) {
          throw new Error("Source returned a redirect without a destination.");
        }
        currentUrl = new URL(location, target.url).toString();
        continue;
      }

      if (!response.ok) {
        await discardResponse(response);
        throw new Error(`Source request failed with HTTP ${response.status}.`);
      }

      const contentType = parseContentType(response.headers.get("content-type"));
      if (
        !contentType ||
        !acceptedContentTypes.some((accepted) => contentType === accepted)
      ) {
        await discardResponse(response);
        throw new Error(
          `Source returned an unsupported content type: ${contentType || "missing"}.`,
        );
      }

      const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
        await discardResponse(response);
        throw new Error("Source body exceeds the configured size limit.");
      }

      return {
        body: await readBoundedBody(response, maxBodyBytes),
        contentType,
        finalUrl: target.url,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error("Source request could not be completed.");
}

export async function validateRemoteUrl(
  value: string,
  resolver: HostResolver = defaultResolver,
): Promise<string> {
  return (await resolveRemoteTarget(value, resolver)).url;
}

async function resolveRemoteTarget(
  value: string,
  resolver: HostResolver,
): Promise<ResolvedRemoteTarget> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Source URL is invalid.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS source URLs are allowed.");
  }
  if (url.username || url.password) {
    throw new Error("Source URLs cannot include credentials.");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("Local source hosts are not allowed.");
  }
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("Private source hosts are not allowed.");
  }

  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await resolver(hostname);
  if (addresses.length === 0) {
    throw new Error("Source host did not resolve.");
  }
  const normalizedAddresses = addresses.map(({ address, family }) => {
    const normalizedAddress = address
      .toLowerCase()
      .replace(/^\[|\]$/g, "");
    const detectedFamily = isIP(normalizedAddress);
    if (
      (detectedFamily !== 4 && detectedFamily !== 6) ||
      family !== detectedFamily
    ) {
      throw new Error("Source host returned an invalid address.");
    }
    return {
      address: normalizedAddress,
      family: detectedFamily as 4 | 6,
    };
  });
  if (
    normalizedAddresses.some(({ address }) =>
      isPrivateOrReservedIp(address),
    )
  ) {
    throw new Error("Source host resolves to a private or reserved address.");
  }

  const selected = normalizedAddresses[0];
  if (!selected) {
    throw new Error("Source host did not resolve.");
  }
  return {
    address: selected.address,
    family: selected.family,
    url: url.toString(),
  };
}

export function isPrivateOrReservedIp(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  const family = isIP(normalized);
  if (family === 4) {
    const parts = normalized.split(".").map(Number);
    const first = parts[0] ?? 0;
    const second = parts[1] ?? 0;
    const third = parts[2] ?? 0;
    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 0 && (third === 0 || third === 2)) ||
      (first === 192 && second === 88 && third === 99) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19)) ||
      (first === 198 && second === 51 && third === 100) ||
      (first === 203 && second === 0 && third === 113) ||
      first >= 224
    );
  }
  if (family !== 6) {
    return true;
  }

  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    return isIP(mapped) === 4 ? isPrivateOrReservedIp(mapped) : true;
  }
  const dottedSuffix = normalized.slice(normalized.lastIndexOf(":") + 1);
  if (isIP(dottedSuffix) === 4 && isPrivateOrReservedIp(dottedSuffix)) {
    return true;
  }

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    /^fe[c-f]/.test(normalized) ||
    normalized.startsWith("ff") ||
    normalized.startsWith("100:") ||
    normalized.startsWith("64:ff9b:") ||
    normalized.startsWith("2001:0:") ||
    normalized.startsWith("2001:db8:") ||
    normalized.startsWith("2001:10:") ||
    normalized.startsWith("2002:")
  );
}

async function defaultResolver(
  hostname: string,
): Promise<Array<{ address: string; family: number }>> {
  return lookup(hostname, { all: true, verbatim: true });
}

async function fetchPinnedTarget(
  target: ResolvedRemoteTarget,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<Response> {
  const url = new URL(target.url);
  const requestOptions = {
    family: target.family,
    headers: {
      ...headers,
      Host: url.host,
    },
    hostname: target.address,
    method: "GET",
    path: `${url.pathname}${url.search}`,
    port: url.port || undefined,
    signal,
  };

  return new Promise<Response>((resolve, reject) => {
    const onResponse = (incoming: import("node:http").IncomingMessage) => {
      const status = incoming.statusCode ?? 500;
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) {
          value.forEach((item) => responseHeaders.append(name, item));
        } else if (value !== undefined) {
          responseHeaders.set(name, value);
        }
      }

      resolve(
        new Response(
          [204, 205, 304].includes(status)
            ? null
            : (Readable.toWeb(incoming) as ReadableStream<Uint8Array>),
          {
            headers: responseHeaders,
            status,
            ...(incoming.statusMessage
              ? { statusText: incoming.statusMessage }
              : {}),
          },
        ),
      );
    };

    const request =
      url.protocol === "https:"
        ? httpsRequest(
            {
              ...requestOptions,
              ...(isIP(url.hostname)
                ? {}
                : { servername: url.hostname }),
            },
            onResponse,
          )
        : httpRequest(requestOptions, onResponse);
    request.once("error", reject);
    request.end();
  });
}

async function readBoundedBody(
  response: Response,
  maxBodyBytes: number,
): Promise<string> {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    totalBytes += value.byteLength;
    if (totalBytes > maxBodyBytes) {
      await reader.cancel();
      throw new Error("Source body exceeds the configured size limit.");
    }
    body += decoder.decode(value, { stream: true });
  }
  body += decoder.decode();
  return body;
}

async function discardResponse(response: Response): Promise<void> {
  if (!response.body || response.body.locked) {
    return;
  }
  try {
    await response.body.cancel();
  } catch {
    // The response is already being discarded. Preserve the primary fetch error.
  }
}

function parseContentType(value: string | null): string {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}
