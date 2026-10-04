# M1 released-build demo

Date: 2026-10-03. Version: `0.2.0-m1`. Released source:
`620230fd49d09e788d9a6a2783b57428882f5927`.
[Immutable release](https://github.com/alimobrem/agentci/releases/tag/v0.2.0-m1).
[Machine-readable observations](../../releases/m1-demo.json) and
[downloaded CLI observations](../../releases/m1-cli-demo.json).

The synthetic [PR #2](https://github.com/alimobrem/agentci/pull/2) was closed without
merging. Its permission declarations grant no actual access.

1. Adding an explicit production `write` declaration produced high risk and a
   **verified** `production-mutation-added` finding. Generic configuration changes
   remained **inferred**. A neutral Check means advisory analysis, not proven safety.
2. Replacing the action with unsupported `administrator` produced an
   [action-required Check](https://github.com/alimobrem/agentci/runs/111318932679).
   The [expected-negative run](https://github.com/alimobrem/agentci/actions/runs/37162370181)
   failed after retries; it never reported a clean review. The public installed CLI
   rejected the same commit with exit 2.
3. Correcting the declaration produced the
   [recovered high-risk advisory Check](https://github.com/alimobrem/agentci/runs/111320361891).
   The signed webhook was processed by the published worker image, persisted in
   PostgreSQL and completed Temporal workflow
   `agentci:alimobrem/agentci:35e4aad0-bf85-11f1-862f-567677eda2f5` with `published`.
   Evidence `bd2e19db-0675-4417-b0b4-ba67c8e4fad9` identifies the exact commits and
   producer `agentci` version `0.2.0-m1`. Its canonical SHA-256 was verified.
   Local evidence access returned 401 without credentials and 200 with the bearer
   token. Authentication was tested on localhost.

The [GitHub-hosted positive run](https://github.com/alimobrem/agentci/actions/runs/37162182152)
used trusted main-branch code and the repository-only App. It uploaded evidence
before publishing its Check. PR events, main updates, manual dispatch and the
30-minute recovery schedule reconcile open PRs independently of the laptop.
GitHub scheduling and outages can delay coverage; this is advisory CI, not an SLA.
Hosted artifacts require GitHub authentication and expire after 90 days. The
release's verification archive preserves the recorded demo evidence.

## Repeat the released CLI demo

Requires Node 26.10.0 and npm. In a clean temporary directory:

```sh
curl -fL -o agentci-0.2.0-m1.tgz https://github.com/alimobrem/agentci/releases/download/v0.2.0-m1/agentci-0.2.0-m1.tgz
# Verify c60ae3d03ed4f226815b1cf9fc24392c61373d1beac7a03be29b02e66cacf49b before installing.
npm init -y
npm install --omit=dev ./agentci-0.2.0-m1.tgz
git clone https://github.com/alimobrem/agentci.git agentci-demo
cd agentci-demo
git fetch origin codex/m1-demo
../node_modules/.bin/agentci diff --root . --base 620230fd49d09e788d9a6a2783b57428882f5927 --head 8cc818f469808df7235252cdd1a93475957ac0f1 --repository alimobrem/agentci
../node_modules/.bin/agentci diff --root . --base 620230fd49d09e788d9a6a2783b57428882f5927 --head a74fb3651c96e84593acfd5835100524ec4f9fe9 --repository alimobrem/agentci
```

The second diff intentionally exits 2. The first reports high risk with an explicit
production mutation. M1 performs bounded data analysis; it executes no PR scripts,
hooks, dependency installations or behavioral evaluations. M2 remains not-started.
The local worker was stopped after the demo so hosted artifact links remain the
canonical ongoing dogfood output; the local API and persisted evidence remain.
