# db-axi — Design

**Date:** 2026-06-28
**Status:** Draft for review

## Summary

`db-axi` is an [AXI](https://github.com/kunchenguid/axi) (Agent eXperience Interface): an
agent-native CLI that **inspects and queries MySQL, PostgreSQL, and Oracle databases
read-only**, with token-efficient [TOON](https://toonformat.dev) output. It is modeled on
[`sqlite-axi`](https://github.com/SSBrouhard/sqlite-axi) and built on the same `axi-sdk-js`
framework, but replaces local-file discovery with **network connection resolution** and a
**multi-engine driver abstraction**.

The leverage is identical to the reference: agents are fluent at SQL but wasteful with its
output. A capped, TOON-formatted result set plus a compact schema snapshot is a large token
win, and read-only access (ADR 0004) sidesteps all mutation risk across three engines.

## AXI principles → where they live

| Principle | Realization in db-axi |
| --- | --- |
| Token-efficient output (TOON) | `@toon-format/toon` via the SDK; all output is TOON |
| Minimal default schemas | 3–4 fields per list item (e.g. `tables{table,rows,columns}`) |
| Content truncation | `format.ts` truncates cells >200 chars with ` …`; `--full` escape hatch |
| Pre-computed aggregates | catalog-based row-count **estimates**, totals, object counts |
| Definitive empty states | explicit `"0 tables ..."` / `"0 (complete)"` strings |
| Structured errors & exit codes | `AxiError` codes → exit 0/1/2; no prompts; idempotent |
| Ambient context | `db-axi setup hooks` (SessionStart) + on-demand SKILL.md |
| Content first | home shows a snapshot, not help text |
| Contextual disclosure | each command appends relevant next-step `help` lines |
| Consistent help | top-level + concise per-subcommand help via the SDK |

## Architecture (module layout)

```
src/bin/db-axi.ts        runAxiCli config + dispatch + formatError + setup hooks
src/args.ts              flag parser, parseLimit, flagString (pure)
src/env.ts               read connection info from environment vars (pure, env injected)
src/connection.ts        ConnectionConfig, resolveConnection, inferEngine (pure)
src/redact.ts            password redaction helpers for safe display (pure)
src/validate.ts          read-only statement allowlist (pure)
src/format.ts            cell truncation, null/blob rendering, buildRows (pure)
src/engines/types.ts     Engine + Connection interfaces, metadata DTOs
src/engines/index.ts     getEngine(name), installedEngines() — lazy driver loading
src/engines/postgres.ts  pg adapter (impure)
src/engines/mysql.ts     mysql2 adapter (impure)
src/engines/oracle.ts    oracledb adapter (impure)
src/commands/{databases,tables,schema,sample,query}.ts   async transforms → plain objects
src/home.ts              no-args connection + schema snapshot
src/help.ts              top-level + per-command help text
.agents/skills/db-axi/SKILL.md
test/                    vitest unit tests for the pure modules
README.md, package.json, tsconfig.json, vitest.config.ts
```

The engine adapters are the only impure modules (network + driver). Commands are async
transforms given a live `Connection` and parsed args, returning plain objects the SDK encodes
to TOON.

## Connection model (see ADR 0003)

`ConnectionConfig = { engine, host, port, user, password?, database? }`.

Resolution precedence per field: **flag > --url > env-family**, then default port/host.
Engine inference order: `--engine` → URL scheme → port → env family → sole installed driver →
`ENGINE_AMBIGUOUS`. Passwords are optional and never displayed (`redact.ts`).

`resolveConnection(positionals, flags, env)` returns `{ config, rest }`, where `rest` are the
remaining positionals (e.g. a table name or SQL string) — mirroring `sqlite-axi`'s `resolveDb`.

## Engine adapter contract (see ADR 0002)

```ts
interface Engine { name: EngineName; connect(c: ConnectionConfig): Promise<Connection>; }

interface Connection {
  listDatabases(): Promise<DatabaseInfo[]>;        // databases (pg/mysql) or schemas (oracle)
  listTables(): Promise<TableInfo[]>;              // {name, rows(est), columns}
  tableExists(name: string): Promise<boolean>;
  columns(name: string): Promise<ColumnInfo[]>;    // {name,type,nullable,pk,default}
  indexes(name: string): Promise<IndexInfo[]>;     // {name,unique,columns}
  foreignKeys(name: string): Promise<ForeignKey[]>;// {column,references}
  rowEstimate(name: string): Promise<number>;
  sample(name: string, limit: number): Promise<QueryResult>;
  query(sql: string, limit: number): Promise<QueryResult>;  // fetches limit+1 → capped flag
  close(): Promise<void>;
}
```

Each adapter implements catalog queries against its system tables (Postgres `information_schema`
+ `pg_*`, MySQL `information_schema`, Oracle `ALL_*`/`USER_*`). Row counts are **estimates** from
catalog statistics (`pg_class.reltuples`, `information_schema.tables.table_rows`,
`all_tables.num_rows`) to avoid expensive `COUNT(*)` on large remote tables.

## Commands & output shapes

### Home (no args)
```
engine: postgres
server: localhost:5432/app (user app_ro)
tables: 7 (~4210 rows est.)
largest[5]{table,rows}:
  events,3800
  users,210
help[2]:
  Run `db-axi schema <table>` for columns, keys, and indexes
  Run `db-axi query "select ..."` to run a read-only query
```

### `databases`
Lists databases (pg/mysql) or schemas (oracle): `databases[N]{name,tables}` + help.

### `tables`
`tables[N]{table,rows,columns}` + total `count` + next-step help. Empty → `"0 tables ..."`.

### `schema <table>`
`columns[N]{name,type,nullable,pk,default}`, optional `indexes`, `foreignKeys`, `rows` estimate.
Unknown table → `NOT_FOUND` suggesting `db-axi tables`.

### `sample <table> [--limit 10] [--full]`
`SELECT *` capped peek: `count: "5 of ~210 rows"` + tabular rows.

### `query "<sql>" [--limit 50] [--full]`
Validated read-only SELECT/EXPLAIN; `rows: "N (complete|capped, more rows available)"` +
`result[...]`. Unsafe column names fall back to a row-object form (same rule as the reference).

## Errors (see ADR 0004)

| Situation | Code | Exit |
| --- | --- | --- |
| Engine cannot be determined | `ENGINE_AMBIGUOUS` | 2 |
| Required driver not installed | `DRIVER_MISSING` | 1 |
| Missing host/user etc. | `VALIDATION_ERROR` | 2 |
| Connection/auth failure | `CONNECTION_ERROR` | 1 |
| Unknown database/schema/table | `NOT_FOUND` | 1 |
| Non-read-only or multi-statement SQL | `READ_ONLY` | 2 |
| SQL syntax/execution error | `QUERY_ERROR` | 1 |

Errors are structured TOON on stdout with an actionable `help` line; passwords and raw driver
stack traces never leak.

## Ambient context

`db-axi setup hooks` installs SessionStart hooks (Claude Code, Codex, OpenCode) that print the
home snapshot when a connection is resolvable from the environment. `SKILL.md` is the on-demand
secondary path (`npx skills add <repo> --skill db-axi`).

## Out of scope (v1)

Writes, `WITH`/CTEs, transactions, multiple simultaneous connections, SSL/SSH-tunnel option
matrices beyond what drivers accept via URL, and live-DB integration tests in the default suite.
