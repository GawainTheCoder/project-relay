export function legacyDashboardRedirect(search: string): string | null {
  const parameters = new URLSearchParams(search);

  if (parameters.get("archive") === "briefs" || parameters.has("brief")) {
    return `/today${search}`;
  }

  return null;
}
