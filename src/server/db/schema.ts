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
  `
    ALTER TABLE source_documents
      ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'other'
      CHECK (
        source_kind IN (
          'earnings-release', 'sec-filing', 'transcript',
          'paper', 'technical', 'other'
        )
      );

    ALTER TABLE source_documents ADD COLUMN filename TEXT;
  `,
  `
    CREATE TABLE IF NOT EXISTS impact_reviews (
      impact_id TEXT PRIMARY KEY,
      update_id TEXT NOT NULL,
      company_ticker TEXT NOT NULL,
      decision TEXT NOT NULL CHECK (
        decision IN ('accepted', 'rejected', 'deferred')
      ),
      reason_tags_json TEXT NOT NULL,
      note TEXT,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS impact_reviews_updated_at_idx
      ON impact_reviews(updated_at DESC, impact_id);

    CREATE INDEX IF NOT EXISTS impact_reviews_company_idx
      ON impact_reviews(company_ticker, updated_at DESC);

    CREATE INDEX IF NOT EXISTS impact_reviews_decision_idx
      ON impact_reviews(decision, updated_at DESC);
  `,
  `
    ALTER TABLE research_sources
      ADD COLUMN archived INTEGER NOT NULL DEFAULT 0
      CHECK (archived IN (0, 1));

    ALTER TABLE source_documents
      ADD COLUMN research_source_id TEXT
      REFERENCES research_sources(id);

    ALTER TABLE source_documents
      ADD COLUMN analysis_version TEXT NOT NULL DEFAULT 'legacy';

    ALTER TABLE intelligence_updates
      ADD COLUMN novelty TEXT NOT NULL DEFAULT 'repetition'
      CHECK (novelty IN ('new', 'confirmation', 'contradiction', 'repetition'));

    ALTER TABLE intelligence_updates
      ADD COLUMN materiality_reason TEXT NOT NULL
      DEFAULT 'Legacy analysis created before thesis-aware materiality.';

    ALTER TABLE thesis_impacts
      ADD COLUMN thesis_delta TEXT NOT NULL
      DEFAULT 'Legacy proposed thesis impact.';

    UPDATE source_documents
    SET research_source_id = (
      SELECT source.id
      FROM research_sources AS source
      WHERE source.name = source_documents.publisher
      LIMIT 1
    )
    WHERE research_source_id IS NULL;
  `,
  `
    ALTER TABLE companies
      ADD COLUMN archived INTEGER NOT NULL DEFAULT 0
      CHECK (archived IN (0, 1));

    ALTER TABLE research_sources
      ADD COLUMN user_added INTEGER NOT NULL DEFAULT 0
      CHECK (user_added IN (0, 1));

    ALTER TABLE research_sources
      ADD COLUMN layer_ids_json TEXT NOT NULL DEFAULT '[]';

    ALTER TABLE research_sources
      ADD COLUMN company_tickers_json TEXT NOT NULL DEFAULT '[]';

    CREATE INDEX IF NOT EXISTS companies_archived_idx
      ON companies(archived, ticker);

    CREATE INDEX IF NOT EXISTS research_sources_archived_user_added_idx
      ON research_sources(archived, user_added, name);
  `,
  `
    CREATE TABLE IF NOT EXISTS theses (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('company', 'macro')),
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived')),
      current_version_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS theses_type_status_idx
      ON theses(type, status, title);

    CREATE TABLE IF NOT EXISTS thesis_versions (
      id TEXT PRIMARY KEY,
      thesis_id TEXT NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
      version INTEGER NOT NULL CHECK (version > 0),
      belief TEXT NOT NULL,
      confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
      unknowns_json TEXT NOT NULL,
      strengthening_conditions_json TEXT NOT NULL,
      weakening_conditions_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_by_evaluation_id TEXT,
      UNIQUE (thesis_id, version)
    );

    CREATE INDEX IF NOT EXISTS thesis_versions_thesis_idx
      ON thesis_versions(thesis_id, version DESC);

    CREATE TABLE IF NOT EXISTS thesis_companies (
      thesis_id TEXT NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
      company_ticker TEXT NOT NULL REFERENCES companies(ticker) ON DELETE CASCADE,
      PRIMARY KEY (thesis_id, company_ticker)
    );

    CREATE INDEX IF NOT EXISTS thesis_companies_company_idx
      ON thesis_companies(company_ticker, thesis_id);

    CREATE TABLE IF NOT EXISTS thesis_layers (
      thesis_id TEXT NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
      layer_id TEXT NOT NULL REFERENCES stack_layers(id) ON DELETE CASCADE,
      PRIMARY KEY (thesis_id, layer_id)
    );

    CREATE INDEX IF NOT EXISTS thesis_layers_layer_idx
      ON thesis_layers(layer_id, thesis_id);

    CREATE TABLE IF NOT EXISTS thesis_evaluations (
      id TEXT PRIMARY KEY,
      thesis_id TEXT NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
      previous_version_id TEXT NOT NULL REFERENCES thesis_versions(id),
      accepted_version_id TEXT REFERENCES thesis_versions(id),
      outcome TEXT NOT NULL CHECK (
        outcome IN (
          'unchanged', 'reinforced', 'weakened', 'contradicted', 'revised'
        )
      ),
      summary TEXT NOT NULL,
      rationale TEXT NOT NULL,
      proposed_belief TEXT NOT NULL,
      previous_confidence REAL NOT NULL
        CHECK (previous_confidence >= 0 AND previous_confidence <= 100),
      proposed_confidence REAL NOT NULL
        CHECK (proposed_confidence >= 0 AND proposed_confidence <= 100),
      proposed_unknowns_json TEXT NOT NULL,
      proposed_strengthening_conditions_json TEXT NOT NULL,
      proposed_weakening_conditions_json TEXT NOT NULL,
      review_status TEXT NOT NULL DEFAULT 'pending' CHECK (
        review_status IN ('pending', 'accepted', 'rejected', 'deferred')
      ),
      review_note TEXT,
      model TEXT,
      created_at TEXT NOT NULL,
      reviewed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS thesis_evaluations_thesis_idx
      ON thesis_evaluations(thesis_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS thesis_evaluations_review_idx
      ON thesis_evaluations(review_status, created_at DESC);

    CREATE TABLE IF NOT EXISTS thesis_evaluation_runs (
      id TEXT PRIMARY KEY,
      signal_ingestion_cursor TEXT NOT NULL,
      signal_count INTEGER NOT NULL CHECK (signal_count >= 0),
      evaluation_count INTEGER NOT NULL CHECK (evaluation_count >= 0),
      model TEXT,
      completed_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS thesis_evaluation_runs_cursor_idx
      ON thesis_evaluation_runs(signal_ingestion_cursor DESC, completed_at DESC);

    CREATE TABLE IF NOT EXISTS thesis_evaluation_updates (
      evaluation_id TEXT NOT NULL
        REFERENCES thesis_evaluations(id) ON DELETE CASCADE,
      update_id TEXT NOT NULL
        REFERENCES intelligence_updates(id),
      PRIMARY KEY (evaluation_id, update_id)
    );

    CREATE TABLE IF NOT EXISTS thesis_evaluation_evidence (
      evaluation_id TEXT NOT NULL
        REFERENCES thesis_evaluations(id) ON DELETE CASCADE,
      claim_id TEXT NOT NULL REFERENCES evidence_claims(id),
      stance TEXT NOT NULL CHECK (stance IN ('supports', 'opposes', 'context')),
      rationale TEXT NOT NULL,
      PRIMARY KEY (evaluation_id, claim_id)
    );

    CREATE INDEX IF NOT EXISTS thesis_evaluation_evidence_claim_idx
      ON thesis_evaluation_evidence(claim_id, evaluation_id);

    CREATE TABLE IF NOT EXISTS thesis_evidence (
      thesis_id TEXT NOT NULL REFERENCES theses(id) ON DELETE CASCADE,
      claim_id TEXT NOT NULL REFERENCES evidence_claims(id),
      stance TEXT NOT NULL CHECK (stance IN ('supports', 'opposes', 'context')),
      rationale TEXT NOT NULL,
      linked_at TEXT NOT NULL,
      linked_by_evaluation_id TEXT REFERENCES thesis_evaluations(id),
      PRIMARY KEY (thesis_id, claim_id)
    );

    CREATE INDEX IF NOT EXISTS thesis_evidence_claim_idx
      ON thesis_evidence(claim_id, thesis_id);

    CREATE TABLE IF NOT EXISTS brief_thesis_evaluations (
      brief_id TEXT NOT NULL REFERENCES daily_briefs(id) ON DELETE CASCADE,
      evaluation_id TEXT NOT NULL
        REFERENCES thesis_evaluations(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL,
      PRIMARY KEY (brief_id, evaluation_id)
    );

    INSERT OR IGNORE INTO theses (
      id, type, title, status, current_version_id, created_at, updated_at
    )
    SELECT
      'company-' || lower(ticker),
      'company',
      name,
      CASE WHEN archived = 1 THEN 'archived' ELSE 'active' END,
      NULL,
      updated_at,
      updated_at
    FROM companies;

    INSERT OR IGNORE INTO thesis_versions (
      id, thesis_id, version, belief, confidence, unknowns_json,
      strengthening_conditions_json, weakening_conditions_json,
      created_at, created_by_evaluation_id
    )
    SELECT
      'company-' || lower(ticker) || '-v1',
      'company-' || lower(ticker),
      1,
      thesis,
      CASE confidence
        WHEN 'high' THEN 85
        WHEN 'medium' THEN 60
        ELSE 35
      END,
      '[]',
      proves_right_json,
      breaks_thesis_json,
      updated_at,
      NULL
    FROM companies;

    INSERT OR IGNORE INTO thesis_companies (thesis_id, company_ticker)
    SELECT 'company-' || lower(ticker), ticker
    FROM companies;

    INSERT OR IGNORE INTO thesis_layers (thesis_id, layer_id)
    SELECT 'company-' || lower(company_ticker), layer_id
    FROM company_layers;

    UPDATE theses
    SET current_version_id = id || '-v1'
    WHERE type = 'company'
      AND current_version_id IS NULL
      AND EXISTS (
        SELECT 1 FROM thesis_versions
        WHERE thesis_versions.id = theses.id || '-v1'
      );
  `,
  `
    ALTER TABLE research_sources
      ADD COLUMN domain TEXT;

    ALTER TABLE research_sources
      ADD COLUMN role TEXT NOT NULL DEFAULT 'primary'
      CHECK (role IN ('primary', 'context'));

    ALTER TABLE research_sources
      ADD COLUMN authority_tier TEXT NOT NULL DEFAULT 'unknown'
      CHECK (
        authority_tier IN ('first-party', 'specialist', 'context', 'unknown')
      );

    ALTER TABLE research_sources
      ADD COLUMN thesis_ids_json TEXT NOT NULL DEFAULT '[]';

    CREATE INDEX IF NOT EXISTS research_sources_domain_idx
      ON research_sources(domain, archived);
  `,
  `
    ALTER TABLE source_documents
      ADD COLUMN suppressed_at TEXT;

    CREATE INDEX IF NOT EXISTS source_documents_suppressed_idx
      ON source_documents(suppressed_at, content_hash);

    CREATE TABLE IF NOT EXISTS thesis_evaluation_requeue (
      update_id TEXT PRIMARY KEY
        REFERENCES intelligence_updates(id) ON DELETE CASCADE,
      requested_at TEXT NOT NULL,
      reason TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS thesis_evaluation_requeue_requested_idx
      ON thesis_evaluation_requeue(requested_at, update_id);
  `,
  `
    CREATE TABLE IF NOT EXISTS update_macro_thesis_impacts (
      id TEXT PRIMARY KEY,
      update_id TEXT NOT NULL
        REFERENCES intelligence_updates(id) ON DELETE CASCADE,
      thesis_id TEXT NOT NULL
        REFERENCES theses(id) ON DELETE CASCADE,
      relevance TEXT NOT NULL
        CHECK (relevance IN ('primary', 'secondary', 'context')),
      stance TEXT NOT NULL
        CHECK (stance IN ('supports', 'opposes', 'context')),
      rationale TEXT NOT NULL,
      claim_ids_json TEXT NOT NULL,
      UNIQUE (update_id, thesis_id)
    );

    CREATE INDEX IF NOT EXISTS update_macro_thesis_impacts_thesis_idx
      ON update_macro_thesis_impacts(thesis_id, relevance, update_id);
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
