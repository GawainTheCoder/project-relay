const DISABLED_VALUES = new Set(["0", "false", "no", "off"]);
const MAX_METADATA_VALUE_LENGTH = 512;

export type RelayOpenAIOperation = "daily_brief" | "signal_analysis";

export function shouldStoreOpenAIResponses(
  configuredValue = process.env.OPENAI_STORE_RESPONSES,
): boolean {
  if (configuredValue === undefined) {
    return true;
  }
  return !DISABLED_VALUES.has(configuredValue.trim().toLowerCase());
}

export function buildOpenAIResponseMetadata(
  operation: RelayOpenAIOperation,
  fields: Readonly<Record<string, number | string | null | undefined>> = {},
): Record<string, string> {
  const metadata: Record<string, string> = {
    relay_app: "project-relay",
    relay_environment: metadataValue(
      process.env.NODE_ENV?.trim() || "development",
    ),
    relay_operation: operation,
    relay_schema_version: "thesis-aware-v1",
  };

  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) {
      continue;
    }
    metadata[key] = metadataValue(String(value));
  }
  return metadata;
}

function metadataValue(value: string): string {
  return value
    .replace(/\p{Cc}+/gu, " ")
    .trim()
    .slice(0, MAX_METADATA_VALUE_LENGTH);
}
