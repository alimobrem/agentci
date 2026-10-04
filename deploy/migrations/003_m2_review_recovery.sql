BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('agentci:schema-migrations',0));
CREATE TABLE IF NOT EXISTS agentci_schema_migrations (
  version text PRIMARY KEY, checksum text NOT NULL CHECK(checksum ~ '^[a-f0-9]{64}$'),
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
DO $migration$
DECLARE applied text; source_body text;
BEGIN
  source_body := substring(current_query() from E'-- BEGIN CHECKSUMMED MIGRATION BODY\\n(.*?)-- END CHECKSUMMED MIGRATION BODY');
  IF source_body IS NULL OR encode(sha256(convert_to(source_body,'UTF8')),'hex') <> '71f77666d7c29e8deed03536bf4904188188024162e42d61b5766635b7ea3a78' THEN
    RAISE EXCEPTION 'Migration source checksum mismatch; create an explicit new migration';
  END IF;
  SELECT checksum INTO applied FROM agentci_schema_migrations WHERE version='003_m2_review_recovery';
  IF applied IS NOT NULL THEN
    IF applied <> '71f77666d7c29e8deed03536bf4904188188024162e42d61b5766635b7ea3a78' THEN
      RAISE EXCEPTION 'Applied migration checksum mismatch; create an explicit new migration';
    END IF;
    RETURN;
  END IF;
-- BEGIN CHECKSUMMED MIGRATION BODY
CREATE TABLE IF NOT EXISTS agentci_review_attempts (
  id uuid PRIMARY KEY REFERENCES agentci_jobs(id),
  workflow_id text NOT NULL UNIQUE,
  run_id uuid,
  eval_task_queue text NOT NULL CHECK(length(eval_task_queue) BETWEEN 1 AND 255),
  lease_token uuid,
  lease_until timestamptz,
  closed_at timestamptz,
  terminal_status text CHECK(terminal_status IN('COMPLETED','FAILED','CANCELLED','TERMINATED','TIMED_OUT')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK((closed_at IS NULL)=(terminal_status IS NULL))
);
CREATE INDEX IF NOT EXISTS agentci_review_attempts_open ON agentci_review_attempts(lease_until,created_at) WHERE closed_at IS NULL;
CREATE OR REPLACE FUNCTION agentci_review_attempt_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.workflow_id,NEW.eval_task_queue,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.workflow_id,OLD.eval_task_queue,OLD.created_at)
     OR (OLD.run_id IS NOT NULL AND NEW.run_id IS DISTINCT FROM OLD.run_id)
     OR (OLD.closed_at IS NOT NULL AND NEW IS DISTINCT FROM OLD) THEN
    RAISE EXCEPTION 'Immutable review attempt identity or closure';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS agentci_review_attempt_immutable ON agentci_review_attempts;
CREATE TRIGGER agentci_review_attempt_immutable BEFORE UPDATE ON agentci_review_attempts FOR EACH ROW EXECUTE FUNCTION agentci_review_attempt_immutable();
-- END CHECKSUMMED MIGRATION BODY
  INSERT INTO agentci_schema_migrations(version,checksum) VALUES('003_m2_review_recovery','71f77666d7c29e8deed03536bf4904188188024162e42d61b5766635b7ea3a78');
END $migration$;
COMMIT;
