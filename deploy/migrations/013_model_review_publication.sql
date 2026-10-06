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
  IF source_body IS NULL OR encode(sha256(convert_to(source_body,'UTF8')),'hex') <> 'bb4a4ae63ade6c45aaa11413efd25e60f26c30e90e35a557b1ed673aad8c4348' THEN
    RAISE EXCEPTION 'Migration source checksum mismatch; create an explicit new migration';
  END IF;
  SELECT checksum INTO applied FROM agentci_schema_migrations WHERE version='013_model_review_publication';
  IF applied IS NOT NULL THEN
    IF applied <> 'bb4a4ae63ade6c45aaa11413efd25e60f26c30e90e35a557b1ed673aad8c4348' THEN
      RAISE EXCEPTION 'Applied migration checksum mismatch; create an explicit new migration';
    END IF;
    RETURN;
  END IF;
-- BEGIN CHECKSUMMED MIGRATION BODY
CREATE TABLE agentci_model_review_publications (
 organization_id uuid NOT NULL, repository text NOT NULL, id uuid NOT NULL,
 generation bigint NOT NULL DEFAULT 1 CHECK(generation>0),
 acknowledged_generation bigint NOT NULL DEFAULT 0 CHECK(acknowledged_generation>=0 AND acknowledged_generation<=generation),
 lease_token uuid, lease_until timestamptz, leased_generation bigint,
 retry_after timestamptz NOT NULL DEFAULT clock_timestamp(),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 30),
 last_error text CHECK(last_error IN ('unavailable','rate-limit')),
 last_outcome text CHECK(last_outcome IN ('published','superseded')),
 acknowledged_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,repository,id),
 FOREIGN KEY(organization_id,repository,id) REFERENCES agentci_review_admissions(organization_id,repository,id),
 CHECK((lease_token IS NULL AND lease_until IS NULL AND leased_generation IS NULL) OR
       (lease_token IS NOT NULL AND lease_until IS NOT NULL AND leased_generation BETWEEN 1 AND generation))
);
CREATE INDEX model_review_publication_pending ON agentci_model_review_publications(organization_id,repository,retry_after,created_at) WHERE acknowledged_generation<generation;
CREATE TABLE agentci_model_review_publication_cooldowns (
 organization_id uuid NOT NULL, repository text NOT NULL,
 retry_after timestamptz NOT NULL, PRIMARY KEY(organization_id,repository)
);
CREATE FUNCTION agentci_model_review_publication_identity() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Immutable publication identity'; END IF;
 IF (NEW.organization_id,NEW.repository,NEW.id,NEW.created_at) IS DISTINCT FROM (OLD.organization_id,OLD.repository,OLD.id,OLD.created_at)
    OR NEW.generation<OLD.generation OR NEW.acknowledged_generation<OLD.acknowledged_generation THEN
  RAISE EXCEPTION 'Immutable publication identity';
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER model_review_publication_identity BEFORE UPDATE OR DELETE ON agentci_model_review_publications FOR EACH ROW EXECUTE FUNCTION agentci_model_review_publication_identity();
CREATE FUNCTION agentci_enqueue_model_review_publication() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF TG_TABLE_NAME='agentci_review_admission_outbox' AND TG_OP='UPDATE' THEN
  IF (NEW.run_id IS NOT NULL OR NEW.dispatched_at IS NOT NULL,NEW.cancel_requested_at IS NOT NULL,NEW.terminal_status,NEW.terminal_digest)
     IS NOT DISTINCT FROM (OLD.run_id IS NOT NULL OR OLD.dispatched_at IS NOT NULL,OLD.cancel_requested_at IS NOT NULL,OLD.terminal_status,OLD.terminal_digest) THEN RETURN NEW; END IF;
 END IF;
 INSERT INTO agentci_model_review_publications(organization_id,repository,id) VALUES(NEW.organization_id,NEW.repository,NEW.id)
 ON CONFLICT(organization_id,repository,id) DO UPDATE SET generation=agentci_model_review_publications.generation+1;
 -- Keep an active lease and previous failure cooldown: new evidence does not
 -- authorize an early retry or erase a claimed generation awaiting acknowledgement.
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER model_review_publication_dispatch AFTER INSERT OR UPDATE OF run_id,dispatched_at,cancel_requested_at,terminal_status,terminal_digest ON agentci_review_admission_outbox FOR EACH ROW EXECUTE FUNCTION agentci_enqueue_model_review_publication();
CREATE TRIGGER model_review_publication_summary AFTER INSERT ON agentci_review_execution_summaries FOR EACH ROW EXECUTE FUNCTION agentci_enqueue_model_review_publication();
-- Upgrade existing admissions once; rerunning the checksum-verified migration is a no-op.
INSERT INTO agentci_model_review_publications(organization_id,repository,id) SELECT organization_id,repository,id FROM agentci_review_admission_outbox;
-- END CHECKSUMMED MIGRATION BODY
  INSERT INTO agentci_schema_migrations(version,checksum) VALUES('013_model_review_publication','bb4a4ae63ade6c45aaa11413efd25e60f26c30e90e35a557b1ed673aad8c4348');
END $migration$;
COMMIT;
