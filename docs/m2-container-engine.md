# M2 container-engine decision

On 2026-10-04 the owner approved: “Use Docker for M2 (Recommended).” This changes
the release default, following explicit assessment of Podman adoption work; it
does not reduce M2's eval, isolation, API, recovery or release requirements.

The runner, evaluator configuration, Compose deployment and trusted hosted path
select Docker by default. The `eval-worker` UBI build target packages only the
pinned Docker CLI. `eval-worker-podman` is a separate development target with the
pinned Podman client. The shared application and operator engine abstraction
remain intact. A worker configured for a client absent from its image fails before
connecting to database or Temporal services. Engine sockets stay on dedicated
evaluator infrastructure; eval children receive no socket or App credentials.

Podman native execution and recovery evidence is retained. Its two HIGH gRPC
findings, intermittent runner infrastructure failure and incomplete hosted
acceptance remain open in tracked tasks. Podman is not claimed as released or
supported by completing Docker acceptance. Its preferred future adoption requires
all applicable security, native execution, recovery, platform and hosted gates.
The separate development image is not a published supported M2 artifact.

The delivery ledger marks the Podman adoption/stability tasks `deferred`, with
this approved decision as evidence. Their starts, pending acceptance and failed
attempts are preserved. Deferral emits an event and has no completion timestamp;
it is excluded from completed cycle-time samples and does not inflate blocker
time. A later `task TASK-ID start` resumes work while retaining deferral history.

Docker remains subject to full native and packaged execution/recovery checks,
source and vulnerability coverage, platform publication and anonymous download
verification. This decision does not waive other findings, live customer/hosted
PR acceptance, release documentation, the released-build demo or retrospective.
Red Hat UBI remains the service base, and the Red Hat technology preference
continues where requirements and release acceptance are satisfied.
