# MCP UI authorization: PostgreSQL example

This is the runnable companion to the article
[`mcp-ui-selection-authorization-contract.md`](../../../content/posts/mcp-ui-selection-authorization-contract.md).
It implements one narrow contract: a server-derived actor, an ownership check, a
compare-and-set update, and an idempotency journal committed in the same
transaction.

## Requirements

- PostgreSQL 14+ (tested with PostgreSQL 16)
- Python 3.10+
- `psycopg` 3 (`python -m pip install 'psycopg[binary]>=3.1'`)

The test uses `DATABASE_URL`, defaulting to
`postgresql://mcp_test:mcp_test@127.0.0.1:55432/mcp_test`.

## Reproduce in an isolated container

These commands do not touch an existing PostgreSQL role or database:

```sh
podman run --rm --name mcp-ui-auth-pg \
  -e POSTGRES_USER=mcp_test -e POSTGRES_PASSWORD=mcp_test \
  -e POSTGRES_DB=mcp_test -p 127.0.0.1:55432:5432 \
  docker.io/library/postgres:16-alpine
```

In another terminal, after the server accepts connections:

```sh
python -m pip install 'psycopg[binary]>=3.1'
python test_integration.py
```

The test creates its tables, truncates only those tables, and exits non-zero on
failure. Stop the container with `podman stop mcp-ui-auth-pg`.

## Contract and limits

`cards.owner_id` is the authorization boundary in this minimal schema. The
`UPDATE ... WHERE owner_id = %s AND version = %s RETURNING ...` is the CAS.
PostgreSQL row locking makes two independent connections racing on the same
card and version produce exactly one accepted update; the other receives
`conflict` and does not write a journal row.

The journal key is scoped to `(actor_id, operation, idempotency_key)`. The
payload hash covers `object_id`, `expected_version`, and `title`. A request
serializes decisions for that scope with a transaction-scoped PostgreSQL
advisory lock, then locks the journal row if present. A live key replays only
the same payload; a different payload is rejected as `idempotency_key_reuse`.
An expired row is deleted and replaced in the same transaction, so reuse does
not depend on a background cleanup job and does not expose `UniqueViolation`.
Concurrent reuse of an expired key has one serialized winner: same-payload
callers replay the winner's response, while different-payload callers get
`idempotency_key_reuse` without a second card update. The stored response is
replayed after a lost response. This example does not provide cross-region
durability, cryptographic identity, or an ACL-table policy.
