# db-axi — Implementation Plan

**Date:** 2026-06-28
**Status:** Draft for review (no code until approved)

This plan sequences the build described in `DESIGN.md` and the ADRs. Each phase is independently
reviewable and leaves the tree in a compiling, testable state.

## Phase 0 — Scaffolding

- `package.json` (deps: `axi-sdk-js`, `@toon-format/toon`; optionalDeps: `pg`, `mysql2`,
  `oracledb`; dev: `typescript`, `tsx`, `vitest`, `@types/node`, `@types/pg`).
- `tsconfig.json` (NodeNext, ES2022, strict — same as reference), `vitest.config.ts`,
  `.gitignore`, `LICENSE` (MIT).
- **Exit criteria:** `npm install` succeeds; empty `tsc`/`vitest` run clean.

## Phase 1 — Pure core (no DB needed)

- `src/args.ts` — `parseFlags`, `parseLimit`, `flagString` (ported from reference).
- `src/redact.ts` — redact passwords in any user-facing string / URL.
- `src/format.ts` — `renderCell`, `isSafeFieldName`, `buildRows` (ported + extended for
  driver value types: Date, Buffer, bigint, Decimal-as-string).
- `src/validate.ts` — dialect-aware read-only allowlist (ADR 0004).
- `src/env.ts` — parse env families + `DATABASE_URL` into partial configs.
- `src/connection.ts` — `inferEngine`, `resolveConnection`, default ports.
- **Tests:** `args`, `validate`, `format`, `connection` (inference + merge + redaction).
- **Exit criteria:** all Phase-1 unit tests pass; 100% of inference/validation branches covered.

## Phase 2 — Engine abstraction + adapters

- `src/engines/types.ts` — `Engine`, `Connection`, metadata DTOs, `EngineName`.
- `src/engines/index.ts` — `getEngine(name)` (lazy `import()`), `installedEngines()`,
  `DRIVER_MISSING` mapping (which npm package to install per engine).
- `src/engines/postgres.ts`, `mysql.ts`, `oracle.ts` — connect + read-only session +
  catalog queries + `sample`/`query` (fetch `limit+1`).
- **Tests:** unit-test the catalog SQL builders / row mappers where they are pure; live-DB
  behavior verified manually and via optional gated integration tests (see Testing).
- **Exit criteria:** `tsc` clean; manual smoke against at least one local engine.

## Phase 3 — Commands, home, help, bin

- `src/commands/{databases,tables,schema,sample,query}.ts` — async transforms.
- `src/home.ts` — snapshot when a connection resolves; otherwise a definitive empty/help state.
- `src/help.ts` — `TOP_LEVEL_HELP` + `COMMAND_HELP` per subcommand.
- `src/bin/db-axi.ts` — `runAxiCli` wiring, `formatError`, `setup hooks`.
- **Tests:** `help` completeness (every command has help); command arg-validation paths.
- **Exit criteria:** `db-axi --help`, each `<cmd> --help`, and error paths render valid TOON.

## Phase 4 — Agent integration + docs

- `.agents/skills/db-axi/SKILL.md`, `README.md` (install, usage, read-only guarantee,
  connection/env reference, agent integration).
- **Exit criteria:** SKILL frontmatter valid; README examples match actual output.

## Phase 5 — Hardening

- Error-message audit (no password/stack leakage), exit-code matrix verified, empty-state
  strings verified, large-cell truncation + `--full` verified.

## File-by-file size budget

Each source file targets < ~150 lines (adapters may split helpers into the same file or a
small `engines/sql.ts` if needed). Matches the reference's small-module style.

## Testing strategy

- **Default suite (no DB):** vitest over pure modules — `args`, `validate`, `format`,
  `connection`/`env` inference + redaction, `help`. This is the gate for CI and review.
- **Integration (optional, gated):** opt-in tests behind env flags (e.g. `DBAXI_IT_PG_URL`)
  run real catalog/query calls against local Docker engines. Not required for v1 sign-off.
- Rationale: pure logic (inference, validation, formatting) is where bugs hide and needs no
  server; adapter SQL is best verified against real engines, kept out of the default gate.

## Risks & mitigations

- **`oracledb` install/runtime** (native, Instant Client): optional dependency + lazy load +
  `DRIVER_MISSING` guidance; Oracle remains usable when present, never blocks others.
- **Row-count cost on large tables:** use catalog estimates, label as `~est.`.
- **Dialect drift in EXPLAIN/identifiers:** isolate in adapters + validator; cover with tests.
- **Oracle "database" semantics:** documented as schema/user mapping in help + SKILL.

## Open questions for review

1. Oracle "database" = schema/user mapping acceptable, or prefer PDB/service listing?
2. Short flag aliases (`-h/-u/-p`) wanted, or long-only like the reference? (`-h` clashes with
   help conventions — plan is long-only.)
3. Keep `WITH`/CTEs excluded in v1 (matches sqlite-axi), or allow `WITH ... SELECT`?
4. Should `--limit` hard max stay 1000 (reference parity) for remote engines?
