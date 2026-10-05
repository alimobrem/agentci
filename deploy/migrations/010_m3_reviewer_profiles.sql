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
  IF source_body IS NULL OR encode(sha256(convert_to(source_body,'UTF8')),'hex') <> 'a9b229158ab023792af2a5aa6b9caa9c9e829c8b4620e80f0ddf5acfb8f2cb0b' THEN
    RAISE EXCEPTION 'Migration source checksum mismatch; create an explicit new migration';
  END IF;
  SELECT checksum INTO applied FROM agentci_schema_migrations WHERE version='010_m3_reviewer_profiles';
  IF applied IS NOT NULL THEN
    IF applied <> 'a9b229158ab023792af2a5aa6b9caa9c9e829c8b4620e80f0ddf5acfb8f2cb0b' THEN
      RAISE EXCEPTION 'Applied migration checksum mismatch; create an explicit new migration';
    END IF;
    RETURN;
  END IF;
-- BEGIN CHECKSUMMED MIGRATION BODY
CREATE TABLE agentci_reviewer_profiles (
 organization_id uuid NOT NULL,
 repository text NOT NULL,
 id text NOT NULL,
 revision text NOT NULL CHECK(revision ~ '^sha256:[a-f0-9]{64}$'),
 profile jsonb NOT NULL CHECK(jsonb_typeof(profile)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revoked_at timestamptz,
 PRIMARY KEY(organization_id,repository,id,revision)
);
CREATE FUNCTION agentci_reviewer_profile_identity() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Immutable reviewer profile'; END IF;
 IF (NEW.organization_id,NEW.repository,NEW.id,NEW.revision,NEW.profile,NEW.created_at) IS DISTINCT FROM
    (OLD.organization_id,OLD.repository,OLD.id,OLD.revision,OLD.profile,OLD.created_at)
    OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
   RAISE EXCEPTION 'Immutable reviewer profile';
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER reviewer_profile_identity BEFORE UPDATE OR DELETE ON agentci_reviewer_profiles
 FOR EACH ROW EXECUTE FUNCTION agentci_reviewer_profile_identity();
-- END CHECKSUMMED MIGRATION BODY
  INSERT INTO agentci_schema_migrations(version,checksum) VALUES('010_m3_reviewer_profiles','a9b229158ab023792af2a5aa6b9caa9c9e829c8b4620e80f0ddf5acfb8f2cb0b');
END $migration$;
COMMIT;
