# ADR 0004: Read-Only Enforcement

- **Status:** Proposed
- **Date:** 2026-06-28
- **Deciders:** project owner

## Context

The owner chose the **same read-only guarantee as `sqlite-axi`**: the tool must never mutate
the target database. `sqlite-axi` achieves this with two independent layers — an engine-level
read-only handle and a statement allowlist validator. `db-axi` talks to full RDBMS servers
where a connection can issue any statement the credentials permit, so we must re-establish an
equivalent guarantee per engine.

## Decision

Two independent layers, both required.

### Layer 1 — engine-level read-only session

Immediately after connecting, set the session read-only before running anything:

- **PostgreSQL:** `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`.
- **MySQL:** `SET SESSION TRANSACTION READ ONLY`.
- **Oracle:** `SET TRANSACTION READ ONLY` (per transaction; re-applied as needed).

This makes the server itself reject writes regardless of the SQL submitted.

### Layer 2 — statement allowlist validator (`src/validate.ts`)

A dialect-aware port of `sqlite-axi`'s validator. After stripping leading/trailing comments
and confirming a **single** statement (quote- and comment-aware `;` scan), the SQL must match
one of (case-insensitive):

- `SELECT ...`
- `EXPLAIN [ <options> ] SELECT ...` (covers Postgres `EXPLAIN (FORMAT ...)`, MySQL
  `EXPLAIN`, Oracle `EXPLAIN PLAN FOR SELECT`).

Rejected with `AxiError("READ_ONLY")` (exit 2): all DML/DDL, `WITH` (CTEs can feed writes;
deferred to a future version), `PRAGMA`/`SET`/`USE`/`SHOW`, `CALL`, multi-statement input,
and `EXPLAIN <non-SELECT>`.

Internal metadata queries (catalog reads in the adapters) bypass the validator — they are
fixed, parameterized SELECTs the tool controls.

## Rationale

- **Defense in depth.** Either layer alone would block writes; together they protect against
  a gap in the other (mirrors the reference's design philosophy exactly).
- **`WITH` excluded in v1.** Matches `sqlite-axi`; robust CTE validation is non-trivial across
  three dialects and is deferred rather than risk a read-only hole.

## Consequences

- Result-set size is capped (`--limit`, default per command, hard max 1000) and queries fetch
  `limit + 1` rows to report `complete` vs `capped` without a separate count.
- Identifier safety: user-supplied table names are validated against the catalog first, then
  emitted as quoted identifiers; all values are bound parameters — never string-interpolated.

## Alternatives considered

- **Validator only.** Rejected — a single missed pattern would allow a write.
- **Read-only session only.** Rejected — keeps the independent second layer per the owner's
  "same guarantees as sqlite-axi" choice.
- **Allow `WITH ... SELECT`.** Deferred to a later ADR/version.
