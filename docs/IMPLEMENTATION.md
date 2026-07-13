# db-axi — Implementation Notes

**Date:** 2026-06-28
**Status:** Draft for review

Concrete contracts and dialect specifics for the modules in `DESIGN.md`. This is the reference
an implementer follows; nothing here is built until the docs are approved.

## Types (`src/engines/types.ts`)

```ts
export type EngineName = "postgres" | "mysql" | "oracle";

export interface ConnectionConfig {
  engine: EngineName;
  host: string;
  port: number;
  user: string;
  password?: string;
  database?: string;
}

export interface DatabaseInfo { name: string; tables: number; }
export interface TableInfo { name: string; rows: number; columns: number; } // rows = estimate
export interface ColumnInfo { name: string; type: string; nullable: number; pk: number; default: string; }
export interface IndexInfo { name: string; unique: number; columns: string; }
export interface ForeignKey { column: string; references: string; }
export interface QueryResult { columnNames: string[]; rows: unknown[][]; capped: boolean; }

export interface Connection { /* methods listed in DESIGN.md */ }
export interface Engine { name: EngineName; connect(c: ConnectionConfig): Promise<Connection>; }
```

## `src/connection.ts` contract

```ts
export const DEFAULT_PORTS: Record<EngineName, number> = { postgres: 5432, mysql: 3306, oracle: 1521 };

export function inferEngine(input: {
  engineFlag?: string; urlScheme?: string; port?: number; envFamily?: EngineName;
  installed: EngineName[];
}): EngineName;                                  // throws AxiError ENGINE_AMBIGUOUS

export function resolveConnection(
  positionals: string[],
  flags: Record<string, string | boolean>,
  env: NodeJS.ProcessEnv,
  installed: EngineName[],
): { config: ConnectionConfig; rest: string[] }; // throws VALIDATION_ERROR on missing host/user
```

URL parsing accepts `scheme://[user[:password]@]host[:port][/database]`. Scheme aliases:
`postgresql`→postgres, `mariadb`→mysql. Missing host defaults to `localhost`; missing port to
`DEFAULT_PORTS[engine]`.

## `src/env.ts` contract

```ts
export interface EnvConn { engine?: EngineName; host?; port?; user?; password?; database?; url?; }
export function readEnv(env: NodeJS.ProcessEnv): EnvConn; // merges DATABASE_URL + PG*/MYSQL_*/ORACLE_*
```

Family precedence when several are present: the family matching an already-known engine wins;
otherwise `DATABASE_URL` first, then PG, MYSQL, ORACLE (deterministic, documented).

## `src/validate.ts` contract

`validateReadOnly(sql: string): void` — ports the reference's comment-stripping and
quote/comment-aware single-statement scan, then accepts only `SELECT ...` and
`EXPLAIN [ (...) | PLAN FOR ] SELECT ...`. Throws `AxiError` with code `VALIDATION_ERROR`
(empty input) or `READ_ONLY` (disallowed statement). Quote handling covers `'...'`, `"..."`,
and backtick (MySQL) identifiers.

## `src/format.ts` contract

`renderCell(value, full=false)`: `null/undefined`→`""`; `Buffer`/`Uint8Array`→`<blob N bytes>`;
`Date`→ISO string; `bigint`→string; numbers stay numeric; everything else `String()`, truncated
to 200 chars with ` …` unless `full`. `buildRows(columnNames, rows, full, key="rows")`: tabular
TOON when all names are safe (`/^[A-Za-z_][A-Za-z0-9_]*$/`) and unique, else `columns` index map
+ `c0..cN` row objects (identical fallback to the reference).

## Dialect-specific metadata queries

All catalog reads are parameterized SELECTs (bypass the validator). Examples:

### PostgreSQL (`pg`)
- read-only: `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`
- databases: `SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY 1`
- tables + est: `SELECT relname, reltuples::bigint FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema')`
- columns: `information_schema.columns` (+ `pg_index`/`pg_attribute` for pk)
- indexes: `pg_indexes` / `pg_index`; FKs: `information_schema` key-usage views
- sample/query limit: `LIMIT $1`

### MySQL (`mysql2`)
- read-only: `SET SESSION TRANSACTION READ ONLY`
- databases: `information_schema.schemata` (exclude `mysql`,`sys`,`performance_schema`,`information_schema`)
- tables + est: `SELECT table_name, table_rows FROM information_schema.tables WHERE table_schema = ?`
- columns/indexes/FKs: `information_schema.columns` / `statistics` / `key_column_usage`
- sample/query limit: `LIMIT ?`

### Oracle (`oracledb`)
- read-only: `SET TRANSACTION READ ONLY`
- "databases" = schemas: `SELECT username FROM all_users ORDER BY 1`
- tables + est: `SELECT table_name, num_rows FROM user_tables` (or `all_tables` for a schema)
- columns: `user_tab_columns` (+ `user_constraints`/`user_cons_columns` for pk/fk)
- indexes: `user_indexes` / `user_ind_columns`
- sample/query limit: `FETCH FIRST :n ROWS ONLY` (12c+); identifiers quoted with `"`

Identifier quoting helper per adapter: double the engine's quote char and wrap
(`"x""y"` for pg/oracle, backtick for mysql). Names are validated against the catalog first.

## Errors & exit codes

`AxiError(message, code, suggestions[])`. `formatError` in `bin/db-axi.ts` maps usage codes
(`VALIDATION_ERROR`, `READ_ONLY`, `ENGINE_AMBIGUOUS`) → exit 2, everything else → exit 1, success
→ 0. Suggestions are passed through `redact.ts`.

## Build / run / test

- `npm install` (oracledb may warn if it can't build — that is acceptable, ADR 0002).
- `npm run build` → `tsc` → `dist/`. `npm run dev -- <cmd> ...` via `tsx`.
- `npm test` → vitest over `test/**/*.test.ts` (pure modules only by default).
- Bin: `dist/bin/db-axi.js` (`"bin": { "db-axi": ... }`).

## Security notes

- Passwords: accepted via flag/URL/env; never written to stdout, errors, suggestions, or logs.
  `redact.ts` masks `password`/`pwd` and the userinfo segment of any URL before display.
- Connection strings shown in `home`/errors use the redacted form (`user:***@host`).
- All user-supplied values are bound parameters; table names validated then quoted, never
  string-concatenated into SQL.
