import type { DatabaseSync } from "node:sqlite";

const migrations = [
  `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stack_layers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      sort_order INTEGER NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS layer_dependencies (
      layer_id TEXT NOT NULL REFERENCES stack_layers(id) ON DELETE CASCADE,
      depends_on_layer_id TEXT NOT NULL REFERENCES stack_layers(id) ON DELETE CASCADE,
      PRIMARY KEY (layer_id, depends_on_layer_id),
      CHECK (layer_id <> depends_on_layer_id)
    );

    CREATE TABLE IF NOT EXISTS companies (
      ticker TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      thesis TEXT NOT NULL,
      why_it_matters TEXT NOT NULL,
      proves_right_json TEXT NOT NULL,
      breaks_thesis_json TEXT NOT NULL,
      watch_metrics_json TEXT NOT NULL,
      confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS company_layers (
      company_ticker TEXT NOT NULL REFERENCES companies(ticker) ON DELETE CASCADE,
      layer_id TEXT NOT NULL REFERENCES stack_layers(id) ON DELETE CASCADE,
      PRIMARY KEY (company_ticker, layer_id)
    );

    CREATE TABLE IF NOT EXISTS research_sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (
        type IN ('rss', 'investor-relations', 'filing', 'paper', 'release', 'manual')
      ),
      url TEXT,
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'syncing', 'error')),
      last_synced_at TEXT,
      document_count INTEGER NOT NULL DEFAULT 0 CHECK (document_count >= 0)
    );

    CREATE TABLE IF NOT EXISTS source_documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      publisher TEXT NOT NULL,
      source_url TEXT,
      published_at TEXT NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      analysis_status TEXT NOT NULL DEFAULT 'pending' CHECK (
        analysis_status IN ('pending', 'analyzed', 'error')
      ),
      update_id TEXT,
      ingested_at TEXT NOT NULL,
      error_message TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS source_documents_content_hash_idx
      ON source_documents(content_hash);

    CREATE TABLE IF NOT EXISTS intelligence_updates (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      publisher TEXT NOT NULL,
      source_url TEXT,
      published_at TEXT NOT NULL,
      ingested_at TEXT NOT NULL,
      materiality TEXT NOT NULL CHECK (
        materiality IN ('high', 'medium', 'low', 'not-material')
      ),
      sentiment TEXT NOT NULL CHECK (
        sentiment IN ('bullish', 'bearish', 'neutral', 'not-material')
      ),
      what_happened TEXT NOT NULL,
      why_it_matters TEXT NOT NULL,
      beneficiaries_json TEXT NOT NULL,
      threatened_json TEXT NOT NULL,
      watch_next_json TEXT NOT NULL,
      model TEXT
    );

    CREATE INDEX IF NOT EXISTS intelligence_updates_published_at_idx
      ON intelligence_updates(published_at DESC);

    CREATE TABLE IF NOT EXISTS update_layers (
      update_id TEXT NOT NULL REFERENCES intelligence_updates(id) ON DELETE CASCADE,
      layer_id TEXT NOT NULL REFERENCES stack_layers(id) ON DELETE CASCADE,
      PRIMARY KEY (update_id, layer_id)
    );

    CREATE TABLE IF NOT EXISTS update_companies (
      update_id TEXT NOT NULL REFERENCES intelligence_updates(id) ON DELETE CASCADE,
      company_ticker TEXT NOT NULL REFERENCES companies(ticker) ON DELETE CASCADE,
      PRIMARY KEY (update_id, company_ticker)
    );

    CREATE TABLE IF NOT EXISTS evidence_claims (
      id TEXT PRIMARY KEY,
      update_id TEXT NOT NULL REFERENCES intelligence_updates(id) ON DELETE CASCADE,
      quote TEXT NOT NULL,
      source_id TEXT NOT NULL,
      locator TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS thesis_impacts (
      id TEXT PRIMARY KEY,
      update_id TEXT NOT NULL REFERENCES intelligence_updates(id) ON DELETE CASCADE,
      company_ticker TEXT NOT NULL REFERENCES companies(ticker) ON DELETE CASCADE,
      direction TEXT NOT NULL CHECK (
        direction IN ('bullish', 'bearish', 'neutral', 'not-material')
      ),
      summary TEXT NOT NULL,
      confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
      horizon TEXT NOT NULL,
      decision TEXT NOT NULL DEFAULT 'proposed' CHECK (
        decision IN ('proposed', 'accepted', 'rejected')
      )
    );

    CREATE INDEX IF NOT EXISTS thesis_impacts_company_idx
      ON thesis_impacts(company_ticker, update_id);

    CREATE TABLE IF NOT EXISTS daily_briefs (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      signal TEXT NOT NULL,
      secondary_signals_json TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      model TEXT
    );

    CREATE TABLE IF NOT EXISTS brief_updates (
      brief_id TEXT NOT NULL REFERENCES daily_briefs(id) ON DELETE CASCADE,
      update_id TEXT NOT NULL REFERENCES intelligence_updates(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL,
      PRIMARY KEY (brief_id, update_id)
    );

    CREATE TABLE IF NOT EXISTS brief_claims (
      brief_id TEXT NOT NULL REFERENCES daily_briefs(id) ON DELETE CASCADE,
      claim_id TEXT NOT NULL REFERENCES evidence_claims(id) ON DELETE CASCADE,
      PRIMARY KEY (brief_id, claim_id)
    );
  `,
] as const;

export function migrateDatabase(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const hasMigration = database.prepare(
    "SELECT 1 FROM schema_migrations WHERE version = ?",
  );
  const recordMigration = database.prepare(
    "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
  );

  migrations.forEach((sql, index) => {
    const version = index + 1;
    if (hasMigration.get(version)) {
      return;
    }

    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(sql);
      recordMigration.run(version, new Date().toISOString());
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  });
}
