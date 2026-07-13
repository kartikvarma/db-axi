---
name: db-axi
description: AXI-compliant database CLI for PostgreSQL, MySQL, and Oracle. Use for inspecting schemas and querying data read-only.
---

# db-axi

Autonomous agents use `db-axi` to interact with relational databases. It follows AXI principles: token-efficient TOON output, structured errors, and ambient context.

## Workflow

1. **`db-axi home`** (or `db-axi` with no subcommand) — connection summary, table count, largest tables, next-step help.
2. **`db-axi schema <table>`** — columns, types, PK, indexes, foreign keys.
3. **`db-axi sample <table>`** or **`db-axi query "…"`** — peek data or run read-only SQL.

## Core commands

### `db-axi home`

Start here if you do not know the schema. Shows engine, server (password redacted), table summary, and `largest` tables by estimated row count.

### `db-axi tables` / `db-axi databases`

List tables (with row/column estimates) or databases/schemas.

### `db-axi schema <table_name>`

Columns (`name,type,nullable,pk,default`), indexes, and foreign keys. Missing tables → `NOT_FOUND`.

### `db-axi sample <table_name>`

Safe catalog-checked peek (`--limit`, default 10). Reports `N (complete|capped)`.

### `db-axi query "<sql>"`

Read-only SQL only. Prefer an explicit `LIMIT`; the tool still clamps results (default 100, hard max 1000) and reports complete vs capped.

## Read-only guarantee

Allowed: `SELECT`, `EXPLAIN SELECT`, `EXPLAIN (… ) SELECT`, `EXPLAIN ANALYZE SELECT`, `EXPLAIN PLAN FOR SELECT`.

Rejected: `INSERT` / `UPDATE` / `DELETE` / `DROP` / multi-statement / `WITH` (CTEs deferred). Code: `READ_ONLY`.

## Connection resolution

Precedence: flags → `--url` / positional URL → env.

- **Postgres**: `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`
- **MySQL**: `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`
- **Oracle**: `ORACLE_HOST`, `ORACLE_PORT`, `ORACLE_USER`, `ORACLE_PASSWORD`, `ORACLE_DATABASE`
- **Generic**: `DATABASE_URL`

If multiple families are set without a URL, pass `--engine`. Row counts are catalog **estimates**.

## Errors

Structured TOON on stdout: `error`, `code`, optional `help`. Common codes: `VALIDATION_ERROR`, `READ_ONLY`, `ENGINE_AMBIGUOUS`, `DRIVER_MISSING`, `CONNECTION_ERROR`, `NOT_FOUND`, `QUERY_ERROR`.
