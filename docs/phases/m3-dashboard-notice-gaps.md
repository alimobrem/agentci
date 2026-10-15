# Dashboard observed-runtime notice recovery

This change retains authentic notices for narrowly verified runtime code and three
native components. It changes no dependency version, installed manifest, immutable
development candidate, historical evidence or aggregate gate. Native packaging and
independent review remain required before acceptance.

## Nodable observed code

The published `@nodable/entities`3.1.0 archive is bound to the unchanged root
shrinkwrap SRI and SHA256
`3b7cbfe696f570ada57df3eb6981f6c668737a2158ec88a53134f243f9f1db8e`.
The six JavaScript files actually retained in both reviewed native inventories are
`all-entities.js`, `entities.js`, `EntityDecoder.js`, `EntityEncoder.js`,
`entityTries.js` and `index.js`. Every file matches the immutable upstream
[Entity source](https://github.com/nodable/val-parsers/tree/ac48e7ea591da372be023a481875c747535812b3/Entity/src)
byte for byte. The authentic repository root MIT notice is retained unchanged:
1064 bytes, SHA256
`750cb3fb6362804957ef52caaf9b5c824015be44d494637330d7cd8834d31d40`.

The recipe requires exactly these six files plus the unchanged published manifest.
It rejects missing files, additional retained files (including source README/types),
changed code, manifest/archive/source-tree drift and changed notice bytes. The
upstream manifest still says3.0.0; it is retained unchanged as supporting evidence.
There is no whole3.1.0 release provenance claim. A mandatory separate
`published-release-source-version-discrepancy-unresolved` review item prevents
the code notice association from erasing that uncertainty. Declared SPDX metadata
remains the original3.1.0 manifest's MIT field.

## Partial native notices

Both architecture-specific libvips1.3.4 recipes retain the original upstream root
notice files for exactly three declared components:

| Component | Declared version | Immutable source commit |
| --- | --- | --- |
| cgif | 0.5.4 | `2dfb49c22fbe3894e46731f7e3b6ffa84311e44e` |
| highway | 1.4.0 | `2607d3b5b0113992fe84d3848859eae13b3b52c1` |
| zlib-ng | 2.3.3 | `12731092979c6d07f42da27da673a9f6c7b13586` |

Each notice retains its immutable source/archive URL, archive SHA256 and byte count,
observed build-selected tag/commit and unchanged notice hash. The original
`build/posix.sh`, `versions.properties`, `populate-npm-workspace.sh` and upstream
build license are retained from sharp-libvips commit
`ebb95f8add54eee8bed840e3fb587e4cbec857d7` (v1.3.4's peeled commit).
These evidence files are copied as data and never executed by collection.

The original package `versions.json` is checked and copied from the authenticated
installed archive. The source package and every retained runtime binary/file stay
bound by the existing complete source-tree and runtime-projection hashes. The
native Next trace does not retain `versions.json`; the report explicitly labels
its absence from runtime. These are build-version declarations associated with
the archive's actual binary, not an independently reconstructed binary closure.

Coverage remains partial: three of28 declared components, with uncovered names
retained. Highway's complete original multi-license root file is preserved;
collection does not choose a license alternative. The build statically links
dependencies and libvips into libvips-cpp. A `.so` filename proves neither
replaceability nor source-obligation satisfaction. The build also changes Rust
dependency manifests and runs a workspace update, so a pristine upstream Cargo
lockfile does not establish the resolved binary's Rust closure.

Both mandatory native review items remain: full component copyright/notice
completeness and redistribution/relinking/source obligations. Tests reject a
partial notice recipe that drops either item. No complete source distribution,
binary rebuild, relinkability, license compatibility or legal clearance is claimed.

## Counts and unresolved evidence

Only new AMD64 and ARM64 artifacts can establish final inventory counts. The
expected Linux result is four metadata issues (babel-packages two, client-only,
Unistore), plus three separate review items (Nodable version provenance and both
native completeness/obligation items). Partial native supporting evidence cannot
make notice completeness pass. Associated notice counts exclude supporting build,
version and manifest files.

Babel's exact runtime bundle matches Next's pinned source, but17 build entry points,
306 internal modules and a247-snapshot conservative lock closure do not establish
actual complete embedded component/notices coverage. Both Babel flags remain.
Unistore's license link and a current-year generated notice do not establish an
immutable3.4.1 notice. Client-only has no independently verified authentic package
notice. Those gaps remain explicit. No model call or external data sharing is added.

Local focused tests cover exact-runtime file coverage, partial/native qualifications,
version/notice/supporting-source drift, original containment/symlink negatives and
the unchanged bounded public publisher. A filesystem replay of historical native
file hashes for both architectures retained all three new component notices,
Nodable's notice and provenance under the existing32MiB cap. This replay is not a
new native execution. Fresh hosted CI and independent review remain pending.

The final56 focused packaging/notice/native-summary/publication tests and root
typecheck pass. The existing full local feedback runs641 root tests:626 pass,
nine existing Mac process/native-Linux/reporter failures and six skip; all nine
other stages pass. An earlier sandboxed run encountered additional localhost
permission failures and is retained separately. No local result waives hosted CI.
Actual CLI filesystem replays with the two selected dependency packages plus
repository/dashboard identities report zero metadata gaps but three pending review
items on each architecture, and retain `inventory-with-review-items`. This bounded
replay does not substitute for the complete208-package native image inventory.
The CLI diagnostic exposes metadata and licensing review counts separately and
its total review count includes both.

All1346 original requirements, captured gate history, existing service vulnerability
qualifications and all18 open M3 gates remain unchanged. This work establishes no
live HTTPS/OIDC, release, legal or M3 completion.
