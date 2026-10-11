# M3 development candidate publication

The next proposed immutable identity is `0.4.0-m3-dev.2`. This preparation does not
activate publication: a later reviewed change must synchronize package, lockfile,
CLI and OpenAPI versions and add `releases/m3-development-candidate.json`. Its
explicit descriptor identifies the repository, development version and approved
publication purpose. The activation merge supplies the full frozen source SHA.

`development-candidate.yaml` runs only on reviewed `alimobrem/agentci` main, on
that descriptor change or an owner manual dispatch. It checks exact checkout and
version, then rejects occupied or ambiguous GitHub tag/release and all six GHCR
role destinations. It uses existing temporary workflow tokens: only image jobs
have package-write permission; only release jobs have content-write permission.
Repository policy denial remains a blocker; do not add a PAT or broaden access.

The workflow calls the existing native image publication and corrected download
workflows directly through `workflow_call`; token-created release/tag events are
not a dispatch mechanism. Six roles (`api`, `worker`, `eval-worker`, `eval-runner`,
`eval-engines`, `eval-agentci`) require actual native AMD64/ARM64 builds, source,
version, run-attempt, scan, manifest/index and applicable worker provenance
bindings. Partial publication remains retained and prevents reuse of that version.
No occupied image tag or release asset is overwritten.

After all six roles publish, trusted source is built and packed. A package-only
`dist/release-source.json` provenance asset records the frozen SHA and version.
`package-manifest.json` binds every packed file and archive hash to that source;
`images.json`, `SHA256SUMS` and publication evidence accompany the public tarball.
The GitHub development prerelease explicitly says download validation is pending.
It is not a milestone release or completed candidate at that point.

Fresh native AMD64 and ARM64 jobs independently download images with clean Docker
credentials and the package without authentication. Public package manifest and
archive hashes are pinned from the trusted assembly job. Archive paths, file
hashes, version and embedded source identity are checked before npm installation.
Installation uses a temporary HOME/cache, empty user/global npm configuration and
an explicit public registry; controller/App/provider/GitHub credentials are not
passed to child processes. The installed CLI, public client export and all three
adapter modules are checked using production dependencies, without the source
checkout's loader. Source builds do not replace public tarball installation.

Only successful image and package native cohorts permit finalization. Mandatory
integration summaries must cover every exact-source suite, without failures,
skips, cancellations or duplicate/missing summaries. Release source and acceptance
workflow source remain separate recorded identities, even when equal for this
candidate. Failed or partial attempts keep validation pending. Retained native
receipts do not close actual customer, external provider, UI or milestone gates.

Compare observed build/cache logs and timings with the historical cold cohort
only where runner/input/cache scope supports the comparison. Record changed-source
limits, post-build scan/upload/cleanup margins and failures. No speedup or new
acceptance threshold is assumed. An intentional paid failure is not required.

Customer acceptance uses the distinct demo-only App and a separately reviewed
workflow. Fixture commits/branches/PRs use Work GitHub, because the customer App
has only Contents/PR/Metadata read and Checks write. New secret/access setup is
outside this publication approval. All M0–M10 obligations, three adapters and
all eighteen pending M3 gates remain intact.

Pinned npm12 emits package-keyed pack JSON and excludes root shrinkwrap. Assembly normalizes that output and explicitly restores the byte-identical source `npm-shrinkwrap.json` and `package-lock.json` in the tarball. Anonymous native acceptance verifies every file before npm runs, then proves a production root `npm ci` from that verified lock and separately proves an ordinary tarball consumer install. The locked root exercises CLI, public client and all three provider modules. npm12 does not honor those nested package locks in an ordinary consumer install; that second layout proves consumer usability, not locked transitive resolution. Both layouts exclude development loaders.
