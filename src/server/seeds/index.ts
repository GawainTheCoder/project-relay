import type { RelayRepository } from "../db/repository.js";

import {
  seedBrief,
  seedCompanies,
  seedLayers,
  seedSources,
  seedUpdates,
} from "./catalog.js";

export function seedDatabase(repository: RelayRepository): void {
  repository.seedCatalog({
    brief: seedBrief,
    companies: seedCompanies,
    layers: seedLayers,
    sources: seedSources,
    updates: seedUpdates,
  });
}
