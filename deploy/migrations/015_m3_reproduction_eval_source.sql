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
  IF source_body IS NULL OR encode(sha256(convert_to(source_body,'UTF8')),'hex') <> '4d3413603d206d59660122d7be8ba31bfc2c44174f58c52ab3d6bc7e2a3c987d' THEN
    RAISE EXCEPTION 'Migration source checksum mismatch; create an explicit new migration';
  END IF;
  SELECT checksum INTO applied FROM agentci_schema_migrations WHERE version='015_m3_reproduction_eval_source';
  IF applied IS NOT NULL THEN
    IF applied <> '4d3413603d206d59660122d7be8ba31bfc2c44174f58c52ab3d6bc7e2a3c987d' THEN
      RAISE EXCEPTION 'Applied migration checksum mismatch; create an explicit new migration';
    END IF;
    RETURN;
  END IF;
-- BEGIN CHECKSUMMED MIGRATION BODY
ALTER TABLE agentci_eval_jobs ALTER COLUMN review_id DROP NOT NULL;
ALTER TABLE agentci_eval_jobs ADD COLUMN source jsonb;
ALTER TABLE agentci_eval_jobs ADD COLUMN source_base_canonical text;
ALTER TABLE agentci_eval_jobs ADD COLUMN source_head_canonical text;
ALTER TABLE agentci_eval_jobs ADD COLUMN source_definition_canonical text;
ALTER TABLE agentci_eval_jobs ADD COLUMN source_payload_canonical text;
ALTER TABLE agentci_eval_jobs ADD COLUMN source_organization_id uuid GENERATED ALWAYS AS ((source->>'organizationId')::uuid) STORED;
ALTER TABLE agentci_eval_jobs ADD COLUMN source_operation_id uuid GENERATED ALWAYS AS ((source->>'operationId')::uuid) STORED;
ALTER TABLE agentci_eval_jobs ADD CONSTRAINT eval_source_union CHECK (
 (source IS NULL AND review_id IS NOT NULL AND source_base_canonical IS NULL AND source_head_canonical IS NULL AND source_definition_canonical IS NULL AND source_payload_canonical IS NULL)
 OR (source IS NOT NULL AND review_id IS NULL AND jsonb_typeof(source)='object'
 AND source ?& ARRAY['schemaVersion','kind','organizationId','admissionId','operationId','planId','planDigest','requestDigest','inputDigests','definitionDigest']
 AND (source-ARRAY['schemaVersion','kind','organizationId','admissionId','operationId','planId','planDigest','requestDigest','inputDigests','definitionDigest'])='{}'::jsonb
 AND source->>'schemaVersion'='v1alpha1' AND source->>'kind'='finding-reproduction'
 AND source_organization_id IS NOT NULL AND source_operation_id IS NOT NULL
 AND source_base_canonical IS NOT NULL AND source_head_canonical IS NOT NULL AND source_definition_canonical IS NOT NULL AND source_payload_canonical IS NOT NULL
 AND octet_length(source_payload_canonical)<=33554432)
);
ALTER TABLE agentci_eval_jobs ADD CONSTRAINT eval_source_operation_fk FOREIGN KEY(source_organization_id,repository,source_operation_id)
 REFERENCES agentci_reproduction_operations(organization_id,repository,operation_id);
