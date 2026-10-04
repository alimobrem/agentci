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

This is an implementation checkpoint, not completed Podman support or an M2
release. Remaining gates include the non-root evaluator's engine-socket access,
restricted database/native Temporal restart/recovery, complete native suite,
optional/self-review images, hosted workflow, both published platforms and native
binary inventory/scan coverage. Hosted workflows currently select Docker
explicitly; service adoption must pass before those defaults change.

Evaluator socket configuration is operator-owned:

- `AGENTCI_CONTAINER_ENGINE=podman` (default).
- `AGENTCI_CONTAINER_SOCKET_PATH` points to the dedicated Podman socket.
- `AGENTCI_CONTAINER_SOCKET_GID` describes its accessible group.
- The service mounts only that socket at `/run/agentci/engine.sock` and uses
  `CONTAINER_HOST=unix:///run/agentci/engine.sock`.
- Explicit Docker fallback uses `AGENTCI_CONTAINER_ENGINE=docker`; legacy
  `AGENTCI_DOCKER_SOCKET_PATH/GID` aliases remain accepted by Compose.

The official remote client requires runtime-directory writes even during version
initialization. The service provides a private 16 MiB non-root tmpfs at
`/opt/agentci/podman-runtime`; the UBI root filesystem remains read-only.

Rootless service UID mapping and SELinux socket access are still under acceptance;
the Compose example is not yet a certified rootless deployment recipe.
