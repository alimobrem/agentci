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
  IF source_body IS NULL OR encode(sha256(convert_to(source_body,'UTF8')),'hex') <> 'bd7db120dfa82a7ac6749a9b293fa7d0e6f834de8e5615e887c2abdb7a7e196f' THEN
    RAISE EXCEPTION 'Migration source checksum mismatch; create an explicit new migration';
  END IF;
  SELECT checksum INTO applied FROM agentci_schema_migrations WHERE version='012_m3_review_recovery';
  IF applied IS NOT NULL THEN
    IF applied <> 'bd7db120dfa82a7ac6749a9b293fa7d0e6f834de8e5615e887c2abdb7a7e196f' THEN
      RAISE EXCEPTION 'Applied migration checksum mismatch; create an explicit new migration';
    END IF;
    RETURN;
  END IF;
-- BEGIN CHECKSUMMED MIGRATION BODY
ALTER TABLE agentci_review_admission_outbox ADD COLUMN recovery_after timestamptz;
CREATE INDEX review_admission_recovery_pending ON agentci_review_admission_outbox(organization_id,repository,recovery_after,created_at) WHERE run_id IS NOT NULL AND terminal_status IS NULL;
-- END CHECKSUMMED MIGRATION BODY
  INSERT INTO agentci_schema_migrations(version,checksum) VALUES('012_m3_review_recovery','bd7db120dfa82a7ac6749a9b293fa7d0e6f834de8e5615e887c2abdb7a7e196f');
END $migration$;
COMMIT;
