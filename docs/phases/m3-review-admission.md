# M3-07a review admission

Development is in progress. This is an internal request/admission contract, not
an enabled public route or a complete review consumer. M3-07b connects dispatch;
M3-07c adds authenticated customer transport and its status representation.

Each request binds an operation UUID, exact organization/repository/PR/base/head,
operator profile ID and immutable revision digest, and synthetic/live mode.
Unknown fields are rejected, including commands and credentials. UUIDs normalize
to lowercase before digesting; source revisions remain exact lowercase Git SHAs.
Validated values are detached from caller-owned mutable objects.

The controller authorizer must verify the allowed immutable profile, mode, policy
and authenticated GitHub subject. It returns approval bound to the complete
normalized request digest, profile revision, mode and policy digest. Hash values
alone do not establish authority: the reader must be trusted and read-only, with
no model dispatch or spending side effects. Production profile resolution and
caller authentication are integration work in the following slices.

Migration 008 atomically stores the immutable admission and its dispatch outbox
entry. Concurrent exact submissions return the first accepted admission and
create one outbox entry. Reusing the ID with different source, profile or mode is
a conflict. An outbox write failure rolls back the admission. Explicit denial
and unavailable authorization/storage have separate redacted errors.

Every transport caller must be authenticated, including retries and reads. An
exact retry returns the original approval without selecting a newer profile or
creating another dispatch. This is evidence of the original admission, not a new
policy grant. The consumer must apply runtime revocation/availability rules and
preserve the resulting failed or cancelled disposition.

Records and lookups are scoped by organization and repository. Immutable triggers
reject request updates/deletes; database administrators remain trusted. Local
acceptance covers strict contracts, concurrent duplicates, conflicts, denial,
redacted outages, rollback, cross-tenant lookup, restart and immutability.
Operation coverage is tracked in `specs/api/reviewer-operations.json`.
