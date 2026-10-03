BEGIN;
CREATE TABLE IF NOT EXISTS agentci_scope (
  id integer PRIMARY KEY CHECK(id=1), organization_id uuid NOT NULL, repository text NOT NULL
);
CREATE TABLE IF NOT EXISTS agentci_deliveries (
  id uuid PRIMARY KEY, digest text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS agentci_jobs (
  id uuid PRIMARY KEY REFERENCES agentci_deliveries(id), payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, dispatched_at timestamptz
);
CREATE TABLE IF NOT EXISTS agentci_reviews (
  id uuid PRIMARY KEY, repository text NOT NULL, pull_request integer NOT NULL CHECK(pull_request>0), base_sha text NOT NULL, head_sha text NOT NULL,
  digest text NOT NULL, evidence jsonb NOT NULL, analysis jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(repository,pull_request,base_sha,head_sha)
);
COMMIT;
