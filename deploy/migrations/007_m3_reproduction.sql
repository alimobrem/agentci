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
  IF source_body IS NULL OR encode(sha256(convert_to(source_body,'UTF8')),'hex') <> 'f77c293791237f487b33e0a0691bbb1658ea570939fa99f78570aa89fb038413' THEN
    RAISE EXCEPTION 'Migration source checksum mismatch; create an explicit new migration';
  END IF;
  SELECT checksum INTO applied FROM agentci_schema_migrations WHERE version='007_m3_reproduction';
  IF applied IS NOT NULL THEN
    IF applied <> 'f77c293791237f487b33e0a0691bbb1658ea570939fa99f78570aa89fb038413' THEN
      RAISE EXCEPTION 'Applied migration checksum mismatch; create an explicit new migration';
    END IF;
    RETURN;
  END IF;
-- BEGIN CHECKSUMMED MIGRATION BODY
CREATE TABLE agentci_reproduction_plans (
  organization_id uuid NOT NULL,
  repository text NOT NULL,
  id uuid NOT NULL,
  finding_id text NOT NULL,
  finding_version integer NOT NULL,
  digest text NOT NULL CHECK(digest ~ '^sha256:[a-f0-9]{64}$'),
  plan jsonb NOT NULL CHECK(jsonb_typeof(plan)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(organization_id,repository,id),
  UNIQUE(organization_id,repository,finding_id,finding_version),
  FOREIGN KEY(organization_id,repository,finding_id,finding_version)
    REFERENCES agentci_finding_events(organization_id,repository,finding_id,version)
);
CREATE TABLE agentci_reproduction_cancellations (
  organization_id uuid NOT NULL,
  repository text NOT NULL,
  id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(organization_id,repository,id),
  FOREIGN KEY(organization_id,repository,id) REFERENCES agentci_reproduction_plans(organization_id,repository,id)
);
CREATE TRIGGER reproduction_cancellation_immutable BEFORE UPDATE OR DELETE ON agentci_reproduction_cancellations
  FOR EACH ROW EXECUTE FUNCTION agentci_finding_event_immutable();
CREATE TABLE agentci_reproduction_receipts (
  organization_id uuid NOT NULL,
  repository text NOT NULL,
  id uuid NOT NULL,
  unit_id uuid NOT NULL REFERENCES agentci_eval_units(id),
  digest text NOT NULL CHECK(digest ~ '^sha256:[a-f0-9]{64}$'),
  receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(organization_id,repository,id),
  FOREIGN KEY(organization_id,repository,id) REFERENCES agentci_reproduction_plans(organization_id,repository,id)
);
CREATE TRIGGER reproduction_plan_immutable BEFORE UPDATE OR DELETE ON agentci_reproduction_plans
  FOR EACH ROW EXECUTE FUNCTION agentci_finding_event_immutable();
CREATE TRIGGER reproduction_receipt_immutable BEFORE UPDATE OR DELETE ON agentci_reproduction_receipts
  FOR EACH ROW EXECUTE FUNCTION agentci_finding_event_immutable();
-- END CHECKSUMMED MIGRATION BODY
  INSERT INTO agentci_schema_migrations(version,checksum) VALUES('007_m3_reproduction','f77c293791237f487b33e0a0691bbb1658ea570939fa99f78570aa89fb038413');
END $migration$;
COMMIT;
