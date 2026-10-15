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
  IF source_body IS NULL OR encode(sha256(convert_to(source_body,'UTF8')),'hex') <> '2e7e2d035991ff56ce23f8d285eea55257a5123813db9e856e828175ecd7e0ce' THEN
    RAISE EXCEPTION 'Migration source checksum mismatch; create an explicit new migration';
  END IF;
  SELECT checksum INTO applied FROM agentci_schema_migrations WHERE version='021_m3_review_intents';
  IF applied IS NOT NULL THEN
    IF applied <> '2e7e2d035991ff56ce23f8d285eea55257a5123813db9e856e828175ecd7e0ce' THEN
      RAISE EXCEPTION 'Applied migration checksum mismatch; create an explicit new migration';
    END IF;
    RETURN;
  END IF;
-- BEGIN CHECKSUMMED MIGRATION BODY
CREATE TABLE agentci_review_intents (
 review_id uuid PRIMARY KEY REFERENCES agentci_reviews(id), organization_id uuid NOT NULL, repository text NOT NULL,
 digest text NOT NULL CHECK(digest ~ '^sha256:[a-f0-9]{64}$'), record jsonb NOT NULL CHECK(jsonb_typeof(record)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION agentci_review_intent_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Immutable retained intent';
END $$;
CREATE TRIGGER review_intent_immutable BEFORE UPDATE OR DELETE ON agentci_review_intents
 FOR EACH ROW EXECUTE FUNCTION agentci_review_intent_immutable();
-- END CHECKSUMMED MIGRATION BODY
  INSERT INTO agentci_schema_migrations(version,checksum) VALUES('021_m3_review_intents','2e7e2d035991ff56ce23f8d285eea55257a5123813db9e856e828175ecd7e0ce');
END $migration$;
COMMIT;
