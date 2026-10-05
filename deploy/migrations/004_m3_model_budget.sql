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
  IF source_body IS NULL OR encode(sha256(convert_to(source_body,'UTF8')),'hex') <> '3c685adcae8820ecc89d00ff15be9e5a50225ba4a9419bfcb522cca25869d197' THEN
    RAISE EXCEPTION 'Migration source checksum mismatch; create an explicit new migration';
  END IF;
  SELECT checksum INTO applied FROM agentci_schema_migrations WHERE version='004_m3_model_budget';
  IF applied IS NOT NULL THEN
    IF applied <> '3c685adcae8820ecc89d00ff15be9e5a50225ba4a9419bfcb522cca25869d197' THEN
      RAISE EXCEPTION 'Applied migration checksum mismatch; create an explicit new migration';
    END IF;
    RETURN;
  END IF;
-- BEGIN CHECKSUMMED MIGRATION BODY
CREATE TABLE agentci_model_budgets (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  repository text NOT NULL CHECK(length(repository) BETWEEN 1 AND 255),
  limit_usd_micros bigint NOT NULL CHECK(limit_usd_micros BETWEEN 1 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE agentci_model_attempts (
  id uuid PRIMARY KEY,
  budget_id uuid NOT NULL REFERENCES agentci_model_budgets(id),
  request_id uuid NOT NULL,
  request_digest text NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
  attempt integer NOT NULL CHECK(attempt BETWEEN 1 AND 5),
  reserved_usd_micros bigint NOT NULL CHECK(reserved_usd_micros BETWEEN 1 AND 9007199254740991),
  pricing_revision text NOT NULL CHECK(length(pricing_revision) BETWEEN 1 AND 256),
  state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','unknown','settled','released')),
  actual_usd_micros bigint CHECK(actual_usd_micros BETWEEN 0 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(budget_id,request_id,attempt),
  CHECK((state='settled')=(actual_usd_micros IS NOT NULL))
);
CREATE FUNCTION agentci_model_budget_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Immutable model budget; create a new explicit budget'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER agentci_model_budget_immutable BEFORE UPDATE ON agentci_model_budgets FOR EACH ROW EXECUTE FUNCTION agentci_model_budget_immutable();
CREATE FUNCTION agentci_model_attempt_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.id,NEW.budget_id,NEW.request_id,NEW.request_digest,NEW.attempt,NEW.reserved_usd_micros,NEW.pricing_revision,NEW.created_at)
     IS DISTINCT FROM ROW(OLD.id,OLD.budget_id,OLD.request_id,OLD.request_digest,OLD.attempt,OLD.reserved_usd_micros,OLD.pricing_revision,OLD.created_at)
     OR OLD.state IN ('settled','released') AND NEW IS DISTINCT FROM OLD
     OR OLD.state='unknown' AND NEW.state NOT IN ('unknown','settled') THEN
    RAISE EXCEPTION 'Immutable model attempt identity or terminal accounting';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER agentci_model_attempt_immutable BEFORE UPDATE ON agentci_model_attempts FOR EACH ROW EXECUTE FUNCTION agentci_model_attempt_immutable();
-- END CHECKSUMMED MIGRATION BODY
  INSERT INTO agentci_schema_migrations(version,checksum) VALUES('004_m3_model_budget','3c685adcae8820ecc89d00ff15be9e5a50225ba4a9419bfcb522cca25869d197');
END $migration$;
COMMIT;
