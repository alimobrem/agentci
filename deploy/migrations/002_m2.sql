BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('agentci:schema-migrations',0));
CREATE TABLE IF NOT EXISTS agentci_eval_jobs (
  id uuid PRIMARY KEY,
  review_id uuid NOT NULL REFERENCES agentci_reviews(id),
  attempt_key uuid NOT NULL,
  repository text NOT NULL,
  pull_request integer NOT NULL CHECK(pull_request>0),
  base_sha text NOT NULL CHECK(base_sha ~ '^[a-f0-9]{40}$'),
  head_sha text NOT NULL CHECK(head_sha ~ '^[a-f0-9]{40}$'),
  digest text NOT NULL CHECK(digest ~ '^sha256:[a-f0-9]{64}$'),
  inputs jsonb NOT NULL,
  plan jsonb NOT NULL,
  cancel_requested boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(review_id,attempt_key),
  CHECK(base_sha<>head_sha)
);
CREATE TABLE IF NOT EXISTS agentci_eval_units (
  id uuid PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES agentci_eval_jobs(id),
  suite_id text NOT NULL,
  model_key text NOT NULL,
  side text NOT NULL CHECK(side IN('base','head')),
  definition jsonb NOT NULL,
  digest text NOT NULL CHECK(digest ~ '^sha256:[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running','completed','cancelled')),
  lease_token uuid,
  lease_until timestamptz,
  result jsonb,
  result_digest text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE(job_id,suite_id,model_key,side),
  CHECK((status='running')=(lease_token IS NOT NULL AND lease_until IS NOT NULL)),
  CHECK((status='completed')=(result IS NOT NULL AND result_digest IS NOT NULL)),
  CHECK(result_digest IS NULL OR result_digest ~ '^sha256:[a-f0-9]{64}$')
);
CREATE TABLE IF NOT EXISTS agentci_eval_trials (
  unit_id uuid NOT NULL REFERENCES agentci_eval_units(id),
  trial integer NOT NULL CHECK(trial>=0 AND trial<1000),
  checkpoint jsonb NOT NULL,
  digest text NOT NULL CHECK(digest ~ '^sha256:[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(unit_id,trial)
);
CREATE INDEX IF NOT EXISTS agentci_eval_units_job_status ON agentci_eval_units(job_id,status);
CREATE OR REPLACE FUNCTION agentci_eval_immutable_job() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.review_id,NEW.attempt_key,NEW.repository,NEW.pull_request,NEW.base_sha,NEW.head_sha,NEW.digest,NEW.inputs,NEW.plan,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.review_id,OLD.attempt_key,OLD.repository,OLD.pull_request,OLD.base_sha,OLD.head_sha,OLD.digest,OLD.inputs,OLD.plan,OLD.created_at)
     OR (OLD.cancel_requested AND NOT NEW.cancel_requested) THEN
    RAISE EXCEPTION 'Immutable eval job';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS agentci_eval_job_immutable ON agentci_eval_jobs;
CREATE TRIGGER agentci_eval_job_immutable BEFORE UPDATE ON agentci_eval_jobs FOR EACH ROW EXECUTE FUNCTION agentci_eval_immutable_job();
CREATE OR REPLACE FUNCTION agentci_eval_immutable_unit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.job_id,NEW.suite_id,NEW.model_key,NEW.side,NEW.definition,NEW.digest,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.job_id,OLD.suite_id,OLD.model_key,OLD.side,OLD.definition,OLD.digest,OLD.created_at)
     OR (OLD.status IN('completed','cancelled') AND NEW IS DISTINCT FROM OLD) THEN
    RAISE EXCEPTION 'Immutable eval unit';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS agentci_eval_unit_immutable ON agentci_eval_units;
CREATE TRIGGER agentci_eval_unit_immutable BEFORE UPDATE ON agentci_eval_units FOR EACH ROW EXECUTE FUNCTION agentci_eval_immutable_unit();
CREATE OR REPLACE FUNCTION agentci_eval_immutable_trial() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Immutable eval trial'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS agentci_eval_trial_immutable ON agentci_eval_trials;
CREATE TRIGGER agentci_eval_trial_immutable BEFORE UPDATE ON agentci_eval_trials FOR EACH ROW EXECUTE FUNCTION agentci_eval_immutable_trial();
COMMIT;
