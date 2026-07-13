# db-axi

AXI-compliant database CLI for PostgreSQL, MySQL, and Oracle. Built for autonomous agents and humans alike, following the [Agent eXperience Interface (AXI)](https://axi.md) principles.

## Features

- **Token-efficient TOON output** — ~40% token savings over JSON.
- **Multi-engine** — Supports PostgreSQL, MySQL, and Oracle.
- **Read-only by design** — Enforced at the session and statement level.
- **Agent-friendly** — Structured errors, ambient context via session hooks, and a built-in SKILL.

## Installation

```bash
npm install -g db-axi
# or from this repo:
npm install && npm run build
npm link   # optional: puts `db-axi` on your PATH
```

## Connection

`db-axi` resolves connections in the following order:

1. Flags: `--engine`, `--host`, `--port`, `--user`, `--password`, `--database`.
2. Connection URL: `--url` or a positional URL (`scheme://...`).
3. Environment variables: `DATABASE_URL`, or dialect-specific families (`PG*`, `MYSQL_*`, `ORACLE_*`).

Examples:

```bash
db-axi home --url 'postgresql://app:app@localhost:5432/appdb'
db-axi tables --url 'mysql://app:app@localhost:3306/appdb'
db-axi query 'select 1' --engine postgres --host localhost --user app --password app --database appdb
```

## Commands

| Command | Purpose |
|---------|---------|
| `db-axi` / `db-axi home` | Connection summary, table count, largest tables |
| `db-axi databases` | List databases (or Oracle schemas) |
| `db-axi tables` | List tables with estimated rows/columns |
| `db-axi schema <table>` | Columns, indexes, and foreign keys |
| `db-axi sample <table>` | Peek rows (`--limit`, default 10, max 100) |
| `db-axi query "<sql>"` | Read-only SQL (`--limit`, default 100, max 1000) |
| `db-axi setup hooks` | Install agent SessionStart hooks |

Global flags include `--full` (no cell truncation) and the connection flags above.

### Example output (TOON)

```text
$ db-axi home --url 'postgresql://app:app@localhost:5432/appdb'
engine: postgres
server: "localhost:5432/appdb (user app)"
urlRedacted: "postgres://app:***@localhost:5432/appdb"
tables: 1 (~0 rows est.)
largest[1]{table,rows}:
  users,0
help[2]: "Run `db-axi schema <table>` for columns, keys, and indexes","Run `db-axi query \"select ...\"` to run a read-only query"

$ db-axi schema users --url 'postgresql://app:app@localhost:5432/appdb'
table: users
columns[3]{name,type,nullable,pk,default}:
  id,integer,0,1,"nextval('users_id_seq'::regclass)"
  name,text,0,0,""
  email,text,1,0,""
indexes[2]{name,unique,columns}:
  users_email_key,1,email
  users_pkey,1,id
foreignKeys: []
help[2]: ...

$ db-axi sample users --url 'postgresql://app:app@localhost:5432/appdb'
table: users
rows: 2 (complete)
sample[2]{id,name,email}:
  1,alice,alice@example.com
  2,bob,bob@example.com

$ db-axi query 'select id, name from users' --url 'postgresql://app:app@localhost:5432/appdb'
rows: 2 (complete)
result[2]{id,name}:
  1,alice
  2,bob
```

Row counts on `home` / `tables` are **catalog estimates** (may be `0` until the engine has statistics, e.g. after `ANALYZE` on Postgres).

## Read-only guarantee

Only `SELECT` and `EXPLAIN … SELECT` (including Postgres `EXPLAIN (…)` / `EXPLAIN ANALYZE`, and Oracle `EXPLAIN PLAN FOR SELECT`) are accepted. Mutations and multi-statement input are rejected with code `READ_ONLY`. Sessions are also opened read-only at the driver level.

## Agent integration

SKILL: `.agents/skills/db-axi/SKILL.md`

```bash
db-axi setup hooks
```

Installs SessionStart hooks that can print the home snapshot when connection env vars resolve.

## Development

```bash
npm install
npm test          # pure unit tests (no database required)
npm run lint
npm run build
npm run dev -- home --url 'postgresql://app:app@localhost:5432/appdb'
```

### Optional integration tests

Against live engines (e.g. Podman):

```bash
# Postgres + MySQL examples
export DBAXI_IT_PG_URL='postgresql://app:app@localhost:5432/appdb'
export DBAXI_IT_MYSQL_URL='mysql://app:app@localhost:3306/appdb'
npm test
```

If those env vars are unset, integration suites are skipped.

## License

MIT
