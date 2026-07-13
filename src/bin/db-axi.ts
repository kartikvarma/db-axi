#!/usr/bin/env node
import { encode } from '@toon-format/toon';
import { runAxiCli, AxiError, installSessionStartHooks } from 'axi-sdk-js';
import { parseFlags } from '../args.js';
import { resolveConnection } from '../connection.js';
import { getEngine, installedEngines } from '../engines/index.js';
import { redactString } from '../redact.js';
import { TOP_LEVEL_HELP, COMMAND_HELP } from '../help.js';
import { homeCommand } from '../home.js';
import { databasesCommand } from '../commands/databases.js';
import { tablesCommand } from '../commands/tables.js';
import { schemaCommand } from '../commands/schema.js';
import { sampleCommand } from '../commands/sample.js';
import { queryCommand } from '../commands/query.js';
import { toConnectionError } from '../engines/errors.js';

/** Usage / client errors → exit 2. Operational errors → exit 1. */
const USAGE_CODES = new Set(['VALIDATION_ERROR', 'READ_ONLY', 'ENGINE_AMBIGUOUS']);

function formatError(error: unknown): { output: string; exitCode: number } {
  if (error instanceof AxiError) {
    const out: Record<string, unknown> = {
      error: redactString(error.message),
      code: error.code,
    };
    if (error.suggestions.length > 0) {
      out.help = error.suggestions.map((s) => redactString(s));
    }
    return {
      output: `${encode(out)}\n`,
      exitCode: USAGE_CODES.has(error.code) ? 2 : 1,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    output: `${encode({ error: redactString(message), code: 'UNKNOWN' })}\n`,
    exitCode: 1,
  };
}

async function main() {
  await runAxiCli({
    description: 'AXI-compliant database CLI',
    version: '0.1.0',
    topLevelHelp: TOP_LEVEL_HELP,
    getCommandHelp: (cmd) => COMMAND_HELP[cmd] ?? null,
    // Default when no subcommand is given; also registered below so `db-axi home` works.
    home: wrap(homeCommand),
    formatError,
    commands: {
      home: wrap(homeCommand),
      databases: wrap(databasesCommand),
      tables: wrap(tablesCommand),
      schema: wrap(schemaCommand),
      sample: wrap(sampleCommand),
      query: wrap(queryCommand),
      setup: async (args) => {
        if (args[0] !== 'hooks') {
          throw new AxiError('unknown setup command', 'VALIDATION_ERROR', ['db-axi setup hooks']);
        }
        installSessionStartHooks({ marker: 'db-axi', binaryNames: ['db-axi'] });
        return { setup: 'hooks installed' };
      },
    },
  });
}

/**
 * axi-sdk-js calls handlers as `(args: string[], context?)`.
 * Parse flags from raw args before resolving the connection.
 */
function wrap(handler: Function) {
  return async (args: string[] = []) => {
    const { flags, positionals } = parseFlags(args, ['full']);
    const installed = installedEngines();
    const { config, rest } = resolveConnection(positionals, flags, process.env, installed);
    const engine = await getEngine(config.engine);
    let conn;
    try {
      conn = await engine.connect(config);
    } catch (err) {
      throw toConnectionError(err);
    }
    try {
      if (handler === homeCommand) {
        return await handler(conn, config, flags);
      }
      // databases/tables take (conn, flags) — no required positional
      if (handler === databasesCommand || handler === tablesCommand) {
        return await handler(conn, flags);
      }
      // schema/sample/query take (conn, positional, flags)
      return await handler(conn, rest[0], flags);
    } finally {
      await conn.close();
    }
  };
}

main().catch((err) => {
  const { output, exitCode } = formatError(err);
  process.stdout.write(output);
  process.exit(exitCode);
});