CREATE UNIQUE INDEX eval_reproduction_operation ON agentci_eval_jobs(source_organization_id,repository,source_operation_id) WHERE source IS NOT NULL;
CREATE FUNCTION agentci_eval_reproduction_authority() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE authority record; expected_source jsonb; expected_plan jsonb; payload jsonb;
BEGIN
 IF NEW.source IS NULL THEN RETURN NEW; END IF;
 IF NEW.review_id IS NOT NULL OR jsonb_typeof(NEW.source) IS DISTINCT FROM 'object'
 OR NOT NEW.source ?& ARRAY['schemaVersion','kind','organizationId','admissionId','operationId','planId','planDigest','requestDigest','inputDigests','definitionDigest']
 OR EXISTS(SELECT 1 FROM jsonb_each(NEW.source) e WHERE e.key<>'inputDigests' AND jsonb_typeof(e.value) IS DISTINCT FROM 'string')
 OR jsonb_typeof(NEW.source->'inputDigests') IS DISTINCT FROM 'object'
 OR NEW.source_base_canonical IS NULL OR NEW.source_head_canonical IS NULL OR NEW.source_definition_canonical IS NULL OR NEW.source_payload_canonical IS NULL THEN RAISE EXCEPTION 'Invalid reproduction eval source'; END IF;
 SELECT o.organization_id,o.operation_id,o.request_digest,o.result,p.id,p.digest,p.plan,a.id AS admission_id,a.request AS admission_request INTO authority
 FROM agentci_reproduction_operations o
 JOIN agentci_reproduction_plans p ON p.organization_id=o.organization_id AND p.repository=o.repository AND p.id=o.reproduction_id
 JOIN agentci_review_admissions a ON a.organization_id=o.organization_id AND a.repository=o.repository AND a.id=(p.plan->'approval'->>'reviewId')::uuid
 JOIN agentci_scope s ON s.id=1 AND s.organization_id=o.organization_id AND s.repository=o.repository
 WHERE o.organization_id=(NEW.source->>'organizationId')::uuid AND o.repository=NEW.repository AND o.operation_id=(NEW.source->>'operationId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reproduction eval authority unavailable'; END IF;
 expected_source=jsonb_build_object('schemaVersion','v1alpha1','kind','finding-reproduction','organizationId',authority.organization_id::text,
 'admissionId',authority.admission_id::text,'operationId',authority.operation_id::text,'planId',authority.id::text,'planDigest',authority.digest,
 'requestDigest',authority.request_digest,'inputDigests',authority.plan->'inputs',
 'definitionDigest','sha256:'||encode(sha256(convert_to(NEW.source_definition_canonical,'UTF8')),'hex'));
 expected_plan=jsonb_build_object('units',jsonb_build_array(authority.plan->'definition'),'suiteChanges','[]'::jsonb,'coverageGaps','[]'::jsonb,'selectionGaps','[]'::jsonb);
 payload=jsonb_build_object('source',expected_source,'attemptKey',NEW.attempt_key::text,'repository',NEW.repository,'pullRequest',NEW.pull_request,'inputs',NEW.inputs,'plan',NEW.plan);
 IF NEW.source IS DISTINCT FROM expected_source OR NEW.attempt_key<>authority.id
 OR authority.plan->'finding'->'subject' IS DISTINCT FROM authority.admission_request->'subject'
 OR NEW.repository IS DISTINCT FROM authority.plan->'finding'->'subject'->>'repository'
 OR NEW.pull_request IS DISTINCT FROM (authority.plan->'finding'->'subject'->>'pullRequest')::integer
 OR NEW.base_sha IS DISTINCT FROM authority.plan->'finding'->'subject'->>'baseSha'
 OR NEW.head_sha IS DISTINCT FROM authority.plan->'finding'->'subject'->>'headSha'
 OR NEW.inputs->'base'->'snapshot'->>'sha' IS DISTINCT FROM NEW.base_sha
 OR NEW.inputs->'head'->'snapshot'->>'sha' IS DISTINCT FROM NEW.head_sha
 OR NEW.source_base_canonical::jsonb IS DISTINCT FROM NEW.inputs->'base'->'snapshot'->'files'
 OR NEW.source_head_canonical::jsonb IS DISTINCT FROM NEW.inputs->'head'->'snapshot'->'files'
 OR 'sha256:'||encode(sha256(convert_to(NEW.source_base_canonical,'UTF8')),'hex') IS DISTINCT FROM authority.plan->'inputs'->>'base'
 OR 'sha256:'||encode(sha256(convert_to(NEW.source_head_canonical,'UTF8')),'hex') IS DISTINCT FROM authority.plan->'inputs'->>'head'
 OR NEW.source_definition_canonical::jsonb IS DISTINCT FROM authority.plan->'definition'
 OR NEW.plan IS DISTINCT FROM expected_plan OR NEW.source_payload_canonical::jsonb IS DISTINCT FROM payload
 OR NEW.digest IS DISTINCT FROM 'sha256:'||encode(sha256(convert_to(NEW.source_payload_canonical,'UTF8')),'hex')
 OR authority.result->>'reviewId' IS DISTINCT FROM authority.admission_id::text
 OR authority.result->>'planDigest' IS DISTINCT FROM authority.digest THEN RAISE EXCEPTION 'Reproduction eval authority mismatch'; END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER eval_reproduction_authority BEFORE INSERT ON agentci_eval_jobs FOR EACH ROW EXECUTE FUNCTION agentci_eval_reproduction_authority();
CREATE FUNCTION agentci_eval_source_immutable() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF ROW(NEW.source,NEW.source_base_canonical,NEW.source_head_canonical,NEW.source_definition_canonical,NEW.source_payload_canonical)
 IS DISTINCT FROM ROW(OLD.source,OLD.source_base_canonical,OLD.source_head_canonical,OLD.source_definition_canonical,OLD.source_payload_canonical)
 THEN RAISE EXCEPTION 'Immutable eval source'; END IF; RETURN NEW;
END $fn$;
CREATE TRIGGER eval_source_immutable BEFORE UPDATE ON agentci_eval_jobs FOR EACH ROW EXECUTE FUNCTION agentci_eval_source_immutable();
CREATE FUNCTION agentci_eval_reproduction_unit_authority() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE job record;
BEGIN
 SELECT source,plan INTO job FROM agentci_eval_jobs WHERE id=NEW.job_id;
 IF job.source IS NULL THEN RETURN NEW; END IF;
 IF NEW.definition IS DISTINCT FROM job.plan->'units'->0 OR NEW.digest IS DISTINCT FROM job.source->>'definitionDigest'
 OR NEW.suite_id IS DISTINCT FROM NEW.definition->'suite'->'metadata'->>'id' OR NEW.model_key<>''
 OR NEW.side IS DISTINCT FROM NEW.definition->>'side' THEN RAISE EXCEPTION 'Reproduction unit authority mismatch'; END IF; RETURN NEW;
END $fn$;
CREATE TRIGGER eval_reproduction_unit_authority BEFORE INSERT ON agentci_eval_units FOR EACH ROW EXECUTE FUNCTION agentci_eval_reproduction_unit_authority();
-- END CHECKSUMMED MIGRATION BODY
  INSERT INTO agentci_schema_migrations(version,checksum) VALUES('015_m3_reproduction_eval_source','4d3413603d206d59660122d7be8ba31bfc2c44174f58c52ab3d6bc7e2a3c987d');
END $migration$;
COMMIT;
