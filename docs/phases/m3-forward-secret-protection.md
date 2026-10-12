# Forward secret protection

This small gate checks newly introduced committed content. It makes no claim that
repository history is clean. The separate original 128 matches and expanded 441
historical-blob observations remain unresolved audit evidence, outside this gate;
there is no historical baseline, fixture allowlist or automatic classification here.

Run `node scripts/security/scan-forward.mjs --base FULL_SHA --head FULL_SHA` in a
complete repository checked out at the exact head. The gate scans every regular-file
blob changed relative to a parent in commits reachable from head but not base,
and changed head blobs relative to base. This includes intermediate additions later
deleted, binary Git diff attributes, identical reintroduction and force-push rollback.
Divergent PR base/head histories work when both exact commits are available. Each commit uses an isolated private snapshot retaining exact logical paths,
including identical bytes under different filenames; path-conditioned rules are
therefore applied to each actual context. File/directory changes across commits
remain separate, and findings bind only the path/commit/blob actually matched. Whole
changed blobs are scanned, so an old match within an edited file is conservatively
raised again. Unchanged files and deleted pre-base data remain outside this boundary.

Missing/zero identities, missing base, mismatched HEAD, shallow repositories, lossy
UTF-8/BOM/colliding paths and newly introduced symlinks/submodules fail coverage.
Bounds are 10,000 introduced commits, 5 million compared tree entries, 100,000
references/findings, 20 MB per selected blob, 256 MB unique and materialized bytes total and a four-minute lifetime.
Heuristics do not exhaustively recognize binary/encoded formats, unknown secrets,
or arbitrary personal/confidential data. A no-new-change result is not a security
clearance or a full-history-clean assertion.

The MIT Gitleaks CLI is pinned to 8.30.1. Its official Linux x64 archive hash is
`551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`;
the extracted binary hash is checked too. Official default policy is fetched into
private ignored cache and verified against
`e163e53b9e7e8a8511e77271e2b323ed057759542a6d988258afe3a1fa329caf`.
Global path exclusions are removed, while maintained rule-specific and placeholder
exceptions remain. Password assignments and URL userinfo rules supplement upstream
known-token/private-key detection. Repository policy/ignore files and inline allow
comments cannot disable scanning. Sources: [release](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1)
and [CLI/license](https://github.com/gitleaks/gitleaks).

PR jobs execute only the exact base SHA's trusted scanner; main push jobs use the
exact reviewed main SHA policy and compare event before/after identities. Subject
checkout contains untrusted source that is read as Git blobs, never executed or
npm-installed. Permissions are contents-read only; persisted Git credentials are
disabled, and scanner subprocesses receive no inherited App/API/provider tokens.
Reports record policy/base/head and blob identities plus rule/path/line/unresolved
metadata, never scanner values/snippets or child diagnostics. Private temporary
reports are deleted; default local metadata is ignored and mode 0600. Hosted metadata
expires after 14 days and is visible to repository readers, not a secret store.

The workflow cannot enforce its own introductory PR before it exists on main.
Independent initial source review and observed first hosted execution remain
required; branch-protection adoption is separate. A zero before SHA fails closed,
rather than guessing a historical boundary. Actual Linux x64 synthetic CLI tests
exercise generated private fixtures, clean changes, intermediate deletion and
reintroduction, binary attributes, path failures, missing/shallow coverage and
integrity. Local preseeded official cache proves byte integrity and scanner behavior;
fresh hosted tool/policy download remains a separate network verification.
All M3 release/customer/provider/UI gates remain unchanged.

Retargeted PR base changes trigger a fresh scan through the pull_request_target
`edited` event; its exact new base/head identities are used. Prior bare-SHA
materialization proofs and green CI remain historical: that implementation missed
path-conditioned rules and is superseded by this rework.
