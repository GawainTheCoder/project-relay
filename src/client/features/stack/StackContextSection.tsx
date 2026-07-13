import { ArrowRight, PanelRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type {
  DashboardPayload,
  LayerId,
} from "../../../shared/contracts";
import { DependencyMap } from "./DependencyMap";
import { StackInspector } from "./StackInspector";

export function StackContextSection({
  data,
}: {
  data: DashboardPayload;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const selectedLayerId =
    (searchParams.get("layer") as LayerId | null) ??
    data.layers.find((layer) => layer.id === "optics")?.id ??
    data.layers[0]?.id ??
    "accelerators";
  const selectedTicker = searchParams.get("company");
  const selectedLayer =
    data.layers.find((layer) => layer.id === selectedLayerId) ??
    data.layers[0];
  const selectedCompany =
    data.companies.find((company) => company.ticker === selectedTicker) ??
    data.companies.find((company) =>
      selectedLayer?.companyTickers.includes(company.ticker),
    ) ??
    null;

  const primaryUpdate = useMemo(
    () =>
      data.updates.find((update) => update.id === data.brief?.updateIds[0]) ??
      data.updates[0] ??
      null,
    [data],
  );

  if (!selectedLayer) {
    return null;
  }

  const setStackParameters = (parameters: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    next.set("context", "stack");
    Object.entries(parameters).forEach(([key, value]) => {
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
    });
    setSearchParams(next);
  };
  const selectLayer = (layerId: LayerId) => {
    const layer = data.layers.find((candidate) => candidate.id === layerId);
    setStackParameters({
      layer: layerId,
      company: layer?.companyTickers[0] ?? null,
    });
  };
  const selectCompany = (ticker: string) => {
    setStackParameters({ layer: selectedLayerId, company: ticker });
    setIsInspectorOpen(true);
  };

  return (
    <section
      className="border-y border-relay-border py-6"
      id="stack-context"
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-relay-muted">
            Stack context
          </p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight">
            Infrastructure dependencies
          </h2>
        </div>
        <button
          aria-label="Open stack inspector"
          className="rounded border border-relay-border bg-relay-surface p-2 text-relay-muted hover:border-relay-accent hover:text-relay-accent xl:hidden"
          onClick={() => setIsInspectorOpen(true)}
          type="button"
        >
          <PanelRight aria-hidden="true" className="size-4" />
        </button>
      </div>
      {primaryUpdate ? (
        <Link
          className="group mb-6 flex items-center justify-between gap-5 border border-relay-border bg-relay-surface px-4 py-3 transition-colors hover:border-relay-border-strong"
          to={`/signals?update=${encodeURIComponent(primaryUpdate.id)}`}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-relay-muted">
              <span className="size-1.5 rounded-full bg-relay-accent" />
              {data.brief
                ? "Today’s most material signal"
                : "Latest analyzed signal"}
            </div>
            <p className="mt-1 truncate text-sm font-medium">
              {data.brief?.signal ?? primaryUpdate.title}
            </p>
          </div>
          <ArrowRight
            aria-hidden="true"
            className="size-4 shrink-0 text-relay-accent transition-transform group-hover:translate-x-0.5"
          />
        </Link>
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_350px]">
        <div className="relay-scrollbar overflow-x-auto">
          <div className="min-w-[570px]">
            <DependencyMap
              companies={data.companies}
              layers={data.layers}
              onCompanySelect={selectCompany}
              onLayerSelect={selectLayer}
              selectedCompanyTicker={selectedCompany?.ticker ?? null}
              selectedLayerId={selectedLayerId}
            />
          </div>
        </div>
        <div className="hidden min-h-[520px] xl:block">
          <StackInspector
            company={selectedCompany}
            layer={selectedLayer}
            updates={data.updates}
          />
        </div>
      </div>

      {isInspectorOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 xl:hidden">
          <button
            aria-label="Close inspector"
            className="absolute inset-0"
            onClick={() => setIsInspectorOpen(false)}
            type="button"
          />
          <div className="relative h-full w-full max-w-[390px]">
            <StackInspector
              company={selectedCompany}
              layer={selectedLayer}
              onClose={() => setIsInspectorOpen(false)}
              updates={data.updates}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
