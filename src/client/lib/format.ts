import type {
  Confidence,
  LayerId,
  Materiality,
  Sentiment,
} from "../../shared/contracts";

const layerNames: Record<LayerId, string> = {
  "model-labs": "Model labs",
  cloud: "Cloud",
  accelerators: "Accelerators",
  memory: "Memory",
  networking: "Networking",
  optics: "Optics",
  "power-cooling": "Power & cooling",
  serving: "Serving",
  manufacturing: "Manufacturing",
  "materials-builders": "Materials & builders",
};

export function getLayerName(layerId: LayerId) {
  return layerNames[layerId];
}

export function formatDate(
  value: string,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  },
) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("en", options).format(date);
}

export function formatRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const difference = date.getTime() - Date.now();
  const minutes = Math.round(difference / 60_000);
  const hours = Math.round(difference / 3_600_000);
  const days = Math.round(difference / 86_400_000);

  if (Math.abs(minutes) < 60) {
    return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
      minutes,
      "minute",
    );
  }
  if (Math.abs(hours) < 24) {
    return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
      hours,
      "hour",
    );
  }
  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
    days,
    "day",
  );
}

export function titleCase(value: Sentiment | Materiality | Confidence) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function sentimentColor(sentiment: Sentiment) {
  switch (sentiment) {
    case "bullish":
      return "text-relay-positive";
    case "bearish":
      return "text-relay-negative";
    case "neutral":
      return "text-relay-warning";
    case "not-material":
      return "text-relay-muted";
  }
}

export function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}
