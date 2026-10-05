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
  IF source_body IS NULL OR encode(sha256(convert_to(source_body,'UTF8')),'hex') <> '639cdf27e2de58278fbba44d6d6faef4fe06b394bedb39869fe70adb18fb6cd0' THEN
    RAISE EXCEPTION 'Migration source checksum mismatch; create an explicit new migration';
  END IF;
  SELECT checksum INTO applied FROM agentci_schema_migrations WHERE version='011_m3_review_summaries';
  IF applied IS NOT NULL THEN
    IF applied <> '639cdf27e2de58278fbba44d6d6faef4fe06b394bedb39869fe70adb18fb6cd0' THEN
      RAISE EXCEPTION 'Applied migration checksum mismatch; create an explicit new migration';
    END IF;
    RETURN;
  END IF;
-- BEGIN CHECKSUMMED MIGRATION BODY
CREATE TABLE agentci_review_execution_summaries (
 organization_id uuid NOT NULL, repository text NOT NULL, id uuid NOT NULL,
 digest text NOT NULL CHECK(digest ~ '^sha256:[a-f0-9]{64}$'),
 summary jsonb NOT NULL CHECK(jsonb_typeof(summary)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,repository,id),
 FOREIGN KEY(organization_id,repository,id) REFERENCES agentci_review_admissions(organization_id,repository,id)
);
CREATE TRIGGER review_execution_summary_immutable BEFORE UPDATE OR DELETE ON agentci_review_execution_summaries
 FOR EACH ROW EXECUTE FUNCTION agentci_review_admission_immutable();
-- END CHECKSUMMED MIGRATION BODY
  INSERT INTO agentci_schema_migrations(version,checksum) VALUES('011_m3_review_summaries','639cdf27e2de58278fbba44d6d6faef4fe06b394bedb39869fe70adb18fb6cd0');
END $migration$;
COMMIT;
