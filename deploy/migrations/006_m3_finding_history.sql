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
  IF source_body IS NULL OR encode(sha256(convert_to(source_body,'UTF8')),'hex') <> 'd47702b5e32b60ace8981c5376870942d5c2941cfc3896dc5fb038effc73744a' THEN
    RAISE EXCEPTION 'Migration source checksum mismatch; create an explicit new migration';
  END IF;
  SELECT checksum INTO applied FROM agentci_schema_migrations WHERE version='006_m3_finding_history';
  IF applied IS NOT NULL THEN
    IF applied <> 'd47702b5e32b60ace8981c5376870942d5c2941cfc3896dc5fb038effc73744a' THEN
      RAISE EXCEPTION 'Applied migration checksum mismatch; create an explicit new migration';
    END IF;
    RETURN;
  END IF;
-- BEGIN CHECKSUMMED MIGRATION BODY
CREATE TABLE agentci_finding_events (
  organization_id uuid NOT NULL,
  repository text NOT NULL CHECK(length(repository) BETWEEN 1 AND 256),
  finding_id text NOT NULL CHECK(finding_id ~ '^sha256:[a-f0-9]{64}$'),
  version integer NOT NULL CHECK(version BETWEEN 1 AND 10000),
  operation_id uuid NOT NULL,
  digest text NOT NULL CHECK(digest ~ '^sha256:[a-f0-9]{64}$'),
  event jsonb NOT NULL CHECK(jsonb_typeof(event)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(organization_id,repository,finding_id,version),
  UNIQUE(organization_id,repository,operation_id)
);
CREATE FUNCTION agentci_finding_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Immutable finding event';
END $$;
CREATE TRIGGER finding_event_immutable BEFORE UPDATE OR DELETE ON agentci_finding_events
  FOR EACH ROW EXECUTE FUNCTION agentci_finding_event_immutable();
-- END CHECKSUMMED MIGRATION BODY
  INSERT INTO agentci_schema_migrations(version,checksum) VALUES('006_m3_finding_history','d47702b5e32b60ace8981c5376870942d5c2941cfc3896dc5fb038effc73744a');
END $migration$;
COMMIT;
