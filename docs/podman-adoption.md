# Podman adoption status

Podman is the default engine selected by `AGENTCI_CONTAINER_ENGINE`; only `podman`
and `docker` are accepted. Repository manifests cannot choose an executable.
Worker configuration carries the same selection into execution and fenced
orphan/cancelled-unit cleanup. Docker is an explicit compatibility setting.

The local acceptance environment uses a dedicated rootless Podman 6.1.3 Fedora
CoreOS machine, with matching official client/server versions. It does not mount
the home directory or replace the shared Docker socket. Official release assets
are checksum pinned; the evaluator remains UBI and includes the official static
remote client and upstream license.

Native acceptance has passed real command/pytest/model comparison, immutable
baseline assertions, private non-root scratch storage, read-only root,
network/credential isolation, timeout/output limits, cancellation and SIGKILL
recovery that preserves other units and current leases. Podman uses its documented
`--mount` tmpfs ownership option; actual mounts retain nosuid/nodev. The final Docker compatibility rerun also passed those mount assertions. Imported Docker archives produce a Podman image identity, which is
pinned independently; an unchanged cross-engine image ID is not assumed.

The dedicated rootless Compose deployment has also passed actual socket access
from UID 1001, restricted database authentication, native Temporal execution,
behavioral failure preservation, worker shutdown/restart and child cleanup.
Five targeted native tests passed cancellation and recovery across the runner,
separate evaluator and controller. Cancellation kills the attached client, then
removes only the fenced owner's container. Podman removal uses `--time 0` because
its default stop grace permits untrusted code to delay cleanup by ignoring TERM.

This is an implementation checkpoint, not completed Podman support or an M2
release. A complete native run passed 14 of 15 tests; a pytest runner case returned
an infrastructure error. The retry passed all 15 tests, and a further focused
runner pass succeeded. The earlier failure is retained as an unresolved
intermittent issue. The freshly packaged evaluator passed rootless Podman Compose
and explicit Docker service acceptance; the full Docker cohort passed all 15
tests. Remaining gates include resolving the intermittent runner failure, hosted
workflow, both published platforms and native binary inventory/scan coverage.
Hosted workflows currently select Docker explicitly; hosted Podman acceptance
must pass before those defaults change.

Evaluator socket configuration is operator-owned:

- `AGENTCI_CONTAINER_ENGINE=podman` (default).
- `AGENTCI_CONTAINER_SOCKET_PATH` points to the dedicated Podman socket.
- `AGENTCI_CONTAINER_SOCKET_GID` describes its accessible group.
- The service mounts only that socket at `/run/agentci/engine.sock` and uses
  `CONTAINER_HOST=unix:///run/agentci/engine.sock`.
- Explicit Docker fallback uses `AGENTCI_CONTAINER_ENGINE=docker`; legacy
  `AGENTCI_DOCKER_SOCKET_PATH/GID` aliases remain accepted by Compose.

The official remote client requires runtime-directory writes even during version
initialization. The service provides a bounded 16 MiB tmpfs parent at
`/opt/agentci/podman-runtime`; startup creates its private, UID-owned mode-0700
`private` child for `XDG_RUNTIME_DIR`. The parent uses mode 1777 for portable OCI
ownership initialization; the UBI root filesystem remains read-only.

For a rootless Podman host, include `deploy/podman-rootless.compose.yaml` alongside
the evaluator manifest. It maps the host engine user to service UID 1001 using
`keep-id`. SELinux label separation is disabled only for the trusted engine client
that needs the operator socket; untrusted eval containers retain their own
SELinux isolation and receive no engine socket or controller credentials. This
recipe has local acceptance evidence; hosted and published release acceptance
remain open.
