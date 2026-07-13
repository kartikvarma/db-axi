# ADR 0002: Multi-Engine Driver Abstraction with Lazy, Optional Drivers

- **Status:** Proposed
- **Date:** 2026-06-28
- **Deciders:** project owner

## Context

Unlike `sqlite-axi` (one embedded engine), `db-axi` targets **MySQL**, **PostgreSQL**, and
**Oracle** over the network. Each engine has a different driver, wire protocol, SQL dialect,
and system-catalog layout. The owner also asked that the tool "auto find the respective
database client if possible" — i.e. use whichever driver is present without forcing all of
them to be installed.

Driver characteristics that constrain us:

- `pg` (PostgreSQL) and `mysql2` (MySQL) are pure-JS / easily installable.
- `oracledb` is a native add-on and historically may require Oracle Instant Client; its
  install can fail on some platforms.

## Decision

- Define a narrow **engine adapter interface** (`Engine` + `Connection`) in
  `src/engines/types.ts`. All command code depends only on this interface.
- Implement one adapter per engine: `postgres.ts`, `mysql.ts`, `oracle.ts`.
- Declare `pg`, `mysql2`, `oracledb` as **`optionalDependencies`** and **lazy-load** each
  driver via dynamic `import()` only when its engine is actually used.
- A central `getEngine(name)` resolves the adapter; `installedEngines()` reports which
  drivers can be loaded (used for engine inference and diagnostics).
- If a required driver is missing, throw `AxiError("DRIVER_MISSING")` with the exact
  `npm install` command — never a raw module-not-found stack trace.

## Rationale

- **"Auto find the client."** Lazy loading + `installedEngines()` lets the tool discover and
  use whatever driver is present, and infer the engine when only one is installed.
- **Resilient install.** `optionalDependencies` means a failed `oracledb` build does not
  break installation; MySQL/Postgres users are unaffected.
- **Isolation of dialects.** Each adapter owns its catalog queries and quoting rules, so
  dialect differences never leak into shared command logic.

## Consequences

- The metadata contract in `types.ts` must be expressive enough for all three catalogs
  (databases/schemas, tables, columns, indexes, foreign keys, row-count estimates).
- "Database" maps cleanly to MySQL/Postgres databases but to a **schema/user** in Oracle;
  this mapping is documented in the adapter and help text.
- Tests for pure logic (validator, formatting, inference) need no live DB; full adapter
  behavior requires integration tests against real servers (gated, out of v1 unit scope).

## Alternatives considered

- **Bundle all drivers as hard `dependencies`.** Simpler resolution, but a flaky
  `oracledb` build would break every install. Rejected in favor of optional + lazy.
- **A single generic driver (e.g. an ODBC bridge).** Adds a heavy native dependency and
  weaker dialect fidelity. Rejected.
