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
  IF source_body IS NULL OR encode(sha256(convert_to(source_body,'UTF8')),'hex') <> '085082aac22b2109ae872e09445c2682b4063f2bb444c74ea8058f88ab3a19f4' THEN
    RAISE EXCEPTION 'Migration source checksum mismatch; create an explicit new migration';
  END IF;
  SELECT checksum INTO applied FROM agentci_schema_migrations WHERE version='018_m3_reproduction_dispatch_settlement';
  IF applied IS NOT NULL THEN
    IF applied <> '085082aac22b2109ae872e09445c2682b4063f2bb444c74ea8058f88ab3a19f4' THEN
      RAISE EXCEPTION 'Applied migration checksum mismatch; create an explicit new migration';
    END IF;
    RETURN;
  END IF;
-- BEGIN CHECKSUMMED MIGRATION BODY
ALTER TABLE agentci_reproduction_dispatch_state
 ADD COLUMN settlement jsonb,
 ADD COLUMN settled_at timestamptz,
 ADD CHECK ((settlement IS NULL)=(settled_at IS NULL)),
 ADD CHECK (settlement IS NULL OR (jsonb_typeof(settlement)='object' AND settlement ? 'kind' AND settlement->>'kind' IN ('receipt-retained','never-staged','superseded') AND octet_length(settlement::text)<=8192));
ALTER TABLE agentci_reproduction_dispatch_state DROP CONSTRAINT agentci_reproduction_dispatch_state_cancellation_cause_check;
ALTER TABLE agentci_reproduction_dispatch_state ADD CHECK(cancellation_cause IN ('user','revoked','expired','permission-denied','superseded','unavailable'));
CREATE FUNCTION agentci_reproduction_dispatch_settlement_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF OLD.settlement IS NOT NULL AND ROW(NEW.settlement,NEW.settled_at) IS DISTINCT FROM ROW(OLD.settlement,OLD.settled_at)
 THEN RAISE EXCEPTION 'Immutable reproduction dispatch settlement'; END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER reproduction_dispatch_settlement_guard BEFORE UPDATE ON agentci_reproduction_dispatch_state FOR EACH ROW EXECUTE FUNCTION agentci_reproduction_dispatch_settlement_guard();
-- END CHECKSUMMED MIGRATION BODY
  INSERT INTO agentci_schema_migrations(version,checksum) VALUES('018_m3_reproduction_dispatch_settlement','085082aac22b2109ae872e09445c2682b4063f2bb444c74ea8058f88ab3a19f4');
END $migration$;
COMMIT;
