import {
  Boxes,
  BrainCircuit,
  Cloud,
  Cpu,
  Factory,
  Fan,
  MemoryStick,
  Network,
  RadioTower,
  Server,
} from "lucide-react";

import type {
  Company,
  LayerId,
  StackLayer,
} from "../../../shared/contracts";
import { getLayerName } from "../../lib/format";

const layerIcons: Record<LayerId, typeof Boxes> = {
  "model-labs": BrainCircuit,
  cloud: Cloud,
  accelerators: Cpu,
  memory: MemoryStick,
  networking: Network,
  optics: RadioTower,
  "power-cooling": Fan,
  serving: Server,
  manufacturing: Factory,
  "materials-builders": Boxes,
};

const ROW_HEIGHT = 74;

function getHighlightedLayerIds(layers: StackLayer[], selectedId: LayerId) {
  const highlighted = new Set<LayerId>([selectedId]);
  const visitDependencies = (layerId: LayerId) => {
    const layer = layers.find((candidate) => candidate.id === layerId);
    layer?.dependsOn.forEach((dependencyId) => {
      if (!highlighted.has(dependencyId)) {
        highlighted.add(dependencyId);
        visitDependencies(dependencyId);
      }
    });
  };
  visitDependencies(selectedId);
  layers.forEach((layer) => {
    if (layer.dependsOn.includes(selectedId)) {
      highlighted.add(layer.id);
    }
  });
  return highlighted;
}

interface DependencyMapProps {
  companies: Company[];
  layers: StackLayer[];
  onCompanySelect: (ticker: string) => void;
  onLayerSelect: (layerId: LayerId) => void;
  selectedCompanyTicker: string | null;
  selectedLayerId: LayerId;
}

