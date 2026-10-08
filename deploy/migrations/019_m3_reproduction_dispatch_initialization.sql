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
  IF source_body IS NULL OR encode(sha256(convert_to(source_body,'UTF8')),'hex') <> '6fb58cf94fa4e79773626915261442e94aedd1da03ed41b3cc6be7284a8ef2d5' THEN
    RAISE EXCEPTION 'Migration source checksum mismatch; create an explicit new migration';
  END IF;
  SELECT checksum INTO applied FROM agentci_schema_migrations WHERE version='019_m3_reproduction_dispatch_initialization';
  IF applied IS NOT NULL THEN
    IF applied <> '6fb58cf94fa4e79773626915261442e94aedd1da03ed41b3cc6be7284a8ef2d5' THEN
      RAISE EXCEPTION 'Applied migration checksum mismatch; create an explicit new migration';
    END IF;
    RETURN;
  END IF;
-- BEGIN CHECKSUMMED MIGRATION BODY
CREATE FUNCTION agentci_reproduction_dispatch_initialize() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 INSERT INTO agentci_reproduction_dispatch_state(organization_id,repository,operation_id)
 VALUES(NEW.organization_id,NEW.repository,NEW.operation_id) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $fn$;
CREATE TRIGGER reproduction_dispatch_initialize AFTER INSERT ON agentci_reproduction_dispatch_intents
 FOR EACH ROW EXECUTE FUNCTION agentci_reproduction_dispatch_initialize();
INSERT INTO agentci_reproduction_dispatch_state(organization_id,repository,operation_id)
 SELECT organization_id,repository,operation_id FROM agentci_reproduction_dispatch_intents ON CONFLICT DO NOTHING;
-- END CHECKSUMMED MIGRATION BODY
  INSERT INTO agentci_schema_migrations(version,checksum) VALUES('019_m3_reproduction_dispatch_initialization','6fb58cf94fa4e79773626915261442e94aedd1da03ed41b3cc6be7284a8ef2d5');
END $migration$;
COMMIT;
