import type { RelayRepository } from "../db/repository.js";

import {
  seedBrief,
  seedCompanies,
  seedLayers,
  seedSources,
  seedUpdates,
} from "./catalog.js";

export const demoBriefId = seedBrief.id;
export const demoUpdateIds = seedUpdates.map((update) => update.id);

export function seedDatabase(
  repository: RelayRepository,
  options: { includeDemoData?: boolean } = {},
): void {
  repository.seedCatalog({
    ...(options.includeDemoData ? { brief: seedBrief } : {}),
    companies: seedCompanies,
    layers: seedLayers,
    sources: seedSources,
    updates: options.includeDemoData ? seedUpdates : [],
  });
}

export function clearDemoData(repository: RelayRepository): void {
  repository.clearDemoIntelligence(
    demoUpdateIds,
    demoBriefId,
  );
}
