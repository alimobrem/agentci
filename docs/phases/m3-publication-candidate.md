# M3 publication development candidate

`0.4.0-m3-dev.1` reserves a distinct identity for testing the native publication
pipeline introduced in PR #23. It is an incomplete development build, not the M3
milestone release and not an implementation of the planned model-review/UI scope.
The public M2 release remains `0.3.1-m2`; none of its artifacts or tags are replaced.

At the initial PR #23 identity change, only package/root-lock metadata, the CLI
version and OpenAPI info version changed; dependency graphs and API operations
were unchanged at that checkpoint. Subsequent development now includes the
merged model-review, reservation/disposition and authenticated Check-link work.
Released M1/M2 compatibility baselines remain unchanged. Initial local validation covered OpenAPI consistency, compatibility against
both baselines (including endpoint-removal negatives), compilation and a clean
production-only package installation with CLI/client failure cases.

[Historical development publication/download evidence](../../delivery/acceptance/m3-r1-native-downloads.json) applies only to source
`8b6dfabb704dcc4813072c68a3ea3f7148d51c26`. Subsequent main commits retaining
this version string do not inherit that evidence. M3-R1 remains in progress;
current exact-source publication and download acceptance still require proof. Failed attempts and partial publications must remain visible;
any subsequent candidate gets a new identity rather than overwriting these tags.
No completed M3 GitHub release is created by this version change.
