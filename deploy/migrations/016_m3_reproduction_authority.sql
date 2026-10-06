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
  IF source_body IS NULL OR encode(sha256(convert_to(source_body,'UTF8')),'hex') <> 'a21805bd4674f77f0e0bf717eb045ac9744bbdf95aa83cc72422e1b80526f61f' THEN
    RAISE EXCEPTION 'Migration source checksum mismatch; create an explicit new migration';
  END IF;
  SELECT checksum INTO applied FROM agentci_schema_migrations WHERE version='016_m3_reproduction_authority';
  IF applied IS NOT NULL THEN
    IF applied <> 'a21805bd4674f77f0e0bf717eb045ac9744bbdf95aa83cc72422e1b80526f61f' THEN
      RAISE EXCEPTION 'Applied migration checksum mismatch; create an explicit new migration';
    END IF;
    RETURN;
  END IF;
-- BEGIN CHECKSUMMED MIGRATION BODY
CREATE TABLE agentci_reproduction_config_versions (
 organization_id uuid NOT NULL, repository text NOT NULL CHECK(length(repository) BETWEEN 1 AND 256),
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991), digest text NOT NULL CHECK(digest ~ '^sha256:[a-f0-9]{64}$'),
 config jsonb NOT NULL CHECK(jsonb_typeof(config)='object'), expected jsonb,
 PRIMARY KEY(organization_id,repository,revision)
);
CREATE TRIGGER reproduction_config_immutable BEFORE UPDATE OR DELETE ON agentci_reproduction_config_versions FOR EACH ROW EXECUTE FUNCTION agentci_finding_event_immutable();
CREATE TABLE agentci_reproduction_authority (
 organization_id uuid NOT NULL, repository text NOT NULL, revision bigint NOT NULL,
 PRIMARY KEY(organization_id,repository),
 FOREIGN KEY(organization_id,repository,revision) REFERENCES agentci_reproduction_config_versions(organization_id,repository,revision)
);
CREATE TABLE agentci_reproduction_revocations (
 organization_id uuid NOT NULL, repository text NOT NULL, plan_id uuid NOT NULL, revision bigint NOT NULL,
 PRIMARY KEY(organization_id,repository,plan_id)
);
CREATE TRIGGER reproduction_revocation_immutable BEFORE UPDATE OR DELETE ON agentci_reproduction_revocations FOR EACH ROW EXECUTE FUNCTION agentci_finding_event_immutable();
CREATE TABLE agentci_reproduction_non_execution (
 organization_id uuid NOT NULL, repository text NOT NULL, id uuid NOT NULL, plan_id uuid NOT NULL, operation_id uuid NOT NULL,
 digest text NOT NULL CHECK(digest ~ '^sha256:[a-f0-9]{64}$'), proof jsonb NOT NULL CHECK(jsonb_typeof(proof)='object' AND octet_length(proof::text)<=8192),
 PRIMARY KEY(organization_id,repository,id), UNIQUE(organization_id,repository,plan_id),
 FOREIGN KEY(organization_id,repository,plan_id) REFERENCES agentci_reproduction_plans(organization_id,repository,id),
 FOREIGN KEY(organization_id,repository,operation_id) REFERENCES agentci_reproduction_operations(organization_id,repository,operation_id)
);
CREATE TRIGGER reproduction_non_execution_immutable BEFORE UPDATE OR DELETE ON agentci_reproduction_non_execution FOR EACH ROW EXECUTE FUNCTION agentci_finding_event_immutable();
CREATE FUNCTION agentci_non_execution_authority() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE a record; expected jsonb; latest jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array(NEW.organization_id,NEW.repository,NEW.plan_id,'non-execution-stage')::text,0));
 SELECT p.plan,p.digest,o.operation_id INTO a FROM agentci_reproduction_plans p
 JOIN agentci_reproduction_operations o ON o.organization_id=p.organization_id AND o.repository=p.repository AND o.reproduction_id=p.id
 JOIN agentci_scope s ON s.id=1 AND s.organization_id=p.organization_id AND s.repository=p.repository
 WHERE p.organization_id=NEW.organization_id AND p.repository=NEW.repository AND p.id=NEW.plan_id AND o.operation_id=NEW.operation_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Non-execution authority unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM agentci_eval_jobs WHERE source_organization_id=NEW.organization_id AND repository=NEW.repository AND source_operation_id=NEW.operation_id)
 OR EXISTS(SELECT 1 FROM agentci_reproduction_receipts WHERE organization_id=NEW.organization_id AND repository=NEW.repository AND id=NEW.plan_id)
 THEN RAISE EXCEPTION 'Reproduction already staged'; END IF;
 SELECT event->'finding' INTO latest FROM agentci_finding_events WHERE organization_id=NEW.organization_id AND repository=NEW.repository AND finding_id=a.plan->'finding'->>'id' ORDER BY version DESC LIMIT 1;
 IF latest IS DISTINCT FROM a.plan->'finding' THEN RAISE EXCEPTION 'Non-execution finding version conflict'; END IF;
 IF NEW.proof->>'reason' IS NULL OR NEW.proof->>'reason' NOT IN ('cancelled','input-limit') THEN RAISE EXCEPTION 'Invalid non-execution reason'; END IF;
 IF NEW.proof->>'reason'='cancelled' AND NOT EXISTS(SELECT 1 FROM agentci_reproduction_cancellations WHERE organization_id=NEW.organization_id AND repository=NEW.repository AND id=NEW.plan_id)
 THEN RAISE EXCEPTION 'Durable cancellation required'; END IF;
 expected=jsonb_build_object('schemaVersion','v1alpha1','kind','reproduction-not-started','id',NEW.id::text,'organizationId',NEW.organization_id::text,'repository',NEW.repository,
 'findingId',a.plan->'finding'->>'id','subjectDigest',NEW.proof->>'subjectDigest','queuedVersion',a.plan->'finding'->'version','queuedFindingDigest',NEW.proof->>'queuedFindingDigest',
 'planId',NEW.plan_id::text,'planDigest',a.digest,'reservationOperationId',NEW.operation_id::text,'status',CASE WHEN NEW.proof->>'reason'='cancelled' THEN 'cancelled' ELSE 'unavailable' END,
 'reason',NEW.proof->>'reason','executionReceipt',NULL,'verified',false);
 IF NEW.proof IS DISTINCT FROM expected OR jsonb_typeof(NEW.proof->'subjectDigest') IS DISTINCT FROM 'string' OR jsonb_typeof(NEW.proof->'queuedFindingDigest') IS DISTINCT FROM 'string'
 OR NOT (NEW.proof->>'subjectDigest' ~ '^sha256:[a-f0-9]{64}$') OR NOT (NEW.proof->>'queuedFindingDigest' ~ '^sha256:[a-f0-9]{64}$') THEN RAISE EXCEPTION 'Invalid non-execution proof'; END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER non_execution_authority BEFORE INSERT ON agentci_reproduction_non_execution FOR EACH ROW EXECUTE FUNCTION agentci_non_execution_authority();
CREATE FUNCTION agentci_eval_no_non_execution() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF NEW.source IS NULL THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(jsonb_build_array((NEW.source->>'organizationId')::uuid,NEW.repository,(NEW.source->>'planId')::uuid,'non-execution-stage')::text,0));
 IF EXISTS(SELECT 1 FROM agentci_reproduction_non_execution WHERE organization_id=(NEW.source->>'organizationId')::uuid AND repository=NEW.repository AND plan_id=(NEW.source->>'planId')::uuid)
 THEN RAISE EXCEPTION 'Reproduction has retained non-execution proof'; END IF; RETURN NEW;
END $fn$;
CREATE TRIGGER eval_no_non_execution BEFORE INSERT ON agentci_eval_jobs FOR EACH ROW EXECUTE FUNCTION agentci_eval_no_non_execution();
-- END CHECKSUMMED MIGRATION BODY
  INSERT INTO agentci_schema_migrations(version,checksum) VALUES('016_m3_reproduction_authority','a21805bd4674f77f0e0bf717eb045ac9744bbdf95aa83cc72422e1b80526f61f');
END $migration$;
COMMIT;
