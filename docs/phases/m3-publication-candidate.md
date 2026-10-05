# M3 publication development candidate

`0.4.0-m3-dev.1` reserves a distinct identity for testing the native publication
pipeline introduced in PR #23. It is an incomplete development build, not the M3
milestone release and not an implementation of the planned model-review/UI scope.
The public M2 release remains `0.3.1-m2`; none of its artifacts or tags are replaced.

Only package/root-lock metadata, the CLI version and OpenAPI info version change.
Dependency graphs, API operations and released M1/M2 compatibility baselines remain
unchanged. Local validation covered OpenAPI consistency, compatibility against
both baselines (including endpoint-removal negatives), compilation and a clean
production-only package installation with CLI/client failure cases.

The final candidate source still requires hosted verification, native publication
and independently downloaded runtime acceptance on both architectures. M3-R1
remains in progress. Failed attempts and partial publications must remain visible;
any subsequent candidate gets a new identity rather than overwriting these tags.
No completed M3 GitHub release is created by this version change.
