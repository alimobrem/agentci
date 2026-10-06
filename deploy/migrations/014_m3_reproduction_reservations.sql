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
  IF source_body IS NULL OR encode(sha256(convert_to(source_body,'UTF8')),'hex') <> 'e3693cacd6530c62f9c6765e88e6ad04acd1c881579eb7cb065e64152d4abc6d' THEN
    RAISE EXCEPTION 'Migration source checksum mismatch; create an explicit new migration';
  END IF;
  SELECT checksum INTO applied FROM agentci_schema_migrations WHERE version='014_m3_reproduction_reservations';
  IF applied IS NOT NULL THEN
    IF applied <> 'e3693cacd6530c62f9c6765e88e6ad04acd1c881579eb7cb065e64152d4abc6d' THEN
      RAISE EXCEPTION 'Applied migration checksum mismatch; create an explicit new migration';
    END IF;
    RETURN;
  END IF;
-- BEGIN CHECKSUMMED MIGRATION BODY
CREATE TABLE agentci_reproduction_operations (
 organization_id uuid NOT NULL, repository text NOT NULL, operation_id uuid NOT NULL,
 finding_id text NOT NULL, reproduction_id uuid NOT NULL,
 request_digest text NOT NULL CHECK(request_digest ~ '^sha256:[a-f0-9]{64}$'),
 request jsonb NOT NULL CHECK(jsonb_typeof(request)='object'),
 result_digest text NOT NULL CHECK(result_digest ~ '^sha256:[a-f0-9]{64}$'),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,repository,operation_id),
 UNIQUE(organization_id,repository,reproduction_id),
 FOREIGN KEY(organization_id,repository,reproduction_id) REFERENCES agentci_reproduction_plans(organization_id,repository,id)
);
CREATE TRIGGER reproduction_operation_immutable BEFORE UPDATE OR DELETE ON agentci_reproduction_operations
 FOR EACH ROW EXECUTE FUNCTION agentci_finding_event_immutable();
CREATE TABLE agentci_reproduction_dispatch_intents (
 organization_id uuid NOT NULL, repository text NOT NULL, operation_id uuid NOT NULL,
 workflow_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,repository,operation_id),
 UNIQUE(organization_id,repository,workflow_id),
 FOREIGN KEY(organization_id,repository,operation_id) REFERENCES agentci_reproduction_operations(organization_id,repository,operation_id)
);
CREATE TRIGGER reproduction_dispatch_intent_immutable BEFORE UPDATE OR DELETE ON agentci_reproduction_dispatch_intents
 FOR EACH ROW EXECUTE FUNCTION agentci_finding_event_immutable();
-- END CHECKSUMMED MIGRATION BODY
  INSERT INTO agentci_schema_migrations(version,checksum) VALUES('014_m3_reproduction_reservations','e3693cacd6530c62f9c6765e88e6ad04acd1c881579eb7cb065e64152d4abc6d');
END $migration$;
COMMIT;
