export interface NormalizedTrustedWebsite {
  domain: string;
  publicUrl: string;
}

export function normalizeTrustedWebsite(
  value: string,
): NormalizedTrustedWebsite | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(
      /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`,
    );
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      !url.hostname
    ) {
      return null;
    }

    url.hash = "";
    url.search = "";
    const domain = url.hostname.toLowerCase().replace(/^www\./, "");
    const publicUrl = url.toString().replace(/\/$/, "");
    return { domain, publicUrl };
  } catch {
    return null;
  }
}
