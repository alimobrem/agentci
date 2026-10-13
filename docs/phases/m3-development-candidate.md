# M3 development candidate publication

The owner approved corrected development identity `0.4.0-m3-dev.3` in the existing
GitHub/GHCR destinations after the dev.2 immutable-release publication failure.
The occupied dev.2 release, tag, images and original failure records stay untouched.
This local activation preparation synchronizes package/root locks, CLI/OpenAPI,
opt-in M3 overlays, publication and customer download guards and the fixed identity fields and existing preflight-contract marker in
`releases/m3-development-candidate.json`. The actual activation merge
supplies the frozen source SHA without a self-referential descriptor. Repair merge,
independent exact-source review and full hosted CI remain required before activation.
No customer or milestone gate is closed by this version change.

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

Final verification requires every retained runtime proof on each architecture: API/worker smoke, isolated evaluator smoke, worker and evaluator native inventories, and downstream forge regression evidence. Each receives an acceptance envelope bound to source, release version, workflow revision, run/attempt, platform and exact downloaded identities. Actual local image IDs, pinned Temporal/Docker artifacts, source patch/fixture/verifier hashes and every runtime assertion are revalidated before release writes. The alias `downloaded` in image smoke is not a release version. The exact uploaded evidence tar members and bytes must match the retained regular files, and all four initial asset checksums must match `SHA256SUMS`; a passing workflow alone cannot substitute for those retained proofs.

The immutable release repair prepares future approved candidates; it does not reuse the occupied dev.2 release or authorize a new version. GitHub documents [immutable releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-release-immutability): upload all five initial package/image/provenance/checksum assets to a draft, read back their exact names, sizes and SHA256 digests, then publish once. Ambiguous create/upload/publish acknowledgements reconcile the same source/run/attempt intent and release ID; different occupied identities or incomplete drafts fail without overwriting, deleting or publishing them. Existing preflight still rejects occupied destinations before any retry.

Anonymous AMD64/ARM64 package and image checks run after publication. The finalizer validates the exact retained receipts and writes native acceptance JSON, evidence archive and checksums without adding any release assets. The pinned Actions upload retains those files before a separate mark-verified command validates the artifact ID, digest, source, run/attempt name, expiry and availability and edits only release title/notes. A failed retention/identity check leaves the pending notes. The immutable five-asset cohort stays unchanged. The notes link names the precise authenticated Actions artifact and its retention expiry; this is not permanent anonymous evidence. Independent inspection of the retained artifact remains required. Permanent public records can be prepared as a separately reviewed evidence PR in the existing public repository, with source/run/attempt and archive hashes preserved; this preparation does not perform that write. All customer, endpoint, UI, publication/download and milestone obligations retain their existing acceptance requirements; no final M3 acceptance is claimed by this repair.

The draft-recovery correction uses authenticated `listReleases` with all pages before create and during ambiguous-create reconciliation. Published-only `getReleaseByTag` is retained for published occupancy/finalizer checks and never substitutes for draft discovery. Preflight requests narrowly scoped ephemeral `contents: write` (and existing `packages: read`) because GitHub exposes drafts only to authenticated callers with push access; generic callers must affirm repository push permission before listing. The separately validated trusted Actions installation mode binds exact Git HEAD, committed workflow/job Contentswrite and token injection, repository identity and the actual Octokit installation-token fingerprint; user-style push metadata is diagnostic in that mode, including the observed false value. Forged branding, foreign/OAuth/substituted authentication, wrong source/job/grant/injection and generic false or absent push remain denied. Listing errors, repeated identities or incomplete pagination fail closed. A next Link on a short page still requires the next fixed repository/page read; foreign or inconsistent next links are rejected rather than followed. The trusted-main/repository guards remain. Any matching tag blocks a fresh attempt; only the same in-flight failed-create intent may reconcile one exact draft with matching source/run/attempt body and positive numeric release ID. Duplicate or foreign attempts fail without uploads/publication.

Actual Git refs are checked absent before creating/uploading the owned draft and immediately before publishing, then read back as the exact source commit after publish acknowledgement or same-release recovery. Draft metadata supplies no owned tag-creation receipt, so any prepublication tag (including a same-SHA tag) is rejected. A wrong or missing ref after an irreversible publish remains `published-unverified` failed evidence; no rollback, overwritten ref or verified completion is attempted.

Current local preparation starts from the corrected immutable-release, CI cleanup and path-aware forward-scanner main. Historical scanner observations remain separate and unresolved; they are not a classification prerequisite for the forward gate. This version-only local descriptor preparation does not trigger publication. Trusted planner integration, independent review and applicable exact combined-source checks must precede the final release-source freeze and root-controlled publication. No remote activation, publication run, customer fixture or live service is created by this local preparation.

The current-source temporary publication hold was lifted after parent review of hardened main `a33747e2bfba12a919198fe50bb6d2ea5d254e81` and its actual postmerge advisory cleanup/evidence artifacts. The unmatched historical GitGuardian incident remains open. The observed token repair is integrated onto that hardened tree; its older local branch is not a publication source. Repair draft CI and exact source/artifact review precede separate descriptor activation of the already approved dev.3 identity. All native and anonymous package/image download requirements remain in force.

The reviewed token repair was merged as `eccfe59f2006a6aff2f9161478d536c0de5f320a`, preserving the hardened tree. The separate activation changes only the existing preflight-contract annotation to `source-bound-actions-installation-token-authentication` in the same descriptor; version `0.4.0-m3-dev.3`, repository, publication identity and grants remain unchanged. Merging that descriptor change is the existing push trigger for the approved publication, so exact activation CI and parent source/artifact review are required first. Occupied identities still block mutation. Actual native AMD64/ARM64 publication and anonymous package/image acceptance, with retained failures and source/run/attempt hashes, are required before verified candidate notes.

Actual activation merged as `2d2dabf00b01c743d92145ef89575df8c31e69cf`. Publication run `38321652532`, attempt 1, failed in read-only preflight with `Actions installation authentication differs from committed token injection`; every downstream publication/download/finalization job was skipped. Independent parent inspection verified artifact `11778674286` ZIP SHA256 `9c0c9a02a5d8ada115ec31a618b44fad837e119e1c5668f419c2157b4ee122e3`, source/run/attempt, null release ID and empty uploaded-assets list. This proves no publication execution in that attempt; it does not establish destination absence or identify which compound authentication predicate failed.

The owner approved a standalone read-only diagnostic extension, its tests, reviewed merge and execution. Schema 2 retains exact source/run/attempt, existing fixed-repository GET evidence, and only allowlisted `authType`, `authTokenType`, `tokenPresent` and `tokenMatches` values. It exposes no credential bytes, prefixes, hashes or raw authentication/API responses and parses no JWT claims. The committed main workflow, repository/job/source, existing grant and exact `secrets.GITHUB_TOKEN` injection remain required. Classification is the locked client's heuristic, not a server capability attestation or a publication authorization.

Real locked Octokit tests reproduce rejection of the documented stateless installation-token shape by the current publication guard: `@octokit/auth-token` 6.0.0 checks JWT shape before the installation prefix and reports `app` while preserving bytes. Positive historical fixtures used legacy `ghs_` plus random hex; authentication itself was real Octokit, with fetch mocked for subprocess REST execution. This compatibility defect does not prove the hosted token's shape or failure predicate. A separate regression binds token A and authenticates real Octokit with token B, rejecting before release listing. No publication guard, permission, candidate identity or milestone gate is changed by this diagnostic; publication remains paused pending actual evidence and reviewed repair.
