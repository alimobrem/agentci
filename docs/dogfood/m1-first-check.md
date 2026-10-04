# First live M1 review — development build

Observed 2026-10-03. Historical development-build evidence, preserved unchanged
in scope. For current operation and completion, see the
[released-build demo](m1-release-demo.md).

The private App `AgentCI-alimobrem` (App ID 5179954, installation 167655696)
is installed on **only** `alimobrem/agentci`. Permissions: Contents, Pull requests
and Metadata read; Checks write. No code/PR write or repository administration.
Installation was verified through GitHub UI and the App's API.

Editing [PR #1](https://github.com/alimobrem/agentci/pull/1) delivered a real signed
GitHub webhook through a temporary HTTPS tunnel. The API stored it in PostgreSQL;
the durable outbox dispatched a Temporal workflow. AgentCI fetched immutable Git
objects, stored an evidence record and published `agentci/review` with a neutral
advisory conclusion, low risk and 52 changed files.

- Base: `5768c6bff54fc4aa0ab62301ed44c78d0cb3946c`
- Head: `b35617b468496759bfe1b965f23b799cb510445c`
- Evidence ID: `5c0aea93-117c-4e72-8f86-88a66570cecb`
- Analysis digest: `sha256:245f9f296b76c929d4dcddb43a942ed44b0750f97a701ce2ff4ef4bd4b2dacf5`
- Runtime: local Node 26 / UBI 10 development images, not published release images.
- Authenticated evidence GET on localhost: 200; without credentials: 401.

The Temporal volume initially failed because its user could not write `/data`.
The Compose configuration now mounts the image-owned home directory and requires
Temporal health before API/worker startup. Earlier volumes were preserved.
This defect demonstrates why ephemeral image smoke alone does not verify the
persistent Compose deployment. Persistence/restart checks remain separate gates.

The tunnel is temporary and its URL is not a durable evidence permalink. The
Check's evidence link requires the evidence bearer token; never put that token in
URLs, Check output or Git. Credentials live in ignored local files with private
permissions; they are excluded from Docker build context. At this observation, reviews depended on the local deployment and tunnel.
The released hosted workflow now provides ongoing every-PR dogfood coverage;
this earlier observation alone did not satisfy that release gate.
