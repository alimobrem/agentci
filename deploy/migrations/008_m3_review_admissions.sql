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
  IF source_body IS NULL OR encode(sha256(convert_to(source_body,'UTF8')),'hex') <> '0d220ddbe619c853f8998cf6b159b0ced9b35fd34d4b2f8e3aa79584cbe9b0db' THEN
    RAISE EXCEPTION 'Migration source checksum mismatch; create an explicit new migration';
  END IF;
  SELECT checksum INTO applied FROM agentci_schema_migrations WHERE version='008_m3_review_admissions';
  IF applied IS NOT NULL THEN
    IF applied <> '0d220ddbe619c853f8998cf6b159b0ced9b35fd34d4b2f8e3aa79584cbe9b0db' THEN
      RAISE EXCEPTION 'Applied migration checksum mismatch; create an explicit new migration';
    END IF;
    RETURN;
  END IF;
-- BEGIN CHECKSUMMED MIGRATION BODY
CREATE TABLE agentci_review_admissions (
  organization_id uuid NOT NULL,
  repository text NOT NULL,
  id uuid NOT NULL,
  digest text NOT NULL CHECK(digest ~ '^sha256:[a-f0-9]{64}$'),
  request jsonb NOT NULL CHECK(jsonb_typeof(request)='object'),
  approval_digest text NOT NULL CHECK(approval_digest ~ '^sha256:[a-f0-9]{64}$'),
  approval jsonb NOT NULL CHECK(jsonb_typeof(approval)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(organization_id,repository,id)
);
CREATE TABLE agentci_review_admission_outbox (
  organization_id uuid NOT NULL,
  repository text NOT NULL,
  id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(organization_id,repository,id),
  FOREIGN KEY(organization_id,repository,id) REFERENCES agentci_review_admissions(organization_id,repository,id)
);
CREATE FUNCTION agentci_review_admission_immutable() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN RAISE EXCEPTION 'Immutable review admission'; END;
$fn$;
CREATE TRIGGER review_admission_immutable BEFORE UPDATE OR DELETE ON agentci_review_admissions
  FOR EACH ROW EXECUTE FUNCTION agentci_review_admission_immutable();
-- END CHECKSUMMED MIGRATION BODY
  INSERT INTO agentci_schema_migrations(version,checksum) VALUES('008_m3_review_admissions','0d220ddbe619c853f8998cf6b159b0ced9b35fd34d4b2f8e3aa79584cbe9b0db');
END $migration$;
COMMIT;
