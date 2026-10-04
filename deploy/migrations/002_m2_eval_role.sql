-- Administrator-only optional setup, run after 002_m2.sql. Do not give the evaluator the migration/admin login.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentci_eval_executor') THEN
    CREATE ROLE agentci_eval_executor NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='agentci_eval_executor' AND (rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Unsafe pre-existing eval executor role';
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO agentci_eval_executor;
GRANT SELECT ON agentci_scope,agentci_eval_jobs,agentci_eval_units,agentci_eval_trials TO agentci_eval_executor;
GRANT UPDATE(status,lease_token,lease_until,result,result_digest,completed_at) ON agentci_eval_units TO agentci_eval_executor;
GRANT INSERT ON agentci_eval_trials TO agentci_eval_executor;
-- Create a separately provisioned LOGIN role and grant this group to it. No password belongs in source.
COMMIT;
