export function legacyDashboardRedirect(search: string): string | null {
  const parameters = new URLSearchParams(search);

  if (parameters.has("brief")) {
    parameters.set("archive", "briefs");
    return `/today?${parameters.toString()}`;
  }

  if (parameters.get("archive") === "briefs") {
    return `/today${search}`;
  }

  return null;
}
