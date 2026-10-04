# Markdown audit — M1 closure

Date: 2026-10-03. Reviewed repository Markdown excluding installed dependencies
and compiled package copies. The primary specification and its source-linked
copy remain unchanged. The generated status view is regenerated from inventory.

Yes: current documents had become stale during M1 publication.

| Document | Correction |
| --- | --- |
| README | Rebuilt around purpose, principles, shipped architecture, quickstart and contribution guidance; linked verified release |
| STATUS / CHANGELOG / AGENTS | Replaced open M1 publication claims with completed release; M2 remains not-started |
| Architecture | Replaced local-candidate/pending App and registry claims; distinguished implemented components from target architecture |
| M1 setup | Replaced pending live startup; added published image digests and amd64 CPU requirement; clarified hosted/local operation |
| Dependency policy | Described shipped M1 versions rather than candidate versions |
| Development | Distinguished schema API from control API; clarified historical M0 reproduction requirements |
| M1 release / retrospective | Replaced pre-release placeholders with release-source evidence, demo and measured findings |
| Delivery workflow / first dogfood | Labeled earlier observations as historical; added closure link and third defect record |
| Requirement status | Closed only explicit M1 build/exit items; retained unfinished product requirements |

Historical M0 evidence, earlier dogfood results and timing observations remain
historical, rather than being rewritten to claim later checks. Generic policy
mentions of pending gates and release candidates are still valid. Source spec
examples and future milestone designs are not shipped-feature claims.

Outstanding project decision: choose a license. The repository is public but no
open-source license has been granted yet. Final retrospective action agreement
with the user is pending; M2 implementation remains not-started.

Repeat this audit at release closure: compare current status/version/commands to
the actual tag, manifest, platform support and demo; preserve historical context.
