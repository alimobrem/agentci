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
  IF source_body IS NULL OR encode(sha256(convert_to(source_body,'UTF8')),'hex') <> '7ec92949bffd273970423c7201627a9582d2f8d64c05c8acaa67d3917a14048f' THEN
    RAISE EXCEPTION 'Migration source checksum mismatch; create an explicit new migration';
  END IF;
  SELECT checksum INTO applied FROM agentci_schema_migrations WHERE version='017_m3_reproduction_dispatch_state';
  IF applied IS NOT NULL THEN
    IF applied <> '7ec92949bffd273970423c7201627a9582d2f8d64c05c8acaa67d3917a14048f' THEN
      RAISE EXCEPTION 'Applied migration checksum mismatch; create an explicit new migration';
    END IF;
    RETURN;
  END IF;
-- BEGIN CHECKSUMMED MIGRATION BODY
CREATE TABLE agentci_reproduction_dispatch_state (
 organization_id uuid NOT NULL, repository text NOT NULL, operation_id uuid NOT NULL,
 binding jsonb, binding_digest text, attempt_token uuid,
 run_id uuid, acknowledged_at timestamptz,
 lease_token uuid, lease_until timestamptz, retry_after timestamptz,
 cancellation_cause text CHECK(cancellation_cause IN ('user','revoked','expired','permission-denied')),
 cancellation_at timestamptz,
 PRIMARY KEY(organization_id,repository,operation_id),
 FOREIGN KEY(organization_id,repository,operation_id) REFERENCES agentci_reproduction_dispatch_intents(organization_id,repository,operation_id),
 CHECK ((binding IS NULL AND binding_digest IS NULL) OR (binding IS NOT NULL AND jsonb_typeof(binding)='object' AND binding_digest IS NOT NULL AND binding_digest ~ '^sha256:[a-f0-9]{64}$')),
 CHECK ((lease_token IS NULL)=(lease_until IS NULL)),
 CHECK ((cancellation_cause IS NULL)=(cancellation_at IS NULL)),
 CHECK (run_id IS NULL OR (binding IS NOT NULL AND attempt_token IS NOT NULL)),
 CHECK ((acknowledged_at IS NULL)=(run_id IS NULL)),
 CHECK ((binding IS NULL)=(attempt_token IS NULL))
);
CREATE TABLE agentci_reproduction_dispatch_attempts (
 organization_id uuid NOT NULL, repository text NOT NULL, operation_id uuid NOT NULL, token uuid NOT NULL,
 binding_digest text NOT NULL CHECK(binding_digest ~ '^sha256:[a-f0-9]{64}$'),
 config_revision bigint NOT NULL CHECK(config_revision>0), config_digest text NOT NULL CHECK(config_digest ~ '^sha256:[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,repository,operation_id,token),
 FOREIGN KEY(organization_id,repository,operation_id) REFERENCES agentci_reproduction_dispatch_state(organization_id,repository,operation_id),
 FOREIGN KEY(organization_id,repository,config_revision) REFERENCES agentci_reproduction_config_versions(organization_id,repository,revision)
);
ALTER TABLE agentci_reproduction_dispatch_state ADD FOREIGN KEY(organization_id,repository,operation_id,attempt_token) REFERENCES agentci_reproduction_dispatch_attempts(organization_id,repository,operation_id,token);
CREATE FUNCTION agentci_reproduction_dispatch_attempt_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN RAISE EXCEPTION 'Immutable reproduction dispatch attempt'; END $fn$;
CREATE TRIGGER reproduction_dispatch_attempt_guard BEFORE UPDATE OR DELETE ON agentci_reproduction_dispatch_attempts FOR EACH ROW EXECUTE FUNCTION agentci_reproduction_dispatch_attempt_guard();
CREATE FUNCTION agentci_reproduction_dispatch_state_guard() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Retained reproduction dispatch'; END IF;
 IF ROW(NEW.organization_id,NEW.repository,NEW.operation_id) IS DISTINCT FROM ROW(OLD.organization_id,OLD.repository,OLD.operation_id)
 OR (OLD.binding IS NOT NULL AND ROW(NEW.binding,NEW.binding_digest) IS DISTINCT FROM ROW(OLD.binding,OLD.binding_digest))
 OR (OLD.run_id IS NOT NULL AND ROW(NEW.run_id,NEW.attempt_token) IS DISTINCT FROM ROW(OLD.run_id,OLD.attempt_token))
 OR (OLD.acknowledged_at IS NOT NULL AND NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at)
 OR (OLD.cancellation_at IS NOT NULL AND ROW(NEW.cancellation_at,NEW.cancellation_cause) IS DISTINCT FROM ROW(OLD.cancellation_at,OLD.cancellation_cause))
 THEN RAISE EXCEPTION 'Immutable reproduction dispatch identity'; END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER reproduction_dispatch_state_guard BEFORE UPDATE OR DELETE ON agentci_reproduction_dispatch_state FOR EACH ROW EXECUTE FUNCTION agentci_reproduction_dispatch_state_guard();
INSERT INTO agentci_reproduction_dispatch_state(organization_id,repository,operation_id)
 SELECT organization_id,repository,operation_id FROM agentci_reproduction_dispatch_intents ON CONFLICT DO NOTHING;
-- END CHECKSUMMED MIGRATION BODY
  INSERT INTO agentci_schema_migrations(version,checksum) VALUES('017_m3_reproduction_dispatch_state','7ec92949bffd273970423c7201627a9582d2f8d64c05c8acaa67d3917a14048f');
END $migration$;
COMMIT;
