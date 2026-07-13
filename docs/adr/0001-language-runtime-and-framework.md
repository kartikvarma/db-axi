# ADR 0001: Language, Runtime, and Framework

- **Status:** Proposed
- **Date:** 2026-06-28
- **Deciders:** project owner

## Context

`db-axi` is an [AXI](https://github.com/kunchenguid/axi) (Agent eXperience Interface): an
agent-native CLI that inspects and queries relational databases read-only and emits
token-efficient output. It is explicitly modeled after
[`sqlite-axi`](https://github.com/SSBrouhard/sqlite-axi), which is built in TypeScript on
the `axi-sdk-js` framework and emits [TOON](https://toonformat.dev).

We need to choose the implementation language, runtime, output format, and CLI framework.

## Decision

- **Language/runtime:** TypeScript on Node.js `>=20`, ESM (`"type": "module"`,
  `module`/`moduleResolution: NodeNext`).
- **CLI framework:** `axi-sdk-js` (`runAxiCli` for dispatch/help, `AxiError` for structured
  errors + exit codes, `installSessionStartHooks` for ambient context, built-in `update`).
- **Output format:** TOON via `@toon-format/toon` (`encode`). No `--json` mode in v1.
- **Tooling:** `tsc` for build, `tsx` for dev, `vitest` for tests.

## Rationale

- **Parity with the reference.** Reusing the exact stack (`axi-sdk-js` + TOON) means the
  AXI principles — token-efficient output, structured errors/exit codes, ambient context,
  consistent help — come from the framework instead of being re-implemented.
- **TOON token savings.** ~40% fewer tokens than JSON for the uniform arrays of objects
  that dominate this tool's output (table lists, column lists, query result rows).
- **Node ecosystem drivers.** Mature, well-maintained drivers exist for all three engines
  (`pg`, `mysql2`, `oracledb`), so a Node implementation can reach every target engine.
- **Single-language surface.** One language for CLI, drivers, and tests keeps the codebase
  small and the contributor onboarding identical to `sqlite-axi`.

## Consequences

- The codebase mirrors `sqlite-axi`'s module layout, easing review and future shared work.
- Commands are **async** (network drivers are promise-based), unlike `sqlite-axi`'s
  synchronous `better-sqlite3`. `runAxiCli` already supports `MaybePromise` handlers.
- We inherit `axi-sdk-js`'s reserved `update` command and its hook installer for free.
- Node `>=20` is required (matches the SDK and modern driver baselines).

## Alternatives considered

- **Python / Go.** Both have solid drivers, but neither can reuse `axi-sdk-js` or the
  TOON encoder, forcing a re-implementation of the AXI plumbing and diverging from the
  reference we are asked to model after. Rejected.
