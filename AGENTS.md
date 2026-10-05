# AgentCI development workflow

- Follow the primary spec in milestone order. M0 and expanded M1 have published release
  evidence. M2 has published acceptance and a final closure record; start M3 only
  after that closure change is merged and all M2 gates pass. Finish
  each phase's tests, evals, packaging, docs, publication, download verification,
  release and user demo gates before the next. Use `docs/definition-of-done.md`.
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
  credentials. The original App stays limited to `alimobrem/agentci`. The user-approved separate
  onboarding App is limited to `alimobrem/agentci-onboarding-demo`. The temporary
  tunnel is a development endpoint; reliable every-PR operation is a release gate.
- Give the user meaningful progress updates about once a minute during active
  work, and a released-build success/failure demo at each phase completion.

- Prefer Red Hat technologies where they meet the requirement: UBI service images,
  Podman container execution, Buildah/Skopeo image tooling, and Tekton/OpenShift
  in their planned integration phases. Keep justified interoperable fallbacks.
  The owner approved Docker as the M2 release default; retain Podman adoption
  tracking until security, stability and hosted acceptance pass. Podman default
  adoption requires real execution/isolation/recovery acceptance;
  a Docker-compatible CLI/API alone does not prove support. Preserve milestone order.
