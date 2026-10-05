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
  IF source_body IS NULL OR encode(sha256(convert_to(source_body,'UTF8')),'hex') <> 'd4fc5c05c4dab8347f865e3a6759a2a0af695026ce550bbfb0553b636b4c205b' THEN
    RAISE EXCEPTION 'Migration source checksum mismatch; create an explicit new migration';
  END IF;
  SELECT checksum INTO applied FROM agentci_schema_migrations WHERE version='005_m3_reviewer_results';
  IF applied IS NOT NULL THEN
    IF applied <> 'd4fc5c05c4dab8347f865e3a6759a2a0af695026ce550bbfb0553b636b4c205b' THEN
      RAISE EXCEPTION 'Applied migration checksum mismatch; create an explicit new migration';
    END IF;
    RETURN;
  END IF;
-- BEGIN CHECKSUMMED MIGRATION BODY
CREATE TABLE agentci_reviewer_results (
  organization_id uuid NOT NULL,
  repository text NOT NULL CHECK(length(repository) BETWEEN 1 AND 256),
  request_id uuid NOT NULL,
  budget_id uuid NOT NULL REFERENCES agentci_model_budgets(id),
  attempt_id uuid NOT NULL UNIQUE REFERENCES agentci_model_attempts(id),
  digest text NOT NULL CHECK(digest ~ '^sha256:[a-f0-9]{64}$'),
  result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(organization_id,repository,request_id)
);
CREATE FUNCTION agentci_reviewer_result_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Immutable reviewer result';
END $$;
CREATE TRIGGER reviewer_result_immutable BEFORE UPDATE ON agentci_reviewer_results
  FOR EACH ROW EXECUTE FUNCTION agentci_reviewer_result_immutable();
-- END CHECKSUMMED MIGRATION BODY
  INSERT INTO agentci_schema_migrations(version,checksum) VALUES('005_m3_reviewer_results','d4fc5c05c4dab8347f865e3a6759a2a0af695026ce550bbfb0553b636b4c205b');
END $migration$;
COMMIT;
