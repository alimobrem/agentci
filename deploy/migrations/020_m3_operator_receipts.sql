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
  IF source_body IS NULL OR encode(sha256(convert_to(source_body,'UTF8')),'hex') <> '066739b4d0d2286a8fa91dd6956af9d31885aa3a9e059b7e71b75cdec93755a3' THEN
    RAISE EXCEPTION 'Migration source checksum mismatch; create an explicit new migration';
  END IF;
  SELECT checksum INTO applied FROM agentci_schema_migrations WHERE version='020_m3_operator_receipts';
  IF applied IS NOT NULL THEN
    IF applied <> '066739b4d0d2286a8fa91dd6956af9d31885aa3a9e059b7e71b75cdec93755a3' THEN
      RAISE EXCEPTION 'Applied migration checksum mismatch; create an explicit new migration';
    END IF;
    RETURN;
  END IF;
-- BEGIN CHECKSUMMED MIGRATION BODY
CREATE TABLE agentci_operator_receipts (
 organization_id uuid NOT NULL, repository text NOT NULL, id uuid NOT NULL,
 review_id uuid NOT NULL, finding_id text NOT NULL, finding_version integer NOT NULL,
 operation_id uuid NOT NULL, request_digest text NOT NULL CHECK(request_digest ~ '^sha256:[a-f0-9]{64}$'),
 receipt_digest text NOT NULL CHECK(receipt_digest ~ '^sha256:[a-f0-9]{64}$'),
 request jsonb NOT NULL CHECK(jsonb_typeof(request)='object'), receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,repository,id), UNIQUE(organization_id,repository,operation_id),
 FOREIGN KEY(organization_id,repository,review_id) REFERENCES agentci_review_admissions(organization_id,repository,id),
 FOREIGN KEY(organization_id,repository,finding_id,finding_version) REFERENCES agentci_finding_events(organization_id,repository,finding_id,version)
);
CREATE TRIGGER operator_receipt_immutable BEFORE UPDATE OR DELETE ON agentci_operator_receipts
 FOR EACH ROW EXECUTE FUNCTION agentci_finding_event_immutable();
-- END CHECKSUMMED MIGRATION BODY
  INSERT INTO agentci_schema_migrations(version,checksum) VALUES('020_m3_operator_receipts','066739b4d0d2286a8fa91dd6956af9d31885aa3a9e059b7e71b75cdec93755a3');
END $migration$;
COMMIT;
