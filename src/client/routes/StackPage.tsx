import { ArrowRight, PanelRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { LayerId } from "../../shared/contracts";
import { PageError, PageLoading } from "../components/ui/AsyncState";
import { useDashboard } from "../context/useDashboard";
import { DependencyMap } from "../features/stack/DependencyMap";
import { StackInspector } from "../features/stack/StackInspector";

export function StackPage() {
  const { data, error, isLoading, reload } = useDashboard();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);

  const selectedLayerId =
    (searchParams.get("layer") as LayerId | null) ??
    data?.layers.find((layer) => layer.id === "optics")?.id ??
    data?.layers[0]?.id ??
    "accelerators";
  const selectedTicker = searchParams.get("company");

  const selectedLayer = data?.layers.find(
    (layer) => layer.id === selectedLayerId,
  );
  const selectedCompany =
    data?.companies.find((company) => company.ticker === selectedTicker) ??
    data?.companies.find((company) =>
      selectedLayer?.companyTickers.includes(company.ticker),
    ) ??
    null;

  const primaryUpdate = useMemo(() => {
    if (!data) {
      return null;
    }
    return (
      data.updates.find(
        (update) => update.id === data.brief?.updateIds[0],
      ) ??
      data.updates[0] ??
      null
    );
  }, [data]);

  useEffect(() => {
    if (!data || searchParams.get("layer")) {
      return;
    }
    const initialLayer =
      data.layers.find((layer) => layer.id === "optics") ?? data.layers[0];
    if (initialLayer) {
      setSearchParams(
        {
          layer: initialLayer.id,
          ...(initialLayer.companyTickers[0]
            ? { company: initialLayer.companyTickers[0] }
            : {}),
        },
        { replace: true },
      );
    }
  }, [data, searchParams, setSearchParams]);

  if (isLoading) {
    return <PageLoading label="Mapping infrastructure dependencies" />;
  }
  if (error || !data || !selectedLayer) {
    return (
      <PageError
        error={error ?? "The stack map is unavailable."}
        onRetry={() => void reload()}
      />
    );
  }

  const selectLayer = (layerId: LayerId) => {
    const layer = data.layers.find((candidate) => candidate.id === layerId);
    setSearchParams({
      layer: layerId,
      ...(layer?.companyTickers[0]
        ? { company: layer.companyTickers[0] }
        : {}),
    });
  };
  const selectCompany = (ticker: string) => {
    setSearchParams({ layer: selectedLayerId, company: ticker });
    setIsInspectorOpen(true);
  };

  return (
    <div className="relay-enter min-h-screen">
      <header className="border-b border-relay-border px-5 py-5 sm:px-8 lg:px-10">
        <div className="mx-auto flex max-w-[1500px] items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-relay-muted">
              Dependency intelligence
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              The AI infrastructure stack
            </h1>
          </div>
          <button
            aria-label="Open selection inspector"
            className="rounded border border-relay-border bg-relay-surface p-2 text-relay-muted hover:border-relay-accent hover:text-relay-accent xl:hidden"
            onClick={() => setIsInspectorOpen(true)}
            type="button"
          >
            <PanelRight aria-hidden="true" className="size-4" />
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] xl:grid-cols-[minmax(0,1fr)_350px]">
        <main className="min-w-0 px-5 py-6 sm:px-8 lg:px-10">
          {primaryUpdate ? (
            <Link
              className="group mb-7 flex items-center justify-between gap-5 rounded-md border border-relay-border bg-relay-surface px-5 py-4 transition-colors hover:border-relay-border-strong"
              to={`/updates?update=${encodeURIComponent(primaryUpdate.id)}`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-relay-muted">
                  <span className="size-1.5 rounded-full bg-relay-accent" />
                  {data.brief
                    ? "Today’s most material signal"
                    : "Latest analyzed update"}
                </div>
                <p className="mt-2 truncate text-base font-medium">
                  {data.brief?.signal ?? primaryUpdate.title}
                </p>
              </div>
              <span className="hidden shrink-0 items-center gap-2 text-sm text-relay-accent group-hover:text-white sm:flex">
                View details
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 transition-transform group-hover:translate-x-0.5"
                />
              </span>
            </Link>
          ) : null}

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
        </main>

        <div className="hidden min-h-[calc(100vh-81px)] xl:block">
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
    </div>
  );
}
