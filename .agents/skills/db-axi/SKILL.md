---
name: db-axi
description: AXI-compliant database CLI for PostgreSQL, MySQL, and Oracle. Use for inspecting schemas and querying data read-only.
---

# db-axi

Autonomous agents use `db-axi` to interact with relational databases. It follows AXI principles: token-efficient TOON output, structured errors, and ambient context.

## Core Commands

### `db-axi home`
Always start here if you don't know the schema. It provides a connection summary and lists available tables.

### `db-axi schema <table_name>`
Use this to understand the columns, types, and relationships of a specific table.

### `db-axi query "<sql>"`
Execute read-only SQL. Always include a `LIMIT` clause unless you are sure of the result size. `db-axi` clamps results to 1000 rows.

## Read-Only Guarantee
`db-axi` only allows `SELECT` and `EXPLAIN` statements. It will reject `INSERT`, `UPDATE`, `DELETE`, `DROP`, etc., even if the database user has permissions.

## Connection Resolution
`db-axi` automatically picks up credentials from environment variables:
- **Postgres**: `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`
- **MySQL**: `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`
- **Oracle**: `ORACLE_HOST`, `ORACLE_PORT`, `ORACLE_USER`, `ORACLE_PASSWORD`, `ORACLE_DATABASE`
- **Generic**: `DATABASE_URL`

If multiple are present, it tries to infer the engine from the URL scheme or default ports. Use `--engine` to disambiguate.
