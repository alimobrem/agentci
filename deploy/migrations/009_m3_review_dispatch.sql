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
  IF source_body IS NULL OR encode(sha256(convert_to(source_body,'UTF8')),'hex') <> '65a68c9095c90a388532bb656e87cdbf4e1d1b5cd8a7f4356f02e9328f089e47' THEN
    RAISE EXCEPTION 'Migration source checksum mismatch; create an explicit new migration';
  END IF;
  SELECT checksum INTO applied FROM agentci_schema_migrations WHERE version='009_m3_review_dispatch';
  IF applied IS NOT NULL THEN
    IF applied <> '65a68c9095c90a388532bb656e87cdbf4e1d1b5cd8a7f4356f02e9328f089e47' THEN
      RAISE EXCEPTION 'Applied migration checksum mismatch; create an explicit new migration';
    END IF;
    RETURN;
  END IF;
-- BEGIN CHECKSUMMED MIGRATION BODY
ALTER TABLE agentci_review_admission_outbox
  ADD COLUMN run_id uuid,
  ADD COLUMN dispatched_at timestamptz,
  ADD COLUMN cancel_requested_at timestamptz,
  ADD COLUMN terminal_status text CHECK(terminal_status IN ('completed','failed','cancelled','terminated','timed-out')),
  ADD COLUMN terminal_digest text CHECK(terminal_digest ~ '^sha256:[a-f0-9]{64}$'),
  ADD COLUMN terminal_at timestamptz,
  ADD COLUMN lease_token uuid,
  ADD COLUMN lease_until timestamptz,
  ADD CONSTRAINT review_terminal_complete CHECK(
    (terminal_status IS NULL AND terminal_digest IS NULL AND terminal_at IS NULL) OR
    (terminal_status IS NOT NULL AND terminal_digest IS NOT NULL AND terminal_at IS NOT NULL AND run_id IS NOT NULL));
CREATE INDEX review_admission_dispatch_pending ON agentci_review_admission_outbox(organization_id,repository,created_at)
  WHERE dispatched_at IS NULL AND terminal_status IS NULL;
ALTER TABLE agentci_review_admission_outbox
  ADD CONSTRAINT review_dispatch_run CHECK(dispatched_at IS NULL OR run_id IS NOT NULL),
  ADD CONSTRAINT review_dispatch_lease CHECK((lease_token IS NULL)=(lease_until IS NULL));
CREATE FUNCTION agentci_review_dispatch_identity() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Immutable review dispatch identity'; END IF;
  IF (NEW.organization_id,NEW.repository,NEW.id,NEW.created_at) IS DISTINCT FROM
     (OLD.organization_id,OLD.repository,OLD.id,OLD.created_at)
     OR (OLD.run_id IS NOT NULL AND NEW.run_id IS DISTINCT FROM OLD.run_id)
     OR (OLD.cancel_requested_at IS NOT NULL AND NEW.cancel_requested_at IS DISTINCT FROM OLD.cancel_requested_at)
     OR (OLD.dispatched_at IS NOT NULL AND NEW.dispatched_at IS DISTINCT FROM OLD.dispatched_at)
     OR (OLD.terminal_status IS NOT NULL AND (NEW.terminal_status,NEW.terminal_digest,NEW.terminal_at) IS DISTINCT FROM (OLD.terminal_status,OLD.terminal_digest,OLD.terminal_at)) THEN
    RAISE EXCEPTION 'Immutable review dispatch identity';
  END IF;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER review_dispatch_identity BEFORE UPDATE OR DELETE ON agentci_review_admission_outbox
  FOR EACH ROW EXECUTE FUNCTION agentci_review_dispatch_identity();
-- END CHECKSUMMED MIGRATION BODY
  INSERT INTO agentci_schema_migrations(version,checksum) VALUES('009_m3_review_dispatch','65a68c9095c90a388532bb656e87cdbf4e1d1b5cd8a7f4356f02e9328f089e47');
END $migration$;
COMMIT;
