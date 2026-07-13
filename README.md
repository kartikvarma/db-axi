# db-axi

AXI-compliant database CLI for PostgreSQL, MySQL, and Oracle. Built for autonomous agents and humans alike, following the [Agent eXperience Interface (AXI)](https://axi.md) principles.

## Features

- **Token-efficient TOON output** — ~40% token savings over JSON.
- **Multi-engine** — Supports PostgreSQL, MySQL, and Oracle.
- **Read-only by design** — Enforced at the driver and statement level.
- **Agent-friendly** — Structured errors, ambient context via session hooks, and a built-in SKILL.

## Installation

```bash
npm install -g db-axi
```

## Connection

`db-axi` resolves connections in the following order:
1. Flags: `--engine`, `--host`, `--port`, `--user`, `--password`, `--database`.
2. Connection URL: `--url` or as the first positional argument.
3. Environment variables: `DATABASE_URL`, or dialect-specific families (`PG*`, `MYSQL_*`, `ORACLE_*`).

## Commands

- `db-axi home` — Show connection summary and tables.
- `db-axi databases` — List databases/schemas.
- `db-axi tables` — List tables.
- `db-axi schema <table>` — Show table columns, indexes, and FKs.
- `db-axi sample <table>` — Show 10 sample rows.
- `db-axi query "<sql>"` — Execute a read-only query.

## Agent Integration

`db-axi` provides a SKILL for agents to use. To install the session hooks:

```bash
db-axi setup hooks
```

This will inject ambient database context into your agent's session.

## License

MIT