export function DependencyMap({
  companies,
  layers,
  onCompanySelect,
  onLayerSelect,
  selectedCompanyTicker,
  selectedLayerId,
}: DependencyMapProps) {
  const highlighted = getHighlightedLayerIds(layers, selectedLayerId);

  return (
    <section aria-label="AI infrastructure dependency map">
      <div className="grid grid-cols-[minmax(150px,220px)_minmax(260px,1fr)] border-b border-relay-border pb-3 text-[10px] font-medium uppercase tracking-[0.09em] text-relay-muted lg:grid-cols-[minmax(170px,220px)_minmax(320px,1fr)_170px]">
        <span>Layer</span>
        <span>Watchlist exposure</span>
        <span className="hidden lg:block">Depends on</span>
      </div>

      <div className="relative">
        <div>
          {layers.map((layer) => {
            const Icon = layerIcons[layer.id];
            const isSelected = layer.id === selectedLayerId;
            const layerCompanies = layer.companyTickers
              .map((ticker) =>
                companies.find((company) => company.ticker === ticker),
              )
              .filter((company) => company !== undefined);
            return (
              <div
                className={`relative grid h-[74px] grid-cols-[minmax(150px,220px)_minmax(260px,1fr)] items-center border-b border-relay-border transition-colors lg:grid-cols-[minmax(170px,220px)_minmax(320px,1fr)_170px] ${
                  isSelected ? "bg-relay-accent/6" : ""
                }`}
                key={layer.id}
              >
                {isSelected ? (
                  <span className="absolute inset-y-2 left-0 w-0.5 bg-relay-accent" />
                ) : null}
                <button
                  className={`flex min-w-0 items-center gap-3 pl-3 pr-4 text-left text-sm font-medium transition-colors ${
                    isSelected
                      ? "text-relay-accent"
                      : "text-relay-text hover:text-relay-accent"
                  }`}
                  onClick={() => onLayerSelect(layer.id)}
                  type="button"
                >
                  <Icon
                    aria-hidden="true"
                    className="size-5 shrink-0"
                    strokeWidth={1.6}
                  />
                  <span className="truncate" title={layer.name}>
                    {getLayerName(layer.id)}
                  </span>
                </button>

                <div className="relay-scrollbar flex min-w-0 gap-2 overflow-x-auto pr-4">
                  {layerCompanies.slice(0, 4).map((company) => (
                    <button
                      className={`h-10 shrink-0 rounded border px-3 font-mono text-xs transition-colors ${
                        selectedCompanyTicker === company.ticker
                          ? "border-relay-accent bg-relay-accent/10 text-relay-accent"
                          : "border-relay-border-strong bg-relay-surface text-relay-text hover:border-relay-accent/60"
                      }`}
                      key={company.ticker}
                      onClick={() => {
                        onLayerSelect(layer.id);
                        onCompanySelect(company.ticker);
                      }}
                      type="button"
                    >
                      {company.ticker}
                    </button>
                  ))}
                  {layer.companyTickers
                    .filter(
                      (ticker) =>
                        !layerCompanies.some(
                          (company) => company.ticker === ticker,
                        ),
                    )
                    .slice(0, Math.max(0, 4 - layerCompanies.length))
                    .map((ticker) => (
                      <button
                        className={`h-10 shrink-0 rounded border px-3 font-mono text-xs transition-colors ${
                          selectedCompanyTicker === ticker
                            ? "border-relay-accent bg-relay-accent/10 text-relay-accent"
                            : "border-relay-border-strong bg-relay-surface text-relay-text hover:border-relay-accent/60"
                        }`}
                        key={ticker}
                        onClick={() => {
                          onLayerSelect(layer.id);
                          onCompanySelect(ticker);
                        }}
                        type="button"
                      >
                        {ticker}
                      </button>
                    ))}
                </div>
                <div className="hidden lg:block" aria-hidden="true" />
              </div>
            );
          })}
        </div>

        <svg
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-0 hidden h-full w-[170px] lg:block"
          preserveAspectRatio="none"
          viewBox={`0 0 170 ${layers.length * ROW_HEIGHT}`}
        >
          {layers.flatMap((layer, layerIndex) =>
            layer.dependsOn.map((dependencyId, dependencyIndex) => {
              const dependencyIndexInLayers = layers.findIndex(
                (candidate) => candidate.id === dependencyId,
              );
              if (dependencyIndexInLayers < 0) {
                return null;
              }
              const y1 = layerIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
              const y2 =
                dependencyIndexInLayers * ROW_HEIGHT + ROW_HEIGHT / 2;
              const x = 62 + dependencyIndex * 20;
              const isHighlighted =
                highlighted.has(layer.id) &&
                highlighted.has(dependencyId) &&
                (layer.id === selectedLayerId ||
                  dependencyId === selectedLayerId ||
                  highlighted.has(layer.id));
              return (
                <path
                  d={`M 14 ${y1} H ${x} V ${y2} H 14`}
                  fill="none"
                  key={`${layer.id}-${dependencyId}`}
                  opacity={isHighlighted ? 1 : 0.38}
                  stroke={isHighlighted ? "#4f8cff" : "#647286"}
                  strokeLinecap="round"
                  strokeWidth={isHighlighted ? 1.6 : 1}
                />
              );
            }),
          )}
          {layers.map((layer, index) => (
            <circle
              cx="14"
              cy={index * ROW_HEIGHT + ROW_HEIGHT / 2}
              fill={highlighted.has(layer.id) ? "#4f8cff" : "#647286"}
              key={layer.id}
              opacity={highlighted.has(layer.id) ? 1 : 0.65}
              r={highlighted.has(layer.id) ? 4.5 : 3.5}
            />
          ))}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-5 pt-5 text-xs text-relay-muted">
        <span className="inline-flex items-center gap-2">
          <span className="h-px w-6 bg-relay-accent" />
          Highlighted dependency path
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-px w-6 bg-relay-subtle" />
          Other dependencies
        </span>
      </div>
    </section>
  );
}
