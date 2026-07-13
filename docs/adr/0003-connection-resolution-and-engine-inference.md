# ADR 0003: Connection Resolution and Engine Inference

- **Status:** Proposed
- **Date:** 2026-06-28
- **Deciders:** project owner

## Context

`sqlite-axi` auto-discovers a local file. `db-axi` instead needs **connection coordinates**
(engine, host, port, user, password, database). The owner wants connection via
`username, host, port, password (optional)` flags, and wants the tool to **infer the engine
and discover connection info from the environment** when flags are omitted — with no
interactive prompts (an AXI requirement).

## Decision

### Connection inputs (highest precedence first)

1. Explicit flags: `--engine`, `--host`, `--port`, `--user`, `--password`, `--database`
   (alias `--db`).
2. A connection URL: `--url` (e.g. `postgres://user:pass@host:5432/dbname`).
3. Environment variables:
   - Generic: `DATABASE_URL` (scheme selects engine).
   - PostgreSQL: `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`.
   - MySQL: `MYSQL_HOST`, `MYSQL_TCP_PORT`, `MYSQL_USER`, `MYSQL_PWD`, `MYSQL_DATABASE`.
   - Oracle: `ORACLE_HOST`, `ORACLE_PORT`, `ORACLE_USER`, `ORACLE_PASSWORD`,
     `ORACLE_DATABASE`/`ORACLE_SERVICE_NAME`.

Per-field resolution merges these sources (flag > url > env-family), then applies
**default ports** per engine (postgres 5432, mysql 3306, oracle 1521) and `localhost` host.

### Engine inference (first match wins)

1. `--engine` flag.
2. URL scheme (`postgres`/`postgresql`, `mysql`/`mariadb`, `oracle`).
3. Port number (5432 → postgres, 3306 → mysql, 1521 → oracle).
4. Which env-var family is present (`PG*` / `MYSQL_*` / `ORACLE_*`).
5. If exactly one driver is installed, use it.
6. Otherwise → `AxiError("ENGINE_AMBIGUOUS")` listing how to disambiguate with `--engine`.

### Password handling

Optional on the CLI. Resolved from `--password`, the URL, or the engine's password env var.
**Never** echoed back, logged, or placed in error messages / suggestion strings.

## Rationale

- **Agent-friendly.** Zero-config when the environment is already set (`DATABASE_URL` or the
  standard per-engine vars), explicit flags when not — and a definitive structured error
  instead of a hang when the engine cannot be determined.
- **Least surprise.** Precedence and port→engine mappings follow each engine's conventions.

## Consequences

- Resolution is a **pure** function over `{flags, env}` (env injected for testability), so
  inference and merging are fully unit-testable without a live DB.
- Ambiguity is surfaced as a structured, actionable error (exit code 2), never a prompt.

## Alternatives considered

- **Require `--engine` always.** Simpler, but contradicts the "auto find" requirement.
- **Prompt for missing password.** Violates the AXI "no interactive prompts" principle.
