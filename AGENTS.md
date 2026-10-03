# AgentCI development workflow

- Follow the primary spec in milestone order. M1 remains in progress; do not start
  M2 until M1's tests, evals, packaging, docs, publication, download verification,
  release and user demo gates pass. Use `docs/definition-of-done.md`.
- Before new implementation, add or start a small task in `delivery/tasks.json`
  with requirement IDs and observable acceptance criteria. Use the delivery CLI
  for transitions; preserve blocker, acceptance, completion and rework events.
  Do not invent start dates for work done before tracking began.
- Use `npm run check:fast` for local feedback. It does not replace applicable
  integration, API compatibility, packaging, container or release checks.
- Keep API/domain contracts and shared fixtures synchronized. Map every operation
  to requirements/scenarios. Do not update a compatibility baseline to conceal
  a breaking change; document its version/migration decision.
- On adoption or milestone release, verify current stable dependencies/runtimes
  against official sources. Pin lockfiles, image digests and action commits.
  Service images use UBI. Test native Temporal compatibility on runtime updates.
- Collect completed CI attempts with `npm run delivery -- collect-ci RUN-ID
  optimized CACHE-STATE`; preserve failed attempts. Label cache state from logs.
  Report local feedback, full CI, cycle time, blockers and quality separately.
  Never equate a faster check with proven total delivery acceleration.
- Never commit `.env`, App keys, local credential files or artifact logs containing
  credentials. App access stays limited to `alimobrem/agentci`. The temporary
  tunnel is a development endpoint; reliable every-PR operation is a release gate.
- Give the user meaningful progress updates about once a minute during active
  work, and a released-build success/failure demo at each phase completion.
